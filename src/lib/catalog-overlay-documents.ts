import { mutateBlobJsonDocument, readBlobJsonDocument, type JsonMutation } from "./json-document-store";
import { buildCatalogSeoSlug } from "./catalog-url";
import type { CatalogGame } from "./types";

export const CATALOG_OVERLAY_PREFIX = "region-atlas/catalog/overlay";
export type OverlayIndexDocument = { updatedAt: string; ids: string[]; byPlatform: Record<string, string[]>; seoSlugs: Record<string, string> };
export function gameOverlayDocument(catalogId: string) {
  return {
    pathname: `${CATALOG_OVERLAY_PREFIX}/games/${catalogId}.json`,
    empty: (): CatalogGame | null => null,
    maximumSizeInBytes: 4 * 1024 * 1024,
    parse: (raw: string): CatalogGame | null => {
      const game = JSON.parse(raw) as CatalogGame;
      if (!game || game.id !== catalogId || !game.platformSlug || !game.region) throw new Error("Documento de catálogo no válido.");
      return game;
    },
  };
}
export async function readOverlayGameForWrite(catalogId: string) {
  return readBlobJsonDocument(gameOverlayDocument(catalogId));
}
export async function mutateOverlayGame<R>(catalogId: string, mutation: JsonMutation<CatalogGame | null, R>) {
  return mutateBlobJsonDocument(gameOverlayDocument(catalogId), mutation);
}
export async function mutateOverlayIndex(mutation: (index: OverlayIndexDocument) => OverlayIndexDocument) {
  return mutateBlobJsonDocument({
    pathname: `${CATALOG_OVERLAY_PREFIX}/index.json`,
    empty: (): OverlayIndexDocument => ({ updatedAt: "", ids: [], byPlatform: {}, seoSlugs: {} }),
    parse: (raw: string): OverlayIndexDocument => {
      const index = JSON.parse(raw) as OverlayIndexDocument;
      if (!index || !Array.isArray(index.ids) || !index.byPlatform || !index.seoSlugs) throw new Error("Índice de catálogo no válido; no se sobrescribe.");
      return index;
    },
  }, current => ({ next: { ...mutation(current), updatedAt: new Date().toISOString() }, result: undefined }));
}
export async function registerOverlayGame(game: CatalogGame) {
  await mutateOverlayIndex(index => ({
    ...index,
    ids: [...new Set([...index.ids, game.id])].sort(),
    byPlatform: { ...index.byPlatform, [game.platformSlug]: [...new Set([...(index.byPlatform[game.platformSlug] ?? []), game.id])].sort() },
    seoSlugs: { ...index.seoSlugs, [buildCatalogSeoSlug(game)]: game.id },
  }));
}
