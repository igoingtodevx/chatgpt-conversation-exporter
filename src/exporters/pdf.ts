import { jsPDF } from "jspdf";
import { marked } from "marked";
import type { ConversationExport, ConversationMessage } from "../shared/types";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 17;
const TOP = 20;
const BOTTOM = 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

type PdfFont = "helvetica" | "courier";
type PdfStyle = "normal" | "bold" | "italic" | "bolditalic";
interface InlineRun { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string; }

function roleName(message: ConversationMessage): string {
  return message.role === "user" ? "You" : message.role === "assistant" ? "ChatGPT" : message.role === "tool" ? "Tool" : "Unknown";
}

function styleOf(run: InlineRun): PdfStyle {
  if (run.bold && run.italic) return "bolditalic";
  if (run.bold) return "bold";
  if (run.italic) return "italic";
  return "normal";
}

function inlineRuns(tokens: any[] | undefined, inherited: Omit<InlineRun, "text"> = {}): InlineRun[] {
  if (!tokens?.length) return [];
  const runs: InlineRun[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "strong":
        runs.push(...inlineRuns(token.tokens, { ...inherited, bold: true }));
        break;
      case "em":
        runs.push(...inlineRuns(token.tokens, { ...inherited, italic: true }));
        break;
      case "codespan":
        runs.push({ ...inherited, text: token.text || "", code: true });
        break;
      case "link":
        runs.push(...inlineRuns(token.tokens, { ...inherited, link: token.href || inherited.link }));
        break;
      case "br":
        runs.push({ ...inherited, text: "\n" });
        break;
      case "del":
        runs.push(...inlineRuns(token.tokens, inherited));
        break;
      case "escape":
      case "text":
        if (token.tokens?.length) runs.push(...inlineRuns(token.tokens, inherited));
        else runs.push({ ...inherited, text: token.text ?? token.raw ?? "" });
        break;
      case "html":
        runs.push({ ...inherited, text: String(token.text || token.raw || "").replace(/<[^>]+>/g, "") });
        break;
      default:
        if (token.tokens?.length) runs.push(...inlineRuns(token.tokens, inherited));
        else if (typeof token.text === "string") runs.push({ ...inherited, text: token.text });
    }
  }
  return runs;
}

function plainInline(tokens: any[] | undefined, fallback = ""): string {
  const value = inlineRuns(tokens).map((run) => run.text).join("");
  return value || fallback.replace(/[*_~`]/g, "");
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

  const lineHeight = (size: number, gap: number) => Math.max(4, size * 0.39 + gap);

  const writeLines = (text: string, size = 10.5, indent = 0, font: PdfFont = "helvetica", style: PdfStyle = "normal", gap = 1.3) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    const width = CONTENT_W - indent;
    const lines = doc.splitTextToSize(text || " ", width) as string[];
    const lineH = lineHeight(size, gap);
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, MARGIN_X + indent, y);
      y += lineH;
    }
  };

  const writeInline = (runs: InlineRun[], size = 10.5, indent = 0, gap = 1.3) => {
    const startX = MARGIN_X + indent;
    const rightX = MARGIN_X + CONTENT_W;
    const lineH = lineHeight(size, gap);
    let x = startX;
    const nextLine = () => {
      y += lineH;
      ensure(lineH);
      x = startX;
    };
    ensure(lineH);
    for (const run of runs) {
      const parts = String(run.text || "").split(/(\n|\s+)/).filter((part) => part !== "");
      for (const part of parts) {
        if (part === "\n") {
          nextLine();
          continue;
        }
        const font: PdfFont = run.code ? "courier" : "helvetica";
        doc.setFont(font, styleOf(run));
        doc.setFontSize(run.code ? Math.max(8.5, size - 0.8) : size);
        const isSpace = /^\s+$/.test(part);
        const text = isSpace ? " " : part;
        let width = doc.getTextWidth(text);
        if (!isSpace && x > startX && x + width > rightX) nextLine();
        if (!isSpace && width > rightX - startX) {
          const split = doc.splitTextToSize(text, rightX - startX) as string[];
          for (let i = 0; i < split.length; i += 1) {
            if (i > 0) nextLine();
            if (run.link) doc.textWithLink(split[i], x, y, { url: run.link });
            else doc.text(split[i], x, y);
            x += doc.getTextWidth(split[i]);
          }
          continue;
        }
        if (isSpace && x === startX) continue;
        if (x + width > rightX) nextLine();
        if (run.link && !isSpace) doc.textWithLink(text, x, y, { url: run.link });
        else doc.text(text, x, y);
        x += width;
      }
    }
    y += lineH;
  };

  const linkLine = (label: string, url: string) => {
    if (!url) {
      writeLines(label, 9);
      return;
    }
    const text = label ? `${label} - ${url}` : url;
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
          y += token.depth === 1 ? 2 : 1;
          const size = token.depth === 1 ? 17 : token.depth === 2 ? 14 : 11.5;
          const runs = inlineRuns(token.tokens, { bold: true });
          if (runs.length) writeInline(runs, size, indent, 1.8);
          else writeLines(plainInline(token.tokens, token.text), size, indent, "helvetica", "bold", 1.8);
          y += 1.5;
          break;
        }
        case "paragraph": {
          const runs = inlineRuns(token.tokens);
          if (runs.length) writeInline(runs, 10.5, indent);
          else writeLines(plainInline(token.tokens, token.text), 10.5, indent);
          y += 1.8;
          break;
        }
        case "text": {
          const runs = inlineRuns(token.tokens);
          if (runs.length) writeInline(runs, 10.5, indent);
          else writeLines(plainInline(token.tokens, token.text), 10.5, indent);
          break;
        }
        case "code":
          y += 1;
          writeLines(token.text || "", 8.5, indent + 3, "courier", "normal", 1.0);
          y += 2;
          break;
        case "blockquote":
          renderTokens(token.tokens || [], indent + 5);
          y += 1;
          break;
        case "list": {
          let n = token.start || 1;
          for (const item of token.items || []) {
            const prefix = token.ordered ? `${n}. ` : "• ";
            const bodyTokens = (item.tokens || []).flatMap((block: any) => block.tokens || []);
            const runs = [{ text: prefix, bold: false }, ...inlineRuns(bodyTokens)];
            if (runs.length > 1) writeInline(runs, 10.2, indent + 3);
            else writeLines(prefix + plainInline(bodyTokens, item.text || ""), 10.2, indent + 3);
            n += 1;
          }
          y += 1;
          break;
        }
        case "table": {
          const rows = [token.header, ...(token.rows || [])];
          for (let r = 0; r < rows.length; r += 1) {
            const text = rows[r].map((cell: any) => plainInline(cell.tokens, cell.text || "")).join(" | ");
            writeLines(text, r === 0 ? 9.2 : 8.8, indent + 2, "helvetica", r === 0 ? "bold" : "normal", 0.9);
          }
          y += 2;
          break;
        }
        case "hr":
          ensure(4);
          doc.line(MARGIN_X + indent, y, MARGIN_X + CONTENT_W, y);
          y += 4;
          break;
        case "space":
          y += 1;
          break;
        default: {
          const raw = typeof token.raw === "string" ? token.raw.trim() : "";
          if (raw) writeLines(raw.replace(/[*_~`]/g, ""), 10, indent);
        }
      }
    }
  };

  writeLines(data.conversation.title, 19, 0, "helvetica", "bold", 2);
  y += 2;
  writeLines(`Exported: ${data.conversation.exportedAt}`, 9);
  linkLine("Source", data.conversation.url);
  writeLines(`${data.messages.length} visible messages · ${data.diagnostics.extractionSource} extraction · visible current branch`, 9);
  if (data.toolTrace.length) writeLines(`${data.toolTrace.length} structured tool-trace event(s) preserved in chat.json.`, 8.5, 0, "helvetica", "italic", 0.8);
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
      } else if (asset.url) {
        linkLine(asset.name || asset.alt || (asset.kind === "image" ? "Image" : "Attachment"), asset.url);
      } else {
        writeLines(`Attachment: ${asset.name || "unnamed attachment"} (download target unavailable in rendered UI)`, 9, 0, "helvetica", "italic", 0.8);
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
