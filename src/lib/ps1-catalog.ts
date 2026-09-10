import { publicListedCatalog } from "./catalog";
import { getGameDetails } from "./indexes";
import { normalizePs1Serial } from "./ps1-regional";
import type { CatalogGame } from "./types";

let bySerial: Map<string, CatalogGame[]> | undefined;
let byWork: Map<string, CatalogGame[]> | undefined;

function indexes() {
  if (bySerial && byWork) return { bySerial, byWork };
  bySerial = new Map();
  byWork = new Map();
  for (const game of publicListedCatalog) {
    if (game.platformSlug !== "ps1") continue;
    if (game.workId) byWork.set(game.workId, [...(byWork.get(game.workId) ?? []), game]);
    if (game.regionalStatus !== "resolved") continue;
    for (const code of new Set([...(game.canonicalSerials ?? []), ...(game.resolutionSerials ?? [])])) {
      const key = normalizePs1Serial(code);
      bySerial.set(key, [...(bySerial.get(key) ?? []), game]);
    }
  }
  return { bySerial, byWork };
}

export function relatedPs1Editions(game: CatalogGame): CatalogGame[] {
  return game.workId
    ? (indexes().byWork.get(game.workId) ?? []).filter((other) => other.id !== game.id && other.regionalStatus === "resolved")
    : [];
}

export function ps1SerialEvidence(value: string) {
  const serial = normalizePs1Serial(value);
  const games = indexes().bySerial.get(serial) ?? [];
  return {
    platform: "ps1",
    serial,
    physicalVariantResolved: false,
    candidates: games.map((game) => ({
      game,
      edition: getGameDetails(game.id)?.ps1Edition,
    })),
  };
}
