import { revalidateTag } from "next/cache";
import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { canonicalCatalogId } from "./catalog-id-aliases";
import { mergeCatalogGameWithOverlay } from "./catalog-overlay-merge";
import { catalogOverlayEnabled } from "./catalog-runtime-overlay";
import { mutateOverlayGame, readOverlayGameForWrite, registerOverlayGame } from "./catalog-overlay-documents";
import { planDirectPrice, PriceConnectorError, type PriceSubmission } from "./direct-price-connector";
import type { CatalogGame } from "./types";

function resolveGame(catalogId: string, overlay: CatalogGame | null): CatalogGame {
  const base = getCatalogGame(catalogId);
  const game = base && overlay ? mergeCatalogGameWithOverlay(base, overlay) : overlay ?? base;
  if (!game || game.id !== catalogId || canonicalCatalogId(catalogId) !== catalogId || !isPublicCatalogGame(game)) throw new PriceConnectorError(404, "No existe esa ficha exacta en el catálogo público.");
  return game;
}

export async function publishDirectPrice(input: PriceSubmission, mode: "preview" | "publish") {
  if (!catalogOverlayEnabled()) throw new PriceConnectorError(503, "Almacenamiento persistente no disponible; no se escribirá en disco local.");
  const now = new Date().toISOString();
  if (mode === "preview") {
    const plan = planDirectPrice(resolveGame(input.catalogId, await readOverlayGameForWrite(input.catalogId)), input, now);
    return { ok: true, mode, alreadyApplied: plan.alreadyApplied, receipt: plan.receipt };
  }
  const plan = await mutateOverlayGame(input.catalogId, current => {
    const planned = planDirectPrice(resolveGame(input.catalogId, current), input, now);
    return { next: planned.game, result: planned, changed: !planned.alreadyApplied };
  });
  // A retry repairs index/cache publication even if the first response was lost
  // after the atomic price+receipt write. It never blends the price again.
  await registerOverlayGame(plan.game);
  revalidateTag("catalog-overlay", { expire: 0 });
  return { ok: true, mode, alreadyApplied: plan.alreadyApplied, receipt: plan.receipt };
}
