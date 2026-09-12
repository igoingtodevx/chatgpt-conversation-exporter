import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { exportArchive } from "../src/exporters/archive";
import type { ConversationExport } from "../src/shared/types";

function fixture(): ConversationExport {
  const asset = {
    id: "image-1",
    kind: "image" as const,
    name: "example.png",
    mimeType: "image/png",
    url: "https://example.com/protected.png",
    alt: "Example",
    dataUrl: "data:image/png;base64,AA==",
    status: "embedded" as const
  };
  return {
    schemaVersion: "1.1",
    generator: { name: "ChatGPT Conversation Exporter", version: "0.3.0" },
    conversation: { title: "Archive test", url: "https://chatgpt.com/c/test", id: "test", exportedAt: "2026-09-12T18:00:00.000Z", branch: "visible-current" },
    messages: [{
      id: "m1", index: 1, turnId: "t1", messageId: "m1", role: "assistant", model: null, createdAt: null,
      source: "dom", text: "Image", markdown: "Image", renderedHtml: "<p>Image</p>", links: [], assets: [{ ...asset }], details: [], diagnostics: []
    }],
    toolTrace: [],
    sources: [],
    assets: [{ ...asset }],
    diagnostics: { extractionSource: "dom", expectedTurns: 1, exportedMessages: 1, missingTurns: 0, expandedSections: 0, toolTraceEvents: 0, warnings: [] }
  };
}

describe("archive export", () => {
  it("lists only real files and makes Markdown point to archived assets", async () => {
    const zip = unzipSync(await exportArchive(fixture(), false));
    const names = Object.keys(zip).sort();
    expect(names).toContain("assets/001-image.png");
    expect(names).not.toContain("assets/");

    const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
    expect(manifest.files.sort()).toEqual(names);
    expect(manifest.embeddedAssets).toEqual(["assets/001-image.png"]);

    const md = strFromU8(zip["chat.md"]);
    expect(md).toContain("![Example](./assets/001-image.png)");

    const json = JSON.parse(strFromU8(zip["chat.json"]));
    expect(json.assets[0].localPath).toBe("assets/001-image.png");
    expect(json.assets[0].dataUrl).toBeUndefined();
  });
});
