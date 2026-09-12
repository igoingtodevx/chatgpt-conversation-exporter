import { blocksToMarkdown } from "./dom-to-markdown";
import { sanitizedClone } from "./sanitize";
import type {
  AssetRef,
  ConversationExport,
  ConversationMessage,
  DetailSection,
  ExtractionOptions,
  LinkRef
} from "../shared/types";
import { normalizeWhitespace, uniqueBy } from "../shared/utils";

const TURN_SELECTORS = [
  "#thread section[data-turn-id][data-turn]",
  'article[data-testid^="conversation-turn-"]',
  "section[data-turn-id]"
];
const ROLE_SELECTOR = "[data-message-author-role]";
const CONVERSATION_ID_PATTERN = /\/c\/([a-f0-9-]{20,})(?:[/?#]|$)/i;
const DETAIL_PATTERN = /(thinking|reasoning|analysis|research|searched|searching|worked for|tool|connector|browse|browsing|gedacht|überlegt|analyse|recherche|suche|werkzeug)/i;
const TOOL_PATTERN = /(tool|connector|browse|search|github|python|terminal|web|file|document|research|werkzeug|suche|datei)/i;
const REASONING_PATTERN = /(thinking|reasoning|analysis|worked for|gedacht|überlegt|analyse)/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getTurns(): HTMLElement[] {
  for (const selector of TURN_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (nodes.length) return nodes;
  }
  return Array.from(document.querySelectorAll(ROLE_SELECTOR))
    .map((node) => (node.closest("article, section") || node) as HTMLElement);
}

function getScrollRoot(probe?: HTMLElement | null): HTMLElement {
  const explicit = document.querySelector("[data-scroll-root]") as HTMLElement | null;
  if (explicit) return explicit;
  for (let el: HTMLElement | null = probe || null; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 100) return el;
  }
  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

function conversationId(): string | null {
  return location.pathname.match(CONVERSATION_ID_PATTERN)?.[1] || null;
}

function pageTitle(): string {
  const title = document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, "").trim();
  return title && title.toLowerCase() !== "chatgpt" ? title : "ChatGPT Conversation";
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(raw)
    ? new Date(raw < 1e12 ? raw * 1000 : raw)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function tryImageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function collectLinks(root: Element): LinkRef[] {
  const links = Array.from(root.querySelectorAll("a[href]"))
    .map((a) => {
      const anchor = a as HTMLAnchorElement;
      const url = anchor.href || anchor.getAttribute("href") || "";
      const text = normalizeWhitespace(anchor.innerText || anchor.textContent || url);
      const attachmentish = Boolean(anchor.download) || /download|attachment|file/i.test(`${anchor.dataset.testid || ""} ${anchor.getAttribute("aria-label") || ""}`);
      const citationish = /citation|source/i.test(`${anchor.dataset.testid || ""} ${anchor.getAttribute("aria-label") || ""}`);
      return { text: text || url, url, kind: attachmentish ? "attachment" : citationish ? "citation" : "link" } as LinkRef;
    })
    .filter((item) => /^(https?:|blob:|data:)/i.test(item.url));
  return uniqueBy(links, (item) => `${item.kind}:${item.url}`);
}

async function collectAssets(root: Element, captureImages: boolean): Promise<AssetRef[]> {
  const assets: AssetRef[] = [];
  const images = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    const url = img.currentSrc || img.src || "";
    if (!url || url.startsWith("data:image/svg")) continue;
    const dataUrl = captureImages && !url.startsWith("data:") ? await tryImageDataUrl(url) : (url.startsWith("data:") ? url : null);
    assets.push({
      id: `image-${crypto.randomUUID()}`,
      kind: "image",
      name: img.alt || null,
      mimeType: dataUrl?.match(/^data:([^;,]+)/)?.[1] || null,
      url,
      alt: img.alt || null,
      dataUrl,
      status: dataUrl ? "embedded" : "remote"
    });
  }

  for (const link of collectLinks(root).filter((item) => item.kind === "attachment")) {
    let name: string | null = null;
    try {
      const parsed = new URL(link.url);
      name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "") || null;
    } catch {
      name = null;
    }
    assets.push({
      id: `attachment-${crypto.randomUUID()}`,
      kind: "attachment",
      name: name || link.text || null,
      mimeType: null,
      url: link.url,
      alt: null,
      status: "remote"
    });
  }
  return uniqueBy(assets, (asset) => `${asset.kind}:${asset.url}`);
}

function detailType(title: string): DetailSection["type"] {
  if (REASONING_PATTERN.test(title)) return "reasoning";
  if (/research|recherche/i.test(title)) return "research";
  if (TOOL_PATTERN.test(title)) return "tool";
  return "unknown";
}

async function expandInspectableSections(turn: HTMLElement, enabled: boolean): Promise<{ restore: () => void; expanded: number }> {
  if (!enabled) return { restore: () => {}, expanded: 0 };
  const changed: HTMLElement[] = [];
  const candidates = Array.from(turn.querySelectorAll('button[aria-expanded="false"], [role="button"][aria-expanded="false"]')) as HTMLElement[];
  for (const element of candidates) {
    const label = normalizeWhitespace(`${element.getAttribute("aria-label") || ""} ${element.innerText || element.textContent || ""}`);
    if (!DETAIL_PATTERN.test(label)) continue;
    try {
      element.click();
      changed.push(element);
      await sleep(80);
    } catch {
      // Best-effort only; extraction continues.
    }
  }
  return {
    expanded: changed.length,
    restore: () => {
      for (const element of changed.reverse()) {
        if (element.getAttribute("aria-expanded") === "true") {
          try { element.click(); } catch { /* no-op */ }
        }
      }
    }
  };
}

function collectDetails(turn: HTMLElement, primaryRoot: Element): DetailSection[] {
  const results: DetailSection[] = [];
  const candidates = Array.from(turn.querySelectorAll("details, [data-testid], [aria-label]")) as HTMLElement[];
  for (const node of candidates) {
    if (node === primaryRoot || primaryRoot.contains(node) || node.contains(primaryRoot)) continue;
    const marker = `${node.dataset.testid || ""} ${node.getAttribute("aria-label") || ""} ${node.querySelector("summary")?.textContent || ""}`;
    if (!DETAIL_PATTERN.test(marker)) continue;
    const text = normalizeWhitespace(node.innerText || node.textContent || "");
    if (!text || text.length < 2) continue;
    const title = normalizeWhitespace(node.querySelector("summary")?.textContent || node.getAttribute("aria-label") || marker).slice(0, 160);
    const clone = sanitizedClone(node);
    results.push({ type: detailType(title), title, text, html: clone.innerHTML });
  }
  return uniqueBy(results, (item) => `${item.type}:${item.title}:${item.text.slice(0, 100)}`);
}

async function extractTurn(turn: HTMLElement, index: number, options: ExtractionOptions): Promise<ConversationMessage | null> {
  const roleNode = turn.querySelector(ROLE_SELECTOR) as HTMLElement | null;
  if (!roleNode) return null;
  const roleRaw = roleNode.dataset.messageAuthorRole || turn.dataset.turn || "unknown";
  const role = roleRaw === "user" || roleRaw === "assistant" ? roleRaw : "unknown";
  const primaryRoot = roleNode.querySelector(".markdown")
    || roleNode.querySelector('[data-testid="collapsible-user-message-content"]')
    || roleNode.querySelector(".whitespace-pre-wrap")
    || roleNode;

  const expansion = await expandInspectableSections(turn, options.includeReasoning || options.includeTools);
  try {
    const clone = sanitizedClone(primaryRoot);
    const markdown = blocksToMarkdown(clone);
    const text = normalizeWhitespace((primaryRoot as HTMLElement).innerText || primaryRoot.textContent || "");
    const links = collectLinks(turn);
    const assets = await collectAssets(turn, options.captureImages);
    const details = collectDetails(turn, primaryRoot).filter((item) => {
      if (item.type === "reasoning") return options.includeReasoning;
      if (item.type === "tool" || item.type === "research") return options.includeTools;
      return options.includeTools || options.includeReasoning;
    });
    if (!markdown && !text && !assets.length && !details.length) return null;

    const turnId = turn.dataset.turnId || turn.getAttribute("data-turn-id") || null;
    const messageId = roleNode.dataset.messageId || roleNode.getAttribute("data-message-id") || null;
    return {
      id: messageId || turnId || `dom-${index + 1}`,
      index: index + 1,
      turnId,
      messageId,
      role,
      model: roleNode.dataset.messageModelSlug || roleNode.getAttribute("data-message-model-slug") || null,
      createdAt: null,
      source: "dom",
      text: text || markdown,
      markdown: markdown || text,
      renderedHtml: clone.innerHTML,
      links,
      assets,
      details,
      diagnostics: expansion.expanded ? [`Expanded ${expansion.expanded} collapsed detail section(s) for capture.`] : []
    };
  } finally {
    expansion.restore();
  }
}

interface MetadataNode {
  id?: string;
  parent?: string | null;
  message?: {
    id?: string;
    create_time?: unknown;
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[]; text?: string };
    metadata?: Record<string, unknown>;
  } | null;
}

interface MetadataConversation {
  title?: string;
  current_node?: string;
  mapping?: Record<string, MetadataNode>;
}

async function fetchMetadata(id: string): Promise<MetadataConversation | null> {
  const url = `/backend-api/conversation/${encodeURIComponent(id)}`;
  try {
    let response = await fetch(url, { credentials: "include" });
    if (!response.ok && [401, 403, 404].includes(response.status)) {
      const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
      if (sessionResponse.ok) {
        const session = await sessionResponse.json() as { accessToken?: string };
        if (session.accessToken) {
          response = await fetch(url, { credentials: "include", headers: { Authorization: `Bearer ${session.accessToken}` } });
        }
      }
    }
    return response.ok ? await response.json() as MetadataConversation : null;
  } catch {
    return null;
  }
}

function selectedMetadataPath(metadata: MetadataConversation): Array<[string, MetadataNode]> {
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

function metadataText(node: MetadataNode): string {
  const content = node.message?.content;
  if (!content) return "";
  if (typeof content.text === "string") return normalizeWhitespace(content.text);
  if (!Array.isArray(content.parts)) return "";
  return normalizeWhitespace(content.parts.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object") {
      const value = part as Record<string, unknown>;
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
      if (typeof value.name === "string") return `[Attachment: ${value.name}]`;
    }
    return "";
  }).filter(Boolean).join("\n\n"));
}

function metadataFallbackMessages(metadata: MetadataConversation): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const [nodeId, node] of selectedMetadataPath(metadata)) {
    const raw = node.message;
    const role = raw?.author?.role;
    if (role !== "user" && role !== "assistant") continue;
    const hidden = raw?.metadata && ["is_visually_hidden_from_conversation", "is_hidden", "hidden", "is_redacted"].some((key) => raw.metadata?.[key] === true);
    if (hidden) continue;
    const text = metadataText(node);
    if (!text) continue;
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

function mergeWithMetadata(domMessages: ConversationMessage[], metadata: MetadataConversation | null): ConversationMessage[] {
  if (!metadata) return domMessages;
  const fallback = metadataFallbackMessages(metadata);
  const byMessageId = new Map(fallback.filter((m) => m.messageId).map((m) => [m.messageId as string, m]));
  const byTurnId = new Map(fallback.filter((m) => m.turnId).map((m) => [m.turnId as string, m]));

  const used = new Set<string>();
  const merged = domMessages.map((message) => {
    const meta = (message.messageId && byMessageId.get(message.messageId)) || (message.turnId && byTurnId.get(message.turnId));
    if (!meta) return message;
    used.add(meta.id);
    return {
      ...message,
      source: "merged" as const,
      createdAt: meta.createdAt || message.createdAt,
      model: message.model || meta.model
    };
  });

  for (const meta of fallback) {
    if (!used.has(meta.id)) merged.push(meta);
  }

  const order = new Map(fallback.map((m, index) => [m.id, index]));
  merged.sort((a, b) => {
    const ai = order.get(a.messageId || a.turnId || a.id);
    const bi = order.get(b.messageId || b.turnId || b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.index - b.index;
  });
  return merged.map((message, index) => ({ ...message, index: index + 1 }));
}

async function scanDom(options: ExtractionOptions): Promise<{ messages: ConversationMessage[]; expected: number; expanded: number }> {
  const turns = getTurns();
  if (!turns.length) throw new Error("No ChatGPT conversation turns were found on this page.");
  const root = getScrollRoot(turns[0]);
  const originalTop = root.scrollTop;
  const messages = new Map<string, ConversationMessage>();
  let expanded = 0;

  const harvest = async () => {
    const current = getTurns();
    for (let i = 0; i < current.length; i += 1) {
      const turn = current[i];
      const key = turn.dataset.turnId || turn.getAttribute("data-turn-id") || turn.dataset.testid || `${i}`;
      if (messages.has(key)) continue;
      const message = await extractTurn(turn, i, options);
      if (message) {
        messages.set(key, message);
        const diag = message.diagnostics.find((d) => d.startsWith("Expanded "));
        if (diag) expanded += Number(diag.match(/Expanded (\d+)/)?.[1] || 0);
      }
    }
  };

  try {
    await harvest();
    if (options.loadAll) {
      const stableTurns = getTurns();
      for (let i = 0; i < stableTurns.length; i += 1) {
        stableTurns[i].scrollIntoView({ block: "center", behavior: "instant" });
        await sleep(45);
        await harvest();
      }
      root.scrollTo({ top: 0, behavior: "instant" });
      await sleep(80);
      await harvest();
      root.scrollTo({ top: root.scrollHeight, behavior: "instant" });
      await sleep(80);
      await harvest();
    }
  } finally {
    root.scrollTo({ top: originalTop, behavior: "instant" });
  }

  const output = Array.from(messages.values()).sort((a, b) => a.index - b.index);
  return { messages: output, expected: turns.length, expanded };
}

export async function extractConversation(options: ExtractionOptions): Promise<ConversationExport> {
  const id = conversationId();
  const metadata = id ? await fetchMetadata(id) : null;
  const dom = await scanDom(options);
  const messages = mergeWithMetadata(dom.messages, metadata);

  if (!options.includeTimestamps) messages.forEach((message) => { message.createdAt = null; });
  if (!options.includeReasoning) messages.forEach((message) => { message.details = message.details.filter((d) => d.type !== "reasoning"); });
  if (!options.includeTools) messages.forEach((message) => { message.details = message.details.filter((d) => d.type !== "tool" && d.type !== "research"); });

  const sources = uniqueBy(messages.flatMap((m) => m.links), (link) => `${link.kind}:${link.url}`);
  const assets = uniqueBy(messages.flatMap((m) => m.assets), (asset) => `${asset.kind}:${asset.url}`);
  const metadataCount = metadata ? metadataFallbackMessages(metadata).length : 0;
  const missing = Math.max(0, Math.max(dom.expected, metadataCount) - messages.length);
  const warnings: string[] = [];
  if (!metadata) warnings.push("Structured ChatGPT conversation metadata was unavailable; DOM extraction was used.");
  if (missing) warnings.push(`${missing} expected turn(s) could not be recovered.`);
  if (assets.some((asset) => asset.status !== "embedded")) warnings.push("Some assets could not be embedded locally; their original URLs are preserved.");

  return {
    schemaVersion: "1.0",
    generator: { name: "ChatGPT Conversation Exporter", version: "0.1.0" },
    conversation: {
      title: metadata?.title || pageTitle(),
      url: location.href,
      id,
      exportedAt: new Date().toISOString(),
      branch: "visible-current"
    },
    messages,
    sources,
    assets,
    diagnostics: {
      extractionSource: metadata ? "hybrid" : "dom",
      expectedTurns: Math.max(dom.expected, metadataCount) || null,
      exportedMessages: messages.length,
      missingTurns: missing,
      expandedSections: dom.expanded,
      warnings
    }
  };
}
