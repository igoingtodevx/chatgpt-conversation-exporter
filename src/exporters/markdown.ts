import type { ConversationExport, ConversationMessage } from "../shared/types";

function label(message: ConversationMessage): string {
  if (message.role === "user") return "You";
  if (message.role === "assistant") return "ChatGPT";
  if (message.role === "tool") return "Tool";
  return "Unknown";
}

export function exportMarkdown(data: ConversationExport): string {
  const lines: string[] = [
    `# ${data.conversation.title}`,
    "",
    `- Exported: ${data.conversation.exportedAt}`,
    `- Source: ${data.conversation.url}`,
    `- Branch: ${data.conversation.branch}`,
    `- Visible messages: ${data.messages.length}`,
    `- Extraction: ${data.diagnostics.extractionSource}`,
    ""
  ];

  if (data.toolTrace.length) {
    lines.push(`> ${data.toolTrace.length} structured tool-trace event(s) are preserved in \`chat.json\`. They are intentionally excluded from this human-readable transcript.`, "");
  }

  if (data.diagnostics.warnings.length) {
    lines.push("## Export warnings", "");
    for (const warning of data.diagnostics.warnings) lines.push(`> ${warning}`, "");
  }

  for (const message of data.messages) {
    lines.push(`## ${label(message)}`);
    if (message.createdAt) lines.push("", `*${message.createdAt}*`);
    if (message.model) lines.push("", `Model: \`${message.model}\``);
    lines.push("", message.markdown || message.text);

    for (const detail of message.details) {
      const heading = detail.type === "reasoning" ? "Visible reasoning" : detail.type === "tool" ? "Tool output" : detail.type === "research" ? "Research" : "Additional UI content";
      lines.push("", `### ${heading}: ${detail.title}`, "", detail.text);
    }

    if (message.assets.length) {
      lines.push("", "### Assets", "");
      for (const asset of message.assets) {
        const name = asset.name || asset.alt || asset.id;
        lines.push(asset.url ? `- ${name}: ${asset.url}` : `- ${name}: [download target unavailable in rendered UI]`);
      }
    }
    lines.push("", "---", "");
  }

  if (data.sources.length) {
    lines.push("## Sources", "");
    data.sources.forEach((source, index) => {
      lines.push(`${index + 1}. ${source.text || source.url}`, `   ${source.url}`);
    });
    lines.push("");
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}
