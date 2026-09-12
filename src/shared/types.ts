export type MessageRole = "user" | "assistant" | "tool" | "unknown";

export interface LinkRef {
  text: string;
  url: string;
  kind: "link" | "citation" | "attachment";
}

export interface AssetRef {
  id: string;
  kind: "image" | "attachment";
  name: string | null;
  mimeType: string | null;
  url: string;
  alt: string | null;
  dataUrl?: string | null;
  localPath?: string | null;
  status: "embedded" | "remote" | "unavailable";
}

export interface DetailSection {
  type: "reasoning" | "tool" | "research" | "unknown";
  title: string;
  text: string;
  html: string;
}

export interface ConversationMessage {
  id: string;
  index: number;
  turnId: string | null;
  messageId: string | null;
  role: MessageRole;
  model: string | null;
  createdAt: string | null;
  source: "dom" | "metadata" | "merged";
  text: string;
  markdown: string;
  renderedHtml: string;
  links: LinkRef[];
  assets: AssetRef[];
  details: DetailSection[];
  diagnostics: string[];
}

export interface ToolTraceEvent {
  id: string;
  nodeId: string;
  kind: "tool_call" | "tool_result";
  tool: string | null;
  recipient: string | null;
  createdAt: string | null;
  contentType: string | null;
  text: string;
  payload: unknown;
}

export interface ExportDiagnostics {
  extractionSource: "hybrid" | "dom" | "metadata";
  expectedTurns: number | null;
  exportedMessages: number;
  missingTurns: number;
  expandedSections: number;
  toolTraceEvents: number;
  warnings: string[];
}

export interface ConversationExport {
  schemaVersion: "1.1";
  generator: {
    name: "ChatGPT Conversation Exporter";
    version: string;
  };
  conversation: {
    title: string;
    url: string;
    id: string | null;
    exportedAt: string;
    branch: "visible-current";
  };
  messages: ConversationMessage[];
  toolTrace: ToolTraceEvent[];
  sources: LinkRef[];
  assets: AssetRef[];
  diagnostics: ExportDiagnostics;
}

export interface ExtractionOptions {
  loadAll: boolean;
  includeReasoning: boolean;
  includeTools: boolean;
  includeTimestamps: boolean;
  captureImages: boolean;
}

export interface ExtractResponse {
  ok: boolean;
  data?: ConversationExport;
  error?: string;
}
