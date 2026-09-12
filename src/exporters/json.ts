import type { ConversationExport } from "../shared/types";

function installedVersion(fallback: string): string {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version || fallback;
    }
  } catch {
    // Non-extension test/build environments use the captured fallback version.
  }
  return fallback;
}

export function exportJson(data: ConversationExport): string {
  const normalized: ConversationExport = {
    ...data,
    generator: {
      ...data.generator,
      version: installedVersion(data.generator.version)
    }
  };
  return JSON.stringify(normalized, null, 2);
}
