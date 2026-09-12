import { describe, expect, it } from "vitest";
import { prunePseudoAttachments } from "../src/content/asset-cleanup";
import type { ConversationExport } from "../src/shared/types";

function fixture(): ConversationExport {
  return {
    schemaVersion: "1.1",
    generator: { name: "ChatGPT Conversation Exporter", version: "1.0.0" },
    conversation: { title: "Fixture", url: "https://chatgpt.com/c/test", id: "test", exportedAt: new Date(0).toISOString(), branch: "visible-current" },
    messages: [{
      id: "m1", index: 1, turnId: "t1", messageId: "m1", role: "user", model: null, createdAt: null, source: "dom",
      text: "fixture", markdown: "fixture", renderedHtml: "", links: [], details: [], diagnostics: [],
      assets: [
        { id: "img", kind: "image", name: "salem attacks.png", mimeType: "image/png", url: "https://chatgpt.com/backend-api/estuary/content?id=file_123", alt: "salem attacks.png", status: "embedded", dataUrl: "data:image/png;base64,AA==" },
        { id: "ui", kind: "attachment", name: "Bild öffnen: salem attacks.png", mimeType: null, url: "", alt: null, status: "unavailable" },
        { id: "meta", kind: "image", name: "salem attacks.png", mimeType: "image/png", url: "", alt: "salem attacks.png", status: "unavailable" },
        { id: "metadata-sediment://file_123", kind: "attachment", name: null, mimeType: null, url: "", alt: null, status: "unavailable" }
      ]
    }],
    toolTrace: [], sources: [],
    assets: [
      { id: "img", kind: "image", name: "salem attacks.png", mimeType: "image/png", url: "https://chatgpt.com/backend-api/estuary/content?id=file_123", alt: "salem attacks.png", status: "embedded", dataUrl: "data:image/png;base64,AA==" },
      { id: "ui", kind: "attachment", name: "Bild öffnen: salem attacks.png", mimeType: null, url: "", alt: null, status: "unavailable" },
      { id: "meta", kind: "image", name: "salem attacks.png", mimeType: "image/png", url: "", alt: "salem attacks.png", status: "unavailable" },
      { id: "metadata-sediment://file_123", kind: "attachment", name: null, mimeType: null, url: "", alt: null, status: "unavailable" }
    ],
    diagnostics: { extractionSource: "hybrid", expectedTurns: 1, exportedMessages: 1, missingTurns: 0, expandedSections: 0, toolTraceEvents: 0, warnings: [] }
  };
}

describe("release asset cleanup", () => {
  it("removes redundant unavailable image UI/metadata duplicates when the real image is embedded", () => {
    const data = fixture();
    expect(prunePseudoAttachments(data)).toBe(3);
    expect(data.assets.map((asset) => asset.id)).toEqual(["img"]);
    expect(data.messages[0].assets.map((asset) => asset.id)).toEqual(["img"]);
  });
});
