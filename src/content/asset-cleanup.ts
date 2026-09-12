import type { AssetRef, ConversationExport } from "../shared/types";

const SOURCE_CODE_EXTENSION = /\.(?:css|js|mjs|cjs|ts|tsx|jsx|py|java|go|rs)$/i;
const STATUS_PREFIX = /^(?:checked|reviewed|inspected|verified|examined|used|using|loaded|ran|running|pruefte|prüfte|ueberprueft|überprüft|ueberprüfte|überprüfte|analysiert|analysierte|verwendet|nutzte)\b/i;
const IMAGE_UI_PREFIX = /^(?:bild\s+öffnen|bild\s+oeffnen|open\s+image|view\s+image)\s*:\s*/i;
const FILE_ID_PATTERN = /file_[a-z0-9_]+/i;

function normalizedAssetName(value: string | null | undefined): string {
  return (value || "").replace(IMAGE_UI_PREFIX, "").trim().toLowerCase();
}

function assetFileIds(asset: AssetRef): string[] {
  return `${asset.id} ${asset.url}`.match(new RegExp(FILE_ID_PATTERN.source, "gi")) || [];
}

export function isLikelyStatusPseudoAttachment(asset: AssetRef): boolean {
  if (asset.kind !== "attachment") return false;
  if (asset.url || asset.mimeType || asset.dataUrl || asset.status !== "unavailable") return false;
  const name = (asset.name || "").trim();
  if (!name || !SOURCE_CODE_EXTENSION.test(name)) return false;
  return STATUS_PREFIX.test(name);
}

function redundantUnavailableAsset(asset: AssetRef, embedded: AssetRef[]): boolean {
  if (asset.status !== "unavailable" || asset.url || asset.dataUrl) return false;

  const name = normalizedAssetName(asset.name);
  if (name) {
    const matchingEmbeddedName = embedded.some((candidate) => normalizedAssetName(candidate.name) === name);
    if (matchingEmbeddedName && (asset.kind === "image" || IMAGE_UI_PREFIX.test(asset.name || ""))) return true;
  }

  const ids = assetFileIds(asset);
  if (!asset.name && ids.length) {
    return embedded.some((candidate) => {
      const candidateIds = new Set(assetFileIds(candidate).map((id) => id.toLowerCase()));
      return ids.some((id) => candidateIds.has(id.toLowerCase()));
    });
  }

  return false;
}

export function prunePseudoAttachments(data: ConversationExport): number {
  const embedded = data.assets.filter((asset) => asset.status === "embedded");
  const removedIds = new Set(
    data.assets
      .filter((asset) => isLikelyStatusPseudoAttachment(asset) || redundantUnavailableAsset(asset, embedded))
      .map((asset) => asset.id)
  );
  if (!removedIds.size) return 0;

  const shouldKeep = (asset: AssetRef) => !removedIds.has(asset.id)
    && !isLikelyStatusPseudoAttachment(asset)
    && !redundantUnavailableAsset(asset, embedded);
  data.assets = data.assets.filter(shouldKeep);
  for (const message of data.messages) message.assets = message.assets.filter(shouldKeep);
  return removedIds.size;
}
