import { prunePseudoAttachments } from "./asset-cleanup";
import { extractConversation } from "./extractor";
import type { AssetRef, ConversationExport, ExtractResponse, ExtractionOptions } from "../shared/types";

declare global {
  interface Window { __chatgptExporterInstalled?: boolean; }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read downloaded asset."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function embedRemoteAttachments(data: ConversationExport): Promise<void> {
  const resolved = new Map<string, Pick<AssetRef, "dataUrl" | "mimeType" | "status">>();

  for (const asset of data.assets) {
    if (asset.kind !== "attachment" || asset.dataUrl || !/^https?:/i.test(asset.url)) continue;
    try {
      const response = await fetch(asset.url, { credentials: "include" });
      if (!response.ok) continue;
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      asset.dataUrl = dataUrl;
      asset.mimeType = blob.type || asset.mimeType;
      asset.status = "embedded";
      resolved.set(`${asset.kind}:${asset.url}`, { dataUrl, mimeType: asset.mimeType, status: "embedded" });
    } catch {
      // Cross-origin or access-controlled attachments stay as URL references.
    }
  }

  if (!resolved.size) return;
  for (const message of data.messages) {
    for (const asset of message.assets) {
      const embedded = resolved.get(`${asset.kind}:${asset.url}`);
      if (embedded) Object.assign(asset, embedded);
    }
  }

  const unresolved = data.assets.filter((asset) => asset.status !== "embedded");
  data.diagnostics.warnings = data.diagnostics.warnings.filter((warning) => !warning.startsWith("Some assets could not be embedded locally"));
  if (unresolved.length) {
    data.diagnostics.warnings.push("Some assets could not be embedded locally; their original URLs are preserved.");
  }
}

if (!window.__chatgptExporterInstalled) {
  window.__chatgptExporterInstalled = true;
  chrome.runtime.onMessage.addListener((request: { type?: string; options?: ExtractionOptions }, _sender, sendResponse) => {
    if (request?.type !== "CGE_EXTRACT") return false;
    (async () => {
      try {
        const options = request.options || {
          loadAll: true,
          includeReasoning: true,
          includeTools: true,
          includeTimestamps: true,
          captureImages: true
        };
        const data = await extractConversation(options);
        const pruned = prunePseudoAttachments(data);
        if (pruned) {
          data.diagnostics.warnings.push(`Filtered ${pruned} redundant or status-like UI asset record(s).`);
        }
        if (options.captureImages) await embedRemoteAttachments(data);
        sendResponse({ ok: true, data } satisfies ExtractResponse);
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ExtractResponse);
      }
    })();
    return true;
  });
}
