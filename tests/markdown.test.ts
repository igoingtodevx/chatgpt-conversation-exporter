import { describe, expect, it } from "vitest";
import { exportMarkdown } from "../src/exporters/markdown";
import type { ConversationExport } from "../src/shared/types";

const fixture: ConversationExport = {
  schemaVersion: "1.0",
  generator: { name: "ChatGPT Conversation Exporter", version: "0.1.0" },
  conversation: { title: "Test chat", url: "https://chatgpt.com/c/abc", id: "abc", exportedAt: "2026-09-12T16:00:00.000Z", branch: "visible-current" },
  messages: [{
    id: "m1", index: 1, turnId: "t1", messageId: "m1", role: "assistant", model: "gpt-test", createdAt: "2026-09-12T15:59:00.000Z",
    source: "merged", text: "Hello", markdown: "Hello **world**", renderedHtml: "<p>Hello <strong>world</strong></p>",
    links: [{ text: "Example", url: "https://example.com/a", kind: "citation" }], assets: [],
    details: [{ type: "reasoning", title: "Thinking", text: "Visible summary", html: "<p>Visible summary</p>" }], diagnostics: []
  }],
  sources: [{ text: "Example", url: "https://example.com/a", kind: "citation" }],
  assets: [],
  diagnostics: { extractionSource: "hybrid", expectedTurns: 1, exportedMessages: 1, missingTurns: 0, expandedSections: 1, warnings: [] }
};

describe("Markdown export", () => {
  it("includes metadata, message formatting, visible reasoning and full source URLs", () => {
    const md = exportMarkdown(fixture);
    expect(md).toContain("# Test chat");
    expect(md).toContain("Hello **world**");
    expect(md).toContain("Visible reasoning: Thinking");
    expect(md).toContain("https://example.com/a");
  });
});
