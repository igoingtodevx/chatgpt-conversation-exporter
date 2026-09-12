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
    end_turn: role === "assistant" ? true : null,
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

  it("keeps the top-level branch clean while preserving intermediate progress in metadata rather than duplicating it as a message", () => {
    const nodes = [
      ["u1", message("user", "Question")],
      ["a1", message("assistant", "I will check that", { end_turn: false })],
      ["call", message("assistant", '{"repository":"example/repo"}', { recipient: "GitHub", end_turn: false })],
      ["result", message("tool", '{"ok":true}', { author: { role: "tool", name: "GitHub" }, recipient: "assistant", end_turn: null })],
      ["a2", message("assistant", "Done", { end_turn: true })]
    ] as const;

    const mapping: MetadataConversation["mapping"] = {};
    nodes.forEach(([id, raw], index) => {
      mapping![id] = { id, parent: index ? nodes[index - 1][0] : null, message: { ...raw, id } };
    });
    const metadata: MetadataConversation = { current_node: "a2", mapping };

    const visible = metadataFallbackMessages(metadata);
    expect(visible.map((item) => [item.role, item.text])).toEqual([
      ["user", "Question"],
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

  it("rejects ordinary web-search results even when titles and URLs look like files", () => {
    const raw = message("assistant", "Search results", {
      metadata: {
        search_result_groups: [{
          entries: [
            {
              title: "setup-node/README.md at main · actions/setup-node · GitHub",
              url: "https://github.com/actions/setup-node/blob/main/README.md?utm_source=chatgpt.com"
            },
            {
              title: "advanced-usage.md",
              href: "https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md"
            }
          ]
        }]
      }
    });
    expect(metadataAssets({ id: "a-search", message: raw })).toEqual([]);
  });

  it("still accepts explicit filename plus URL metadata without a mime type", () => {
    const raw = message("assistant", "Generated file", {
      metadata: {
        attachments: [{ filename: "build.zip", url: "https://example.com/build.zip" }]
      }
    });
    const assets = metadataAssets({ id: "a-file", message: raw });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ name: "build.zip", url: "https://example.com/build.zip", status: "remote" });
  });

  it("does not stringify empty text payloads into tool-trace noise", () => {
    const mapping: MetadataConversation["mapping"] = {
      call: {
        id: "call",
        parent: null,
        message: message("assistant", "", {
          id: "call",
          recipient: "web.run",
          end_turn: false,
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
