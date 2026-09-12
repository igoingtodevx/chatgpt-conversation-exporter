import { jsPDF } from "jspdf";
import { marked } from "marked";
import type { ConversationExport, ConversationMessage } from "../shared/types";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 17;
const TOP = 20;
const BOTTOM = 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

function roleName(message: ConversationMessage): string {
  return message.role === "user" ? "You" : message.role === "assistant" ? "ChatGPT" : message.role === "tool" ? "Tool" : "Unknown";
}

export async function exportPdf(data: ConversationExport): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = TOP;

  const ensure = (height: number) => {
    if (y + height > PAGE_H - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };

  const writeLines = (text: string, size = 10.5, indent = 0, font: "helvetica" | "courier" = "helvetica", style: "normal" | "bold" | "italic" = "normal", gap = 1.3) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    const width = CONTENT_W - indent;
    const lines = doc.splitTextToSize(text || " ", width) as string[];
    const lineH = Math.max(4, size * 0.39 + gap);
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, MARGIN_X + indent, y);
      y += lineH;
    }
  };

  const linkLine = (label: string, url: string) => {
    const text = label ? `${label} — ${url}` : url;
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
      ensure(4.8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.textWithLink(line, MARGIN_X, y, { url });
      y += 4.8;
    }
  };

  const renderTokens = (tokens: any[], indent = 0) => {
    for (const token of tokens) {
      switch (token.type) {
        case "heading": {
          const t = token;
          y += t.depth === 1 ? 2 : 1;
          writeLines(t.text, t.depth === 1 ? 17 : t.depth === 2 ? 14 : 11.5, indent, "helvetica", "bold", 1.8);
          y += 1.5;
          break;
        }
        case "paragraph":
          writeLines(token.text.replace(/\[(.*?)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)"), 10.5, indent);
          y += 1.8;
          break;
        case "text":
          writeLines(token.text, 10.5, indent);
          break;
        case "code": {
          const t = token;
          y += 1;
          writeLines(t.text, 8.5, indent + 3, "courier", "normal", 1.0);
          y += 2;
          break;
        }
        case "blockquote": {
          const t = token;
          renderTokens(t.tokens, indent + 5);
          y += 1;
          break;
        }
        case "list": {
          const t = token;
          let n = t.start || 1;
          for (const item of t.items) {
            const prefix = t.ordered ? `${n}. ` : "• ";
            const text = item.text.replace(/\n+/g, " ");
            writeLines(prefix + text, 10.2, indent + 3);
            n += 1;
          }
          y += 1;
          break;
        }
        case "table": {
          const t = token;
          const rows = [t.header.map((c: any) => c.text), ...t.rows.map((r: any[]) => r.map((c: any) => c.text))];
          for (let r = 0; r < rows.length; r += 1) {
            writeLines(rows[r].join(" | "), r === 0 ? 9.2 : 8.8, indent + 2, "helvetica", r === 0 ? "bold" : "normal", 0.9);
          }
          y += 2;
          break;
        }
        case "space":
          y += 1;
          break;
        default: {
          const raw = "raw" in token && typeof token.raw === "string" ? token.raw.trim() : "";
          if (raw) writeLines(raw, 10, indent);
        }
      }
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  writeLines(data.conversation.title, 19, 0, "helvetica", "bold", 2);
  y += 2;
  doc.setFont("helvetica", "normal");
  writeLines(`Exported: ${data.conversation.exportedAt}`, 9);
  linkLine("Source", data.conversation.url);
  writeLines(`${data.messages.length} messages · ${data.diagnostics.extractionSource} extraction · visible current branch`, 9);
  y += 4;

  for (const warning of data.diagnostics.warnings) {
    writeLines(`Warning: ${warning}`, 9.2, 0, "helvetica", "italic");
    y += 1;
  }

  for (const message of data.messages) {
    ensure(16);
    y += 3;
    writeLines(roleName(message), 12.5, 0, "helvetica", "bold", 1.5);
    if (message.createdAt) writeLines(message.createdAt, 8.5, 0, "helvetica", "italic", 0.8);
    if (message.model) writeLines(`Model: ${message.model}`, 8.5, 0, "helvetica", "normal", 0.8);
    y += 1;
    renderTokens(marked.lexer(message.markdown || message.text));

    for (const detail of message.details) {
      y += 2;
      writeLines(`${detail.type.toUpperCase()}: ${detail.title}`, 9.5, 2, "helvetica", "bold", 1);
      writeLines(detail.text, 9.2, 3, "helvetica", "normal", 1);
    }

    for (const asset of message.assets) {
      if (asset.kind === "image" && asset.dataUrl && /^data:image\/(png|jpe?g)/i.test(asset.dataUrl)) {
        try {
          const props = doc.getImageProperties(asset.dataUrl);
          const width = Math.min(CONTENT_W, 120);
          const height = width * (props.height / props.width);
          ensure(Math.min(height, 90) + 5);
          const finalH = Math.min(height, 90);
          doc.addImage(asset.dataUrl, props.fileType, MARGIN_X, y, width, finalH, undefined, "FAST");
          y += finalH + 2;
        } catch {
          linkLine(asset.name || asset.alt || "Image", asset.url);
        }
      } else {
        linkLine(asset.name || asset.alt || (asset.kind === "image" ? "Image" : "Attachment"), asset.url);
      }
    }
    y += 2;
  }

  if (data.sources.length) {
    doc.addPage();
    y = TOP;
    writeLines("Sources", 15, 0, "helvetica", "bold", 2);
    y += 2;
    data.sources.forEach((source, index) => linkLine(`${index + 1}. ${source.text}`, source.url));
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(data.conversation.title.slice(0, 80), MARGIN_X, 9);
    doc.text(`Page ${page} / ${pages}`, PAGE_W - MARGIN_X, PAGE_H - 8, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
