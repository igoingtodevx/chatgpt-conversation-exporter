import { extractConversation } from "./extractor";
import type { ExtractResponse, ExtractionOptions } from "../shared/types";

declare global {
  interface Window { __chatgptExporterInstalled?: boolean; }
}

if (!window.__chatgptExporterInstalled) {
  window.__chatgptExporterInstalled = true;
  chrome.runtime.onMessage.addListener((request: { type?: string; options?: ExtractionOptions }, _sender, sendResponse) => {
    if (request?.type !== "CGE_EXTRACT") return false;
    (async () => {
      try {
        const data = await extractConversation(request.options || {
          loadAll: true,
          includeReasoning: true,
          includeTools: true,
          includeTimestamps: true,
          captureImages: true
        });
        sendResponse({ ok: true, data } satisfies ExtractResponse);
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ExtractResponse);
      }
    })();
    return true;
  });
}
