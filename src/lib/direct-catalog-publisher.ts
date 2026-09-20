import { draftFromManualInput } from "./admin-draft-storage";
import {
  getPublishedGameForAdmin,
  mergeCatalogFromDraft,
  mergeDetailsFromDraft,
  publishAdminGameDraft,
} from "./admin-catalog-publish";
import { buildCatalogSeoSlug } from "./catalog-url";
import { catalogOverlayEnabled, writeCatalogOverlay } from "./catalog-runtime-overlay";
import { CatalogConnectorError, catalogSubmissionDigest, type CatalogSubmission } from "./direct-catalog-connector";
import { slugify } from "./slug";

type ExistingIdentity = {
  title: string;
  platformSlug: string;
  region: string;
  physicalVariant?: string | null;
  listingStatus?: string | null;
};

export function classifyExistingCatalogIdentity(
  game: ExistingIdentity,
  input: CatalogSubmission,
): "alreadyApplied" | "reactivate" | "conflict" {
  const sameBaseIdentity = game.title === input.title &&
    game.platformSlug === input.platformSlug &&
    game.region === input.region;
  if (!sameBaseIdentity) return "conflict";
  if (game.listingStatus === "excluded") return "reactivate";
  return (game.physicalVariant ?? null) === input.physicalVariant ? "alreadyApplied" : "conflict";
}

export async function publishDirectCatalog(input: CatalogSubmission, mode: "preview" | "publish") {
  if (!catalogOverlayEnabled()) {
    throw new CatalogConnectorError(503, "Almacenamiento persistente no disponible; no se escribirá en disco local.");
  }

  const draft = draftFromManualInput({
    title: input.title,
    platformSlug: input.platformSlug,
    region: input.region,
    workId: slugify(input.title.replace(/\s*\[[^\]]+\]\s*$/, "")),
    regionalStatus: "resolved",
    marketRegion: "España",
    physicalVariant: input.physicalVariant,
    pcId: 0,
  });
  const digest = catalogSubmissionDigest(input);
  const existing = await getPublishedGameForAdmin(draft.catalogId);
  if (existing) {
    const classification = classifyExistingCatalogIdentity(existing.game, input);
    if (classification === "conflict") {
      throw new CatalogConnectorError(409, "El identificador calculado ya pertenece a otra edición física.");
    }
    if (classification === "reactivate") {
      if (mode === "publish") {
        const game = {
          ...mergeCatalogFromDraft(existing.game, draft),
          listingStatus: "listed" as const,
        };
        const details = mergeDetailsFromDraft(existing.details, draft);
        const saved = await writeCatalogOverlay({ game, details });
        if ("error" in saved) throw new CatalogConnectorError(503, saved.error);
        return {
          ok: true,
          mode,
          alreadyApplied: false,
          reactivated: true,
          batchId: input.batchId,
          digest,
          catalogId: game.id,
          url: `/catalogo/${buildCatalogSeoSlug(game)}`,
        };
      }
      return {
        ok: true,
        mode,
        alreadyApplied: false,
        reactivated: true,
        batchId: input.batchId,
        digest,
        catalogId: existing.game.id,
        url: `/catalogo/${buildCatalogSeoSlug(existing.game)}`,
      };
    }
    return {
      ok: true,
      mode,
      alreadyApplied: true,
      batchId: input.batchId,
      digest,
      catalogId: existing.game.id,
      url: `/catalogo/${buildCatalogSeoSlug(existing.game)}`,
    };
  }

  if (mode === "preview") {
    return {
      ok: true,
      mode,
      alreadyApplied: false,
      batchId: input.batchId,
      digest,
      catalogId: draft.catalogId,
      url: `/catalogo/${draft.catalogId}`,
    };
  }

  const result = await publishAdminGameDraft(draft, { triggerDeploy: false });
  if ("error" in result) throw new CatalogConnectorError(409, result.error);
  return {
    ok: true,
    mode,
    alreadyApplied: false,
    batchId: input.batchId,
    digest,
    catalogId: result.catalogId,
    url: result.url,
  };
}
