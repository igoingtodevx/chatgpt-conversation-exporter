import type { ConversationExport, ExtractResponse, ExtractionOptions } from "../shared/types";
import { exportBasename } from "../shared/utils";
import { exportJson } from "../exporters/json";
import { exportMarkdown } from "../exporters/markdown";
import { exportHtml } from "../exporters/html";
import { exportPdf } from "../exporters/pdf";
import { exportArchive } from "../exporters/archive";

const button = document.querySelector<HTMLButtonElement>("#export")!;
const status = document.querySelector<HTMLDivElement>("#status")!;

function checked(id: string): boolean {
  return Boolean(document.querySelector<HTMLInputElement>(`#${id}`)?.checked);
}

function format(): string {
  return document.querySelector<HTMLInputElement>('input[name="format"]:checked')?.value || "complete";
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab was found.");
  if (!tab.url?.startsWith("https://chatgpt.com/")) throw new Error("Open a ChatGPT conversation on chatgpt.com first.");
  return tab;
}

async function extract(tabId: number, options: ExtractionOptions): Promise<ConversationExport> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const response = await chrome.tabs.sendMessage(tabId, { type: "CGE_EXTRACT", options }) as ExtractResponse;
  if (!response?.ok || !response.data) throw new Error(response?.error || "Chat extraction failed.");
  return response.data;
}

function downloadBlob(blob: Blob, filename: string): Promise<number> {
  const url = URL.createObjectURL(blob);
  return chrome.downloads.download({ url, filename, saveAs: true }).finally(() => {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

async function run(): Promise<void> {
  button.disabled = true;
  try {
    const tab = await activeTab();
    status.textContent = "Reading the visible branch and loading conversation turns…";
    const data = await extract(tab.id!, {
      loadAll: checked("loadAll"),
      includeReasoning: checked("reasoning"),
      includeTools: checked("tools"),
      includeTimestamps: checked("timestamps"),
      captureImages: checked("images")
    });

    status.textContent = `Captured ${data.messages.length} messages, ${data.assets.length} assets, ${data.sources.length} sources.\nBuilding ${format()} export…`;
    const base = exportBasename(data.conversation.title, data.conversation.exportedAt);
    const selected = format();

    if (selected === "json") {
      await downloadBlob(new Blob([exportJson(data)], { type: "application/json;charset=utf-8" }), `${base}.json`);
    } else if (selected === "markdown") {
      await downloadBlob(new Blob([exportMarkdown(data)], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
    } else if (selected === "html") {
      await downloadBlob(new Blob([exportHtml(data)], { type: "text/html;charset=utf-8" }), `${base}.html`);
    } else if (selected === "pdf") {
      const pdf = await exportPdf(data);
      await downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), `${base}.pdf`);
    } else {
      const zip = await exportArchive(data, selected === "complete");
      const suffix = selected === "complete" ? "Complete Archive" : "AI Export";
      await downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `${base} - ${suffix}.zip`);
    }

    const warning = data.diagnostics.warnings.length ? ` ${data.diagnostics.warnings.length} warning(s) recorded in the export.` : "";
    status.textContent = `Done: ${data.messages.length} messages exported.${warning}`;
  } catch (error) {
    status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", () => void run());
