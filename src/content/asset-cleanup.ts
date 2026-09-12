import type { AssetRef, ConversationExport } from "../shared/types";

const SOURCE_CODE_EXTENSION = /\.(?:css|js|mjs|cjs|ts|tsx|jsx|py|java|go|rs)$/i;
const STATUS_PREFIX = /^(?:checked|reviewed|inspected|verified|examined|used|using|loaded|ran|running|pruefte|prüfte|ueberprueft|überprüft|ueberprüfte|überprüfte|analysiert|analysierte|verwendet|nutzte)\b/i;

export function isLikelyStatusPseudoAttachment(asset: AssetRef): boolean {
  if (asset.kind !== "attachment") return false;
  if (asset.url || asset.mimeType || asset.dataUrl || asset.status !== "unavailable") return false;
  const name = (asset.name || "").trim();
  if (!name || !SOURCE_CODE_EXTENSION.test(name)) return false;
  return STATUS_PREFIX.test(name);
}

export function prunePseudoAttachments(data: ConversationExport): number {
  const removedIds = new Set(
    data.assets.filter(isLikelyStatusPseudoAttachment).map((asset) => asset.id)
  );
  if (!removedIds.size) return 0;

  const shouldKeep = (asset: AssetRef) => !removedIds.has(asset.id) && !isLikelyStatusPseudoAttachment(asset);
  data.assets = data.assets.filter(shouldKeep);
  for (const message of data.messages) message.assets = message.assets.filter(shouldKeep);
  return removedIds.size;
}
