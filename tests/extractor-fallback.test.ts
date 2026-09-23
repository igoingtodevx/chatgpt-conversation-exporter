import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { extractConversation } from "../src/content/extractor";
import type { MetadataConversation } from "../src/content/metadata";

const OPTIONS = {
  loadAll: true,
  includeReasoning: true,
  includeTools: true,
  includeTimestamps: true,
  captureImages: false
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractConversation fallback behavior", () => {
  it("recovers the conversation from metadata when ChatGPT renders no recognized turn nodes", async () => {
    const dom = new JSDOM(
      "<!doctype html><html><head><title>Fallback Chat - ChatGPT</title></head><body><main></main></body></html>",
      { url: "https://chatgpt.com/c/01234567-89ab-cdef-0123-456789abcdef" }
    );
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("location", dom.window.location);

    const metadata: MetadataConversation = {
      title: "Recovered conversation",
      current_node: "a1",
      mapping: {
        u1: {
          id: "u1",
          parent: null,
          message: {
            id: "u-msg",
            create_time: 1_700_000_000,
            author: { role: "user" },
            content: { content_type: "text", parts: ["Question"] },
            metadata: {}
          }
        },
        a1: {
          id: "a1",
          parent: "u1",
          message: {
            id: "a-msg",
            create_time: 1_700_000_001,
            end_turn: true,
            recipient: "all",
            author: { role: "assistant" },
            content: { content_type: "text", parts: ["Answer"] },
            metadata: { model_slug: "gpt-test" }
          }
        }
      }
    };

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => metadata
    })) as unknown as typeof fetch);

    const result = await extractConversation(OPTIONS);

    expect(result.conversation.title).toBe("Recovered conversation");
    expect(result.messages.map((message) => [message.role, message.text])).toEqual([
      ["user", "Question"],
      ["assistant", "Answer"]
    ]);
    expect(result.diagnostics.extractionSource).toBe("metadata");
    expect(result.diagnostics.missingTurns).toBe(0);
    expect(result.diagnostics.warnings).toContain(
      "Rendered ChatGPT turn selectors returned no messages; export was recovered entirely from conversation metadata."
    );
  });
});
