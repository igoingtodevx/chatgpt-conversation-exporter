import type { AssetRef, ConversationMessage, ToolTraceEvent } from "../shared/types";
import { normalizeWhitespace, uniqueBy } from "../shared/utils";

const VISIBLE_CONTENT_TYPES = new Set(["text", "multimodal_text", "code"]);
const HIDDEN_FLAGS = ["is_visually_hidden_from_conversation", "is_hidden", "hidden", "is_redacted"];
const FILE_NAME_PATTERN = /\.(zip|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|ya?ml|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|go|rs|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov)\b/i;
const IMAGE_NAME_PATTERN = /\.(png|jpe?g|webp|gif|svg)\b/i;

export interface MetadataMessage {
  id?: string;
  create_time?: unknown;
  end_turn?: boolean | null;
  recipient?: string | null;
  author?: {
    role?: string;
    name?: string | null;
    metadata?: Record<string, unknown>;
  };
  content?: {
    content_type?: string;
    parts?: unknown[];
    text?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface MetadataNode {
  id?: string;
  parent?: string | null;
  message?: MetadataMessage | null;
}

export interface MetadataConversation {
  title?: string;
  current_node?: string;
  mapping?: Record<string, MetadataNode>;
}

export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(raw)
    ? new Date(raw < 1e12 ? raw * 1000 : raw)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function selectedMetadataPath(metadata: MetadataConversation): Array<[string, MetadataNode]> {
  const mapping = metadata.mapping || {};
  const current = metadata.current_node;
  if (!current || !mapping[current]) return [];
  const path: Array<[string, MetadataNode]> = [];
  const seen = new Set<string>();
  let id: string | undefined = current;
  while (id && mapping[id] && !seen.has(id)) {
    seen.add(id);
    path.push([id, mapping[id]]);
    id = mapping[id].parent || undefined;
  }
  return path.reverse();
}

function objectPartText(value: Record<string, unknown>): string {
  for (const key of ["text", "content", "name", "filename", "file_name", "title"]) {
    if (typeof value[key] === "string" && value[key]) return String(value[key]);
  }
  return "";
}

export function metadataText(node: MetadataNode): string {
  const content = node.message?.content;
  if (!content) return "";
  if (typeof content.text === "string") return normalizeWhitespace(content.text);
  if (!Array.isArray(content.parts)) return "";
  return normalizeWhitespace(content.parts.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object") return objectPartText(part as Record<string, unknown>);
    return "";
  }).filter(Boolean).join("\n\n"));
}

function isHidden(raw: MetadataMessage): boolean {
  return Boolean(raw.metadata && HIDDEN_FLAGS.some((key) => raw.metadata?.[key] === true));
}

function normalizedRecipient(raw: MetadataMessage): string | null {
  const recipient = typeof raw.recipient === "string" ? raw.recipient.trim() : "";
  return recipient || null;
}

export function isVisibleConversationMessage(raw: MetadataMessage | null | undefined): boolean {
  if (!raw || isHidden(raw)) return false;
  const role = raw.author?.role;
  if (role !== "user" && role !== "assistant") return false;
  const contentType = raw.content?.content_type;
  if (contentType && !VISIBLE_CONTENT_TYPES.has(contentType)) return false;
  if (role === "assistant") {
    const recipient = normalizedRecipient(raw);
    if (recipient && recipient !== "all") return false;
    const name = raw.author?.name?.trim();
    if (name && name !== "assistant") return false;
  }
  return Boolean(metadataText({ message: raw }));
}

function firstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof value[key] === "string" && String(value[key]).trim()) return String(value[key]).trim();
  }
  return "";
}

function metadataAssetFromObject(value: Record<string, unknown>, fallbackId: string): AssetRef | null {
  const fileName = firstString(value, ["filename", "file_name"]);
  const genericName = firstString(value, ["name", "display_name"]);
  const title = firstString(value, ["title"]);
  const downloadUrl = firstString(value, ["download_url", "downloadUrl", "asset_url", "assetUrl"]);
  const genericUrl = firstString(value, ["url", "href"]);
  const sandboxPath = firstString(value, ["sandbox_path", "sandboxPath"]);
  const pointer = firstString(value, ["asset_pointer", "assetPointer", "file_id", "fileId"]);
  const mimeType = firstString(value, ["mime_type", "mimeType", "mimetype"]);
  const objectType = firstString(value, ["type", "kind", "content_type"]);

  // Do not promote arbitrary metadata objects merely because their title/URL happens
  // to end in a file-like extension (for example web-search results for README.md).
  // Require at least one attachment-specific signal first.
  const hasStrongFileSignal = Boolean(
    fileName ||
    pointer ||
    mimeType ||
    sandboxPath ||
    downloadUrl ||
    (genericName && FILE_NAME_PATTERN.test(genericName)) ||
    /(^|[_-])(file|attachment|image|audio|video)($|[_-])/i.test(objectType)
  );
  if (!hasStrongFileSignal) return null;

  let name = fileName
    || (FILE_NAME_PATTERN.test(genericName) ? genericName : "")
    || (FILE_NAME_PATTERN.test(title) ? title : "");
  let url = downloadUrl || genericUrl;
  if (!url && sandboxPath) url = sandboxPath.startsWith("sandbox:") ? sandboxPath : `sandbox:${sandboxPath}`;

  if (!name && url) {
    try {
      name = decodeURIComponent(new URL(url, "https://chatgpt.com/").pathname.split("/").filter(Boolean).pop() || "");
    } catch { /* no-op */ }
  }

  const marker = `${name} ${url} ${mimeType}`;
  if (!FILE_NAME_PATTERN.test(marker) && !/^(image|audio|video|application\/pdf|application\/zip)/i.test(mimeType) && !pointer && !sandboxPath) return null;
  const kind: AssetRef["kind"] = IMAGE_NAME_PATTERN.test(name) || /^image\//i.test(mimeType) ? "image" : "attachment";
  const retrievable = /^(https?:|blob:|data:)/i.test(url);
  const embedded = /^data:/i.test(url);
  return {
    id: `metadata-${pointer || fallbackId}`,
    kind,
    name: name || null,
    mimeType: mimeType || null,
    url,
    alt: kind === "image" ? (name || null) : null,
    dataUrl: embedded ? url : null,
    status: embedded ? "embedded" : (retrievable ? "remote" : "unavailable")
  };
}

function collectMetadataAssets(value: unknown, fallbackId: string, depth = 0, out: AssetRef[] = []): AssetRef[] {
  if (!value || depth > 6) return out;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) collectMetadataAssets(value[i], `${fallbackId}-${i}`, depth + 1, out);
    return out;
  }
  if (typeof value !== "object") return out;
  const object = value as Record<string, unknown>;
  const asset = metadataAssetFromObject(object, fallbackId);
  if (asset) out.push(asset);
  for (const [key, child] of Object.entries(object)) {
    if (["text", "content", "parts"].includes(key) && typeof child === "string") continue;
    if (child && typeof child === "object") collectMetadataAssets(child, `${fallbackId}-${key}`, depth + 1, out);
  }
  return out;
}

export function metadataAssets(node: MetadataNode): AssetRef[] {
  const raw = node.message;
  if (!raw || !isVisibleConversationMessage(raw)) return [];
  const candidates = [raw.metadata, raw.content?.parts];
  const assets = candidates.flatMap((value, index) => collectMetadataAssets(value, `${raw.id || node.id || "message"}-${index}`));
  return uniqueBy(assets, (asset) => `${asset.kind}:${asset.url || asset.name || asset.id}`);
}

export function metadataFallbackMessages(metadata: MetadataConversation): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const [nodeId, node] of selectedMetadataPath(metadata)) {
    const raw = node.message;
    if (!isVisibleConversationMessage(raw)) continue;
    const role = raw?.author?.role as "user" | "assistant";
    const text = metadataText(node);
    messages.push({
      id: raw?.id || nodeId,
      index: messages.length + 1,
      turnId: nodeId,
      messageId: raw?.id || null,
      role,
      model: typeof raw?.metadata?.model_slug === "string" ? raw.metadata.model_slug : null,
      createdAt: toIso(raw?.create_time),
      source: "metadata",
      text,
      markdown: text,
      renderedHtml: "",
      links: [],
      assets: metadataAssets(node),
      details: [],
      diagnostics: ["Message recovered from ChatGPT conversation metadata because rendered DOM content was unavailable."]
    });
  }
  return messages;
}

function traceText(raw: MetadataMessage): string {
  const text = metadataText({ message: raw });
  if (text) return text;
  if (Array.isArray(raw.content?.parts) && raw.content.parts.every((part) => typeof part !== "string" || !part.trim())) return "";
  try {
    return raw.content ? JSON.stringify(raw.content) : "";
  } catch {
    return "";
  }
}

export function metadataToolTrace(metadata: MetadataConversation): ToolTraceEvent[] {
  const trace: ToolTraceEvent[] = [];
  for (const [nodeId, node] of selectedMetadataPath(metadata)) {
    const raw = node.message;
    if (!raw) continue;
    const role = raw.author?.role;
    const recipient = normalizedRecipient(raw);
    const isCall = role === "assistant" && Boolean(recipient && recipient !== "all");
    const isResult = role === "tool";
    if (!isCall && !isResult) continue;
    trace.push({
      id: raw.id || nodeId,
      nodeId,
      kind: isCall ? "tool_call" : "tool_result",
      tool: raw.author?.name || (isCall ? recipient : null),
      recipient,
      createdAt: toIso(raw.create_time),
      contentType: raw.content?.content_type || null,
      text: traceText(raw),
      payload: raw.content || null
    });
  }
  return trace;
}
