import { describe, expect, it } from "vitest";
import { isLikelyStatusPseudoAttachment, prunePseudoAttachments } from "../src/content/asset-cleanup";
import type { AssetRef, ConversationExport } from "../src/shared/types";

function asset(name: string): AssetRef {
  return {
    id: `asset-${name}`,
    kind: "attachment",
    name,
    mimeType: null,
    url: "",
    alt: null,
    dataUrl: null,
    status: "unavailable"
  };
}

function exportWithAssets(assets: AssetRef[]): ConversationExport {
  return {
    schemaVersion: "1.1",
    generator: { name: "ChatGPT Conversation Exporter", version: "test" },
    conversation: {
      title: "Test",
      url: "https://chatgpt.com/c/test",
      id: "test",
      exportedAt: "2026-09-12T00:00:00.000Z",
      branch: "visible-current"
    },
    messages: [{
      id: "m1",
      index: 1,
      turnId: "t1",
      messageId: "m1",
      role: "assistant",
      model: null,
      createdAt: null,
      source: "dom",
      text: "Done",
      markdown: "Done",
      renderedHtml: "<p>Done</p>",
      links: [],
      assets: [...assets],
      details: [],
      diagnostics: []
    }],
    toolTrace: [],
    sources: [],
    assets: [...assets],
    diagnostics: {
      extractionSource: "dom",
      expectedTurns: 1,
      exportedMessages: 1,
      missingTurns: 0,
      expandedSections: 0,
      toolTraceEvents: 0,
      warnings: []
    }
  };
}

describe("asset cleanup", () => {
  it("recognizes a reasoning status such as Überprüfte die Node.js as a pseudo-attachment", () => {
    expect(isLikelyStatusPseudoAttachment(asset("Überprüfte die Node.js"))).toBe(true);
  });

  it("does not reject normal archive filenames", () => {
    expect(isLikelyStatusPseudoAttachment(asset("chatgpt-conversation-exporter-v0.3.2.zip"))).toBe(false);
    expect(isLikelyStatusPseudoAttachment(asset("Complete Archive.zip"))).toBe(false);
  });

  it("removes pseudo-attachments globally and per message", () => {
    const bogus = asset("Überprüfte die Node.js");
    const real = asset("build.zip");
    const data = exportWithAssets([bogus, real]);
    expect(prunePseudoAttachments(data)).toBe(1);
    expect(data.assets.map((item) => item.name)).toEqual(["build.zip"]);
    expect(data.messages[0].assets.map((item) => item.name)).toEqual(["build.zip"]);
  });
});
