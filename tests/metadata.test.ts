import { describe, expect, it } from "vitest";
import {
  isVisibleConversationMessage,
  metadataAssets,
  metadataFallbackMessages,
  metadataToolTrace,
  type MetadataConversation,
  type MetadataMessage
} from "../src/content/metadata";

function message(role: string, text: string, extra: Partial<MetadataMessage> = {}): MetadataMessage {
  return {
    id: `${role}-${text.slice(0, 8)}`,
    create_time: 1_700_000_000,
    author: { role },
    content: { content_type: "text", parts: [text] },
    recipient: role === "assistant" ? "all" : null,
    metadata: {},
    ...extra
  };
}

describe("ChatGPT metadata classification", () => {
  it("keeps user-facing assistant messages and excludes assistant tool calls", () => {
    expect(isVisibleConversationMessage(message("assistant", "Visible answer"))).toBe(true);
    expect(isVisibleConversationMessage(message("assistant", '{"path":"/GitHub/tool"}', { recipient: "GitHub" }))).toBe(false);
    expect(isVisibleConversationMessage(message("assistant", "hidden", { metadata: { is_visually_hidden_from_conversation: true } }))).toBe(false);
  });

  it("keeps the current visible branch clean while preserving tool events separately", () => {
    const nodes = [
      ["u1", message("user", "Question")],
      ["a1", message("assistant", "I will check that")],
      ["call", message("assistant", '{"repository":"example/repo"}', { recipient: "GitHub" })],
      ["result", message("tool", '{"ok":true}', { author: { role: "tool", name: "GitHub" }, recipient: "assistant" })],
      ["a2", message("assistant", "Done")]
    ] as const;

    const mapping: MetadataConversation["mapping"] = {};
    nodes.forEach(([id, raw], index) => {
      mapping![id] = { id, parent: index ? nodes[index - 1][0] : null, message: { ...raw, id } };
    });
    const metadata: MetadataConversation = { current_node: "a2", mapping };

    const visible = metadataFallbackMessages(metadata);
    expect(visible.map((item) => [item.role, item.text])).toEqual([
      ["user", "Question"],
      ["assistant", "I will check that"],
      ["assistant", "Done"]
    ]);

    const trace = metadataToolTrace(metadata);
    expect(trace).toHaveLength(2);
    expect(trace.map((event) => event.kind)).toEqual(["tool_call", "tool_result"]);
    expect(trace[0].tool).toBe("GitHub");
    expect(trace[1].tool).toBe("GitHub");
  });

  it("recovers file metadata from visible messages", () => {
    const raw = message("user", "See attached", {
      metadata: {
        attachments: [{ id: "file-123", name: "report.pdf", mime_type: "application/pdf" }]
      }
    });
    const assets = metadataAssets({ id: "u-file", message: raw });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ kind: "attachment", name: "report.pdf", mimeType: "application/pdf", status: "unavailable" });
  });

  it("does not stringify empty text payloads into tool-trace noise", () => {
    const mapping: MetadataConversation["mapping"] = {
      call: {
        id: "call",
        parent: null,
        message: message("assistant", "", {
          id: "call",
          recipient: "web.run",
          content: { content_type: "text", parts: [""] }
        })
      }
    };
    const trace = metadataToolTrace({ current_node: "call", mapping });
    expect(trace).toHaveLength(1);
    expect(trace[0].text).toBe("");
    expect(trace[0].payload).toEqual({ content_type: "text", parts: [""] });
  });
});
