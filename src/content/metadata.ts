import type { ConversationMessage, ToolTraceEvent } from "../shared/types";
import { normalizeWhitespace } from "../shared/utils";

const VISIBLE_CONTENT_TYPES = new Set(["text", "multimodal_text", "code"]);
const HIDDEN_FLAGS = ["is_visually_hidden_from_conversation", "is_hidden", "hidden", "is_redacted"];

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
      assets: [],
      details: [],
      diagnostics: ["Message recovered from ChatGPT conversation metadata because rendered DOM content was unavailable."]
    });
  }
  return messages;
}

function traceText(raw: MetadataMessage): string {
  const text = metadataText({ message: raw });
  if (text) return text;
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
