import type { ConversationExport } from "../shared/types";

export function exportJson(data: ConversationExport): string {
  return JSON.stringify(data, null, 2);
}
