import { normalizeWhitespace } from "../shared/utils";

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "img") {
    const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || "";
    const alt = el.getAttribute("alt") || "image";
    return src ? `![${alt}](${src})` : `[Image: ${alt}]`;
  }

  const annotation = tag === "math" ? el.querySelector('annotation[encoding="application/x-tex"]') : null;
  if (annotation?.textContent) return `$${annotation.textContent.trim()}$`;

  const content = Array.from(el.childNodes).map(inline).join("");
  if (tag === "strong" || tag === "b") return `**${content}**`;
  if (tag === "em" || tag === "i") return `_${content}_`;
  if (tag === "del" || tag === "s") return `~~${content}~~`;
  if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") return `\`${content}\``;
  if (tag === "a") {
    const href = (el as HTMLAnchorElement).href || el.getAttribute("href") || "";
    return href ? `[${content || href}](${href})` : content;
  }
  return content;
}

function listToMarkdown(list: HTMLElement, depth = 0): string {
  const ordered = list.tagName.toLowerCase() === "ol";
  const start = Number(list.getAttribute("start")) || 1;
  return Array.from(list.children)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((item, index) => {
      const li = item as HTMLElement;
      const nested = Array.from(li.children).filter((child) => /^(ul|ol)$/i.test(child.tagName)) as HTMLElement[];
      const clone = li.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(":scope > ul, :scope > ol").forEach((node) => node.remove());
      const marker = ordered ? `${start + index}.` : "-";
      let line = `${"  ".repeat(depth)}${marker} ${normalizeWhitespace(blocksToMarkdown(clone))}`;
      for (const child of nested) line += `\n${listToMarkdown(child, depth + 1)}`;
      return line;
    })
    .join("\n");
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) =>
      normalizeWhitespace(inline(cell)).replace(/\|/g, "\\|").replace(/\n/g, " ")
    )
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) => [...row, ...Array(Math.max(0, width - row.length)).fill("")];
  const output = [pad(rows[0]), Array(width).fill("---"), ...rows.slice(1).map(pad)];
  return output.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function block(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${normalizeWhitespace(inline(element))}`;
  if (tag === "p") return normalizeWhitespace(inline(element));
  if (tag === "ul" || tag === "ol") return listToMarkdown(element);
  if (tag === "blockquote") return normalizeWhitespace(blocksToMarkdown(element)).split("\n").map((line) => `> ${line}`).join("\n");
  if (tag === "pre") {
    const code = (element.querySelector("code") as HTMLElement | null) || element;
    const language = Array.from(code.classList).find((name) => name.startsWith("language-"))?.slice(9) || "";
    return `\`\`\`${language}\n${(code.textContent || "").replace(/\n$/, "")}\n\`\`\``;
  }
  if (tag === "table") return tableToMarkdown(element);
  if (tag === "hr") return "---";
  if (tag === "img") return inline(element);

  const katex = element.querySelector('annotation[encoding="application/x-tex"]');
  if (katex?.textContent && (element.classList.contains("katex-display") || element.getAttribute("data-math") === "display")) {
    return `$$\n${katex.textContent.trim()}\n$$`;
  }
  return blocksToMarkdown(element);
}

export function blocksToMarkdown(root: Element): string {
  const parts: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.nodeValue?.trim()) parts.push(child.nodeValue.trim());
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const value = block(child as HTMLElement);
      if (value) parts.push(value);
    }
  }
  return normalizeWhitespace(parts.join("\n\n"));
}
