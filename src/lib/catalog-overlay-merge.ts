import type { CatalogGame } from "./types";

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
      byId.set(overlay.id, overlay);
    } else {
      byId.delete(overlay.id);
    }
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
}
