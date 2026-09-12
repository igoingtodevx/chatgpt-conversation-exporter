import { strToU8, zipSync } from "fflate";
import type { AssetRef, ConversationExport } from "../shared/types";
import { exportJson } from "./json";
import { exportMarkdown } from "./markdown";
import { exportHtml } from "./html";
import { exportPdf } from "./pdf";

function extFromAsset(asset: AssetRef): string {
  const mime = asset.mimeType || asset.dataUrl?.match(/^data:([^;,]+)/)?.[1] || "";
  const known: Record<string, string> = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
    "application/pdf": ".pdf", "application/zip": ".zip", "text/plain": ".txt", "text/markdown": ".md",
    "application/json": ".json"
  };
  if (known[mime]) return known[mime];
  if (asset.url) {
    try {
      const path = new URL(asset.url).pathname;
      const match = path.match(/\.[a-z0-9]{1,8}$/i);
      if (match) return match[0].toLowerCase();
    } catch { /* no-op */ }
  }
  if (asset.name) {
    const match = asset.name.match(/\.[a-z0-9]{1,8}$/i);
    if (match) return match[0].toLowerCase();
  }
  return asset.kind === "image" ? ".bin" : ".dat";
}

function bytesFromDataUrl(dataUrl: string): Uint8Array | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  try {
    if (match[2]) {
      const binary = atob(match[3]);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(match[3]));
  } catch {
    return null;
  }
}

function archiveCopy(data: ConversationExport): { data: ConversationExport; files: Record<string, Uint8Array> } {
  const copy = structuredClone(data) as ConversationExport;
  const files: Record<string, Uint8Array> = {};
  let counter = 0;
  for (const asset of copy.assets) {
    counter += 1;
    if (!asset.dataUrl) continue;
    const bytes = bytesFromDataUrl(asset.dataUrl);
    if (!bytes) continue;
    const path = `assets/${String(counter).padStart(3, "0")}-${asset.kind}${extFromAsset(asset)}`;
    files[path] = bytes;
    asset.dataUrl = undefined;
    (asset as AssetRef & { localPath?: string }).localPath = path;
  }
  for (const message of copy.messages) {
    message.assets = message.assets.map((messageAsset) => {
      const global = copy.assets.find((asset) => asset.url === messageAsset.url && asset.kind === messageAsset.kind && (asset.url || asset.name === messageAsset.name));
      return global ? { ...messageAsset, ...global } : messageAsset;
    });
  }
  return { data: copy, files };
}

export async function exportArchive(data: ConversationExport, complete: boolean): Promise<Uint8Array> {
  const archived = archiveCopy(data);
  const unresolved = data.assets
    .filter((asset) => asset.status !== "embedded")
    .map((asset) => asset.url || asset.name || asset.id);
  const files: Record<string, Uint8Array> = {
    ...archived.files,
    "chat.json": strToU8(exportJson(archived.data)),
    "chat.md": strToU8(exportMarkdown(archived.data)),
    "manifest.json": strToU8(JSON.stringify({
      schemaVersion: data.schemaVersion,
      exportedAt: data.conversation.exportedAt,
      title: data.conversation.title,
      sourceUrl: data.conversation.url,
      visibleMessages: data.messages.length,
      toolTraceEvents: data.toolTrace.length,
      assets: data.assets.length,
      unresolvedAssets: unresolved,
      files: complete ? ["chat.json", "chat.md", "chat.html", "chat.pdf", "assets/"] : ["chat.json", "chat.md", "assets/"]
    }, null, 2))
  };

  if (complete) {
    files["chat.html"] = strToU8(exportHtml(data));
    files["chat.pdf"] = await exportPdf(data);
  }
  return zipSync(files, { level: 6 });
}
