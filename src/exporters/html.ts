import type { ConversationExport } from "../shared/types";
import { escapeHtml } from "../shared/utils";

const STYLES = `
:root{color-scheme:dark;--bg:#171717;--panel:#212121;--panel2:#2a2a2a;--text:#ececec;--muted:#a6a6a6;--border:#3b3b3b;--link:#8ab4f8;--code:#111}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:var(--link);overflow-wrap:anywhere}main{max-width:980px;margin:0 auto;padding:48px 24px 80px}.hero{border-bottom:1px solid var(--border);padding-bottom:26px;margin-bottom:30px}.hero h1{font-size:30px;line-height:1.2;margin:0 0 14px}.meta{color:var(--muted);display:grid;gap:4px}.warning{background:#312b1b;border:1px solid #655625;padding:12px 14px;border-radius:10px;margin:16px 0}.message{margin:22px 0;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--panel)}.message.user{background:var(--panel2)}.message-header{display:flex;justify-content:space-between;gap:16px;padding:11px 16px;border-bottom:1px solid var(--border);font-size:13px}.role{font-weight:700}.timestamp,.model{color:var(--muted)}.message-body{padding:18px 20px}.message-body>:first-child{margin-top:0}.message-body>:last-child{margin-bottom:0}pre{white-space:pre;overflow:auto;background:var(--code);padding:14px;border-radius:9px;border:1px solid var(--border)}code{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}p code,li code{background:#111;padding:.1em .35em;border-radius:4px}table{width:100%;border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid var(--border);padding:7px 10px;text-align:left}blockquote{border-left:3px solid #777;margin-left:0;padding-left:14px;color:#cfcfcf}.details{border-top:1px dashed var(--border);margin-top:18px;padding-top:14px}.details h4{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.assets{margin-top:16px}.assets img{max-width:100%;height:auto;border-radius:10px;border:1px solid var(--border)}.sources{margin-top:44px;border-top:1px solid var(--border);padding-top:22px}.url{display:block;color:var(--muted);font-size:12px}@media print{:root{color-scheme:light;--bg:#fff;--panel:#fff;--panel2:#f8f8f8;--text:#111;--muted:#555;--border:#ccc;--link:#0645ad;--code:#f4f4f4}body{font-size:11pt}.message{break-inside:avoid}main{max-width:none;padding:0}.hero{margin-top:0}}
`;

function roleName(role: string): string {
  return role === "user" ? "You" : role === "assistant" ? "ChatGPT" : role === "tool" ? "Tool" : "Unknown";
}

function assetHtml(asset: ConversationExport["assets"][number]): string {
  if (asset.kind === "image") {
    const src = asset.dataUrl || asset.url;
    return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(asset.alt || asset.name || "image")}"><figcaption><a href="${escapeHtml(asset.url)}">${escapeHtml(asset.url)}</a></figcaption></figure>`;
  }
  return `<p>Attachment: <a href="${escapeHtml(asset.url)}">${escapeHtml(asset.name || asset.url)}</a><span class="url">${escapeHtml(asset.url)}</span></p>`;
}

export function exportHtml(data: ConversationExport): string {
  const messages = data.messages.map((message) => {
    const details = message.details.map((detail) => `<section class="details"><h4>${escapeHtml(detail.type)} · ${escapeHtml(detail.title)}</h4><div>${detail.html || `<pre>${escapeHtml(detail.text)}</pre>`}</div></section>`).join("");
    const assets = message.assets.length ? `<section class="assets">${message.assets.map(assetHtml).join("")}</section>` : "";
    return `<article class="message ${escapeHtml(message.role)}"><header class="message-header"><span class="role">${roleName(message.role)}</span><span>${message.model ? `<span class="model">${escapeHtml(message.model)}</span>` : ""}${message.createdAt ? ` · <span class="timestamp">${escapeHtml(message.createdAt)}</span>` : ""}</span></header><div class="message-body">${message.renderedHtml || `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>`}${details}${assets}</div></article>`;
  }).join("\n");

  const warnings = data.diagnostics.warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("");
  const sources = data.sources.length ? `<section class="sources"><h2>Sources</h2><ol>${data.sources.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.text || source.url)}</a><span class="url">${escapeHtml(source.url)}</span></li>`).join("")}</ol></section>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(data.conversation.title)}</title><style>${STYLES}</style></head><body><main><header class="hero"><h1>${escapeHtml(data.conversation.title)}</h1><div class="meta"><span>Exported: ${escapeHtml(data.conversation.exportedAt)}</span><span>Source: <a href="${escapeHtml(data.conversation.url)}">${escapeHtml(data.conversation.url)}</a></span><span>${data.messages.length} messages · ${escapeHtml(data.diagnostics.extractionSource)} extraction · visible current branch</span></div>${warnings}</header>${messages}${sources}</main></body></html>`;
}
