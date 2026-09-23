import { blocksToMarkdown } from "./dom-to-markdown";
import { sanitizedClone } from "./sanitize";
import {
  metadataFallbackMessages,
  metadataToolTrace,
  type MetadataConversation
} from "./metadata";
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
  "#thread [data-turn-id][data-turn]",
  '[data-testid^="conversation-turn-"]',
  "[data-turn-id][data-turn]",
  '[data-turn="user"]',
  '[data-turn="assistant"]'
];
const ROLE_SELECTORS = [
  "[data-message-author-role]",
  '[data-role="user"]',
  '[data-role="assistant"]',
  '[data-message-author="user"]',
  '[data-message-author="assistant"]'
];
const ROLE_SELECTOR = ROLE_SELECTORS.join(",");
const CONVERSATION_ID_PATTERN = /\/c\/([a-f0-9-]{20,})(?:[/?#]|$)/i;
const DETAIL_PATTERN = /(thinking|reasoning|analysis|research|searched|searching|worked for|tool|connector|browse|browsing|gedacht|überlegt|analyse|recherche|suche|werkzeug)/i;
const TOOL_PATTERN = /(tool|connector|browse|search|github|python|terminal|web|file|document|research|werkzeug|suche|datei)/i;
const REASONING_PATTERN = /(thinking|reasoning|analysis|worked for|gedacht|überlegt|analyse)/i;
const FILE_NAME_PATTERN = /\.(zip|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|ya?ml|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|go|rs|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov)\b/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getTurns(): HTMLElement[] {
  for (const selector of TURN_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (nodes.length) return nodes;
  }
  const turns = Array.from(document.querySelectorAll(ROLE_SELECTOR))
    .map((node) => (node.closest("article, section, [data-turn-id], [data-testid^='conversation-turn-']") || node) as HTMLElement);
  return Array.from(new Set(turns));
}

function roleNodeFor(turn: HTMLElement): HTMLElement | null {
  if (turn.matches(ROLE_SELECTOR)) return turn;
  return turn.querySelector(ROLE_SELECTOR) as HTMLElement | null;
}

function roleFor(turn: HTMLElement, roleNode: HTMLElement | null): "user" | "assistant" | "unknown" {
  const raw = roleNode?.dataset.messageAuthorRole
    || roleNode?.getAttribute("data-role")
    || roleNode?.getAttribute("data-message-author")
    || turn.dataset.turn
    || turn.getAttribute("data-turn")
    || "unknown";
  return raw === "user" || raw === "assistant" ? raw : "unknown";
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

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(blob);
  });
}

async function tryDataUrl(url: string, imageOnly = false): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!/^(https?:|blob:)/i.test(url)) return null;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (imageOnly && !blob.type.startsWith("image/")) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function isUiLink(url: string): boolean {
  try {
    const parsed = new URL(url, location.href);
    return parsed.hostname === location.hostname && (
      parsed.pathname.startsWith("/plugins/") ||
      parsed.searchParams.get("plugin_detail_origin") === "inline_selection_pill"
    );
  } catch {
    return false;
  }
}

function isElementVisible(element: HTMLElement): boolean {
  if (element.hidden || element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function cleanLinkText(value: string, fallback: string): string {
  const text = normalizeWhitespace(value || fallback)
    .replace(/\n\+\d+$/g, "")
    .trim();
  return text || fallback;
}

function collectLinks(root: Element): LinkRef[] {
  const links = Array.from(root.querySelectorAll("a[href]"))
    .map((node) => {
      const anchor = node as HTMLAnchorElement;
      if (!isElementVisible(anchor)) return null;
      const rawHref = anchor.getAttribute("href") || anchor.href || "";
      const url = rawHref ? (() => {
        try { return new URL(rawHref, location.href).href; } catch { return rawHref; }
      })() : "";
      if (!url || isUiLink(url)) return null;
      const text = cleanLinkText(anchor.innerText || anchor.textContent || "", url);
      const marker = `${anchor.dataset.testid || ""} ${anchor.getAttribute("aria-label") || ""} ${anchor.getAttribute("download") || ""}`;
      const attachmentish = Boolean(anchor.download) || /download|attachment|file/i.test(marker) || FILE_NAME_PATTERN.test(`${text} ${url}`);
      const citationish = /citation|source/i.test(marker);
      return {
        text,
        url,
        kind: attachmentish ? "attachment" : citationish ? "citation" : "link"
      } as LinkRef;
    })
    .filter((item): item is LinkRef => Boolean(item && (
      /^(https?:|blob:|data:)/i.test(item.url) || (item.kind === "attachment" && /^sandbox:/i.test(item.url))
    )));
  return uniqueBy(links, (item) => `${item.kind}:${item.url}`);
}

function isUiImage(img: HTMLImageElement, url: string): boolean {
  if (/google\.com\/s2\/favicons/i.test(url)) return true;
  if (/chatgpt\.com\/images\/ecosystem\/apps\//i.test(url)) return true;
  if (img.closest("[data-inline-selection-pill], [data-testid*='plugin-icon'], [data-testid*='citation']")) return true;
  return false;
}

function attachmentNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, location.href);
    return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "") || null;
  } catch {
    return null;
  }
}

function fileWidgetName(element: HTMLElement): string {
  const raw = normalizeWhitespace(
    element.getAttribute("data-filename") ||
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.innerText ||
    element.textContent ||
    ""
  );
  const match = raw.match(/[^\n]{1,180}\.(?:zip|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|ya?ml|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|go|rs|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov)\b/i);
  return (match?.[0] || raw).slice(0, 180);
}

function widgetUrl(element: HTMLElement): string {
  const anchor = element.matches("a[href]") ? element as HTMLAnchorElement : element.querySelector("a[href]") as HTMLAnchorElement | null;
  const candidate = anchor?.getAttribute("href") || anchor?.href || element.getAttribute("data-href") || element.getAttribute("data-url") || "";
  try {
    return candidate ? new URL(candidate, location.href).href : "";
  } catch {
    return candidate;
  }
}

async function collectAssets(root: Element, captureImages: boolean): Promise<AssetRef[]> {
  const assets: AssetRef[] = [];
  const images = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
  for (const img of images) {
    const url = img.currentSrc || img.src || "";
    if (!url || !isElementVisible(img) || url.startsWith("data:image/svg") || isUiImage(img, url)) continue;
    const dataUrl = captureImages ? await tryDataUrl(url, true) : null;
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
    const dataUrl = await tryDataUrl(link.url);
    const retrievable = /^(https?:|blob:|data:)/i.test(link.url);
    assets.push({
      id: `attachment-${crypto.randomUUID()}`,
      kind: "attachment",
      name: attachmentNameFromUrl(link.url) || link.text || null,
      mimeType: dataUrl?.match(/^data:([^;,]+)/)?.[1] || null,
      url: link.url,
      alt: null,
      dataUrl,
      status: dataUrl ? "embedded" : (retrievable ? "remote" : "unavailable")
    });
  }

  const widgetSelector = [
    "button", "[role='button']", "[data-testid*='file']", "[data-testid*='attachment']",
    "[data-testid*='download']", "[data-filename]", "[aria-label*='download' i]", "[aria-label*='attachment' i]"
  ].join(",");
  const widgets = Array.from(root.querySelectorAll(widgetSelector)) as HTMLElement[];
  for (const widget of widgets) {
    if (!isElementVisible(widget)) continue;
    const marker = `${widget.dataset.testid || ""} ${widget.getAttribute("aria-label") || ""} ${widget.getAttribute("data-filename") || ""} ${widget.innerText || ""}`;
    const name = fileWidgetName(widget);
    const explicitlyNamed = Boolean(widget.getAttribute("data-filename"));
    if (!name || (!FILE_NAME_PATTERN.test(name) && !explicitlyNamed)) continue;
    const url = widgetUrl(widget);
    if (url && isUiLink(url)) continue;
    const dataUrl = url ? await tryDataUrl(url) : null;
    const retrievable = /^(https?:|blob:|data:)/i.test(url);
    assets.push({
      id: `attachment-${crypto.randomUUID()}`,
      kind: "attachment",
      name,
      mimeType: dataUrl?.match(/^data:([^;,]+)/)?.[1] || null,
      url,
      alt: null,
      dataUrl,
      status: dataUrl ? "embedded" : (retrievable ? "remote" : "unavailable")
    });
  }

  return uniqueBy(assets, (asset) => `${asset.kind}:${asset.url || asset.name || asset.id}`);
}

function detailType(title: string): DetailSection["type"] {
  if (REASONING_PATTERN.test(title)) return "reasoning";
  if (/research|recherche/i.test(title)) return "research";
  if (TOOL_PATTERN.test(title)) return "tool";
  return "unknown";
}

interface ExpansionCapture {
  restore: () => void;
  expanded: number;
  elements: HTMLElement[];
}

async function expandInspectableSections(turn: HTMLElement, enabled: boolean): Promise<ExpansionCapture> {
  if (!enabled) return { restore: () => {}, expanded: 0, elements: [] };
  const changed: HTMLElement[] = [];
  const candidates = Array.from(turn.querySelectorAll('button[aria-expanded="false"], [role="button"][aria-expanded="false"]')) as HTMLElement[];
  for (const element of candidates) {
    const label = normalizeWhitespace(`${element.getAttribute("aria-label") || ""} ${element.innerText || element.textContent || ""}`);
    if (!DETAIL_PATTERN.test(label)) continue;
    try {
      element.click();
      changed.push(element);
      await sleep(90);
    } catch {
      // Best-effort only; extraction continues.
    }
  }
  return {
    expanded: changed.length,
    elements: changed,
    restore: () => {
      for (const element of changed.slice().reverse()) {
        if (element.getAttribute("aria-expanded") === "true") {
          try { element.click(); } catch { /* no-op */ }
        }
      }
    }
  };
}

function detailFromNode(node: HTMLElement, title: string): DetailSection | null {
  const text = normalizeWhitespace(node.innerText || node.textContent || "");
  if (!text || text.length < 2) return null;
  const clone = sanitizedClone(node);
  return { type: detailType(title), title, text, html: clone.innerHTML };
}

function collectDetails(turn: HTMLElement, primaryRoot: Element, expandedElements: HTMLElement[] = []): DetailSection[] {
  const results: DetailSection[] = [];
  const candidates = Array.from(turn.querySelectorAll("details, [data-testid], [aria-label], [role='region']")) as HTMLElement[];
  for (const node of candidates) {
    if (node === primaryRoot || primaryRoot.contains(node) || node.contains(primaryRoot)) continue;
    const marker = `${node.dataset.testid || ""} ${node.getAttribute("aria-label") || ""} ${node.querySelector("summary")?.textContent || ""}`;
    if (!DETAIL_PATTERN.test(marker)) continue;
    const title = normalizeWhitespace(node.querySelector("summary")?.textContent || node.getAttribute("aria-label") || marker).slice(0, 160);
    const detail = detailFromNode(node, title);
    if (detail) results.push(detail);
  }

  for (const trigger of expandedElements) {
    const title = normalizeWhitespace(`${trigger.getAttribute("aria-label") || ""} ${trigger.innerText || trigger.textContent || ""}`).slice(0, 160);
    if (!title || !DETAIL_PATTERN.test(title)) continue;
    let container: HTMLElement | null = trigger.parentElement;
    for (let depth = 0; container && depth < 4; depth += 1, container = container.parentElement) {
      if (container === turn || container === primaryRoot || primaryRoot.contains(container) || container.contains(primaryRoot)) continue;
      const text = normalizeWhitespace(container.innerText || container.textContent || "");
      if (!text || text === title || text.length <= title.length + 2 || text.length > 20000) continue;
      const detail = detailFromNode(container, title);
      if (detail) results.push(detail);
      break;
    }
  }

  return uniqueBy(results, (item) => `${item.type}:${item.title}:${item.text.slice(0, 100)}`);
}

function turnIndex(turn: HTMLElement, fallback: number): number {
  const marker = turn.dataset.testid || turn.getAttribute("data-testid") || "";
  const match = marker.match(/conversation-turn-(\d+)/i);
  return match ? Number(match[1]) + 1 : fallback + 1;
}

async function extractTurn(turn: HTMLElement, index: number, options: ExtractionOptions): Promise<ConversationMessage | null> {
  const roleNode = roleNodeFor(turn);
  const role = roleFor(turn, roleNode);
  if (role === "unknown") return null;
  const messageRoot = roleNode || turn;
  const primaryRoot = messageRoot.querySelector(".markdown")
    || messageRoot.querySelector(".prose")
    || messageRoot.querySelector('[data-testid="collapsible-user-message-content"]')
    || messageRoot.querySelector(".whitespace-pre-wrap")
    || messageRoot;

  const expansion = await expandInspectableSections(turn, options.includeReasoning || options.includeTools);
  try {
    const clone = sanitizedClone(primaryRoot);
    const markdown = blocksToMarkdown(clone);
    const text = normalizeWhitespace((primaryRoot as HTMLElement).innerText || primaryRoot.textContent || "");
    const links = collectLinks(turn);
    const assets = await collectAssets(turn, options.captureImages);
    const details = collectDetails(turn, primaryRoot, expansion.elements).filter((item) => {
      if (item.type === "reasoning") return options.includeReasoning;
      if (item.type === "tool" || item.type === "research") return options.includeTools;
      return options.includeTools || options.includeReasoning;
    });
    if (!markdown && !text && !assets.length && !details.length) return null;

    const turnId = turn.dataset.turnId || turn.getAttribute("data-turn-id") || null;
    const messageId = messageRoot.dataset.messageId
      || messageRoot.getAttribute("data-message-id")
      || messageRoot.getAttribute("data-message-uuid")
      || null;
    return {
      id: messageId || turnId || `dom-${index + 1}`,
      index: turnIndex(turn, index),
      turnId,
      messageId,
      role,
      model: messageRoot.dataset.messageModelSlug || messageRoot.getAttribute("data-message-model-slug") || null,
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

function mergeWithMetadata(domMessages: ConversationMessage[], metadata: MetadataConversation | null): ConversationMessage[] {
  if (!metadata) return domMessages.sort((a, b) => a.index - b.index).map((message, index) => ({ ...message, index: index + 1 }));
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
      model: message.model || meta.model,
      assets: uniqueBy([...message.assets, ...meta.assets], (asset) => `${asset.kind}:${asset.url || asset.name || asset.id}`)
    };
  });
  for (const meta of fallback) if (!used.has(meta.id)) merged.push(meta);

  const order = new Map<string, number>();
  fallback.forEach((message, index) => {
    order.set(message.id, index);
    if (message.messageId) order.set(message.messageId, index);
    if (message.turnId) order.set(message.turnId, index);
  });
  const orderOf = (message: ConversationMessage) => order.get(message.messageId || "") ?? order.get(message.turnId || "") ?? order.get(message.id);
  merged.sort((a, b) => {
    const ai = orderOf(a);
    const bi = orderOf(b);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.index - b.index;
  });
  return merged.map((message, index) => ({ ...message, index: index + 1 }));
}

async function scanDom(options: ExtractionOptions): Promise<{ messages: ConversationMessage[]; expected: number; expanded: number }> {
  const initial = getTurns();
  if (!initial.length) return { messages: [], expected: 0, expanded: 0 };
  const root = getScrollRoot(initial[0]);
  const originalTop = root.scrollTop;
  const messages = new Map<string, ConversationMessage>();
  let expanded = 0;
  let maxObservedTurns = initial.length;

  const harvest = async () => {
    const current = getTurns();
    maxObservedTurns = Math.max(maxObservedTurns, current.length);
    for (let i = 0; i < current.length; i += 1) {
      const turn = current[i];
      const key = turn.dataset.turnId || turn.getAttribute("data-turn-id") || turn.dataset.testid || `${turnIndex(turn, i)}`;
      if (messages.has(key)) continue;
      const message = await extractTurn(turn, i, options);
      if (!message) continue;
      messages.set(key, message);
      const diag = message.diagnostics.find((d) => d.startsWith("Expanded "));
      if (diag) expanded += Number(diag.match(/Expanded (\d+)/)?.[1] || 0);
    }
  };

  try {
    await harvest();
    if (options.loadAll) {
      root.scrollTo({ top: 0, behavior: "instant" });
      await sleep(120);
      await harvest();
      let stablePasses = 0;
      let previousCount = -1;
      let previousHeight = -1;
      for (let pass = 0; pass < 4 && stablePasses < 2; pass += 1) {
        const height = root.scrollHeight;
        const maxTop = Math.max(0, height - root.clientHeight);
        const step = Math.max(420, Math.floor(Math.max(root.clientHeight, 700) * 0.65));
        for (let top = 0; top <= maxTop; top += step) {
          root.scrollTo({ top, behavior: "instant" });
          await sleep(70);
          await harvest();
        }
        root.scrollTo({ top: root.scrollHeight, behavior: "instant" });
        await sleep(120);
        await harvest();
        const unchanged = messages.size === previousCount && Math.abs(root.scrollHeight - previousHeight) < 8;
        stablePasses = unchanged ? stablePasses + 1 : 0;
        previousCount = messages.size;
        previousHeight = root.scrollHeight;
      }
    }
  } finally {
    root.scrollTo({ top: originalTop, behavior: "instant" });
  }

  const output = Array.from(messages.values()).sort((a, b) => a.index - b.index);
  return { messages: output, expected: maxObservedTurns, expanded };
}

export async function extractConversation(options: ExtractionOptions): Promise<ConversationExport> {
  const id = conversationId();
  const metadata = id ? await fetchMetadata(id) : null;
  const metadataMessages = metadata ? metadataFallbackMessages(metadata) : [];
  const dom = await scanDom(options);
  if (!dom.messages.length && !metadataMessages.length) {
    throw new Error("No ChatGPT conversation could be recovered from this page. Open a saved conversation and try again.");
  }
  const messages = mergeWithMetadata(dom.messages, metadata);
  const toolTrace = metadata && options.includeTools ? metadataToolTrace(metadata) : [];

  if (!options.includeTimestamps) messages.forEach((message) => { message.createdAt = null; });
  if (!options.includeReasoning) messages.forEach((message) => { message.details = message.details.filter((d) => d.type !== "reasoning"); });
  if (!options.includeTools) messages.forEach((message) => { message.details = message.details.filter((d) => d.type !== "tool" && d.type !== "research"); });

  const sources = uniqueBy(messages.flatMap((m) => m.links).filter((link) => link.kind !== "attachment" && !isUiLink(link.url)), (link) => `${link.kind}:${link.url}`);
  const assets = uniqueBy(messages.flatMap((m) => m.assets), (asset) => `${asset.kind}:${asset.url || asset.name || asset.id}`);
  const metadataCount = metadataMessages.length;
  const expected = Math.max(dom.expected, metadataCount);
  const missing = Math.max(0, expected - messages.length);
  const warnings: string[] = [];
  if (!metadata) warnings.push("Structured ChatGPT conversation metadata was unavailable; DOM extraction was used.");
  if (!dom.messages.length && metadataMessages.length) {
    warnings.push("Rendered ChatGPT turn selectors returned no messages; export was recovered entirely from conversation metadata.");
  }
  if (missing) warnings.push(`${missing} expected visible turn(s) could not be recovered.`);
  if (assets.some((asset) => asset.status !== "embedded")) warnings.push("Some conversation assets could not be embedded locally; their available metadata or original URLs are preserved.");

  return {
    schemaVersion: "1.1",
    generator: { name: "ChatGPT Conversation Exporter", version: "1.0.1" },
    conversation: {
      title: metadata?.title || pageTitle(),
      url: location.href,
      id,
      exportedAt: new Date().toISOString(),
      branch: "visible-current"
    },
    messages,
    toolTrace,
    sources,
    assets,
    diagnostics: {
      extractionSource: metadataMessages.length && dom.messages.length
        ? "hybrid"
        : metadataMessages.length
          ? "metadata"
          : "dom",
      expectedTurns: expected || null,
      exportedMessages: messages.length,
      missingTurns: missing,
      expandedSections: dom.expanded,
      toolTraceEvents: toolTrace.length,
      warnings
    }
  };
}
