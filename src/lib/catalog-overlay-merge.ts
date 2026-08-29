import type { CatalogGame } from "./types";

const TODOCONSOLAS_SOURCE_FIELDS = [
  "tcnsRetailPrice",
  "tcnsProductUrl",
  "tcnsMatchedAt",
  "tcnsCondition",
  "tcnsInStock",
] as const satisfies readonly (keyof CatalogGame)[];

function sourceTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function mergeCatalogGameWithOverlay(
  staticGame: CatalogGame,
  overlayGame: CatalogGame,
): CatalogGame {
  if (staticGame.id !== overlayGame.id) return overlayGame;

  const merged = { ...overlayGame };
  if (
    sourceTimestamp(staticGame.tcnsMatchedAt) >
    sourceTimestamp(overlayGame.tcnsMatchedAt)
  ) {
    for (const field of TODOCONSOLAS_SOURCE_FIELDS) {
      (merged as Record<keyof CatalogGame, unknown>)[field] = staticGame[field];
    }
  }

  return merged;
}

export function resolveCatalogOverlayCandidate(
  param: string,
  staticGame: CatalogGame | undefined,
  overlayIds: readonly string[],
  overlaySeoSlugs: Readonly<Record<string, string>>,
): string | null {
  const directOverlayId = overlaySeoSlugs[param] ?? (overlayIds.includes(param) ? param : null);
  if (directOverlayId) return directOverlayId;
  if (staticGame && overlayIds.includes(staticGame.id)) return staticGame.id;
  return null;
}

export function mergeCatalogPlatformGames(
  platformSlug: string,
  staticGames: readonly CatalogGame[],
  overlayGames: readonly CatalogGame[],
): CatalogGame[] {
  const byId = new Map(staticGames.map((game) => [game.id, game]));

  for (const overlay of overlayGames) {
    if (overlay.platformSlug === platformSlug) {
      const staticGame = byId.get(overlay.id);
      byId.set(
        overlay.id,
        staticGame ? mergeCatalogGameWithOverlay(staticGame, overlay) : overlay,
      );
    } else {
      byId.delete(overlay.id);
    }
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
}
