import { draftFromManualInput } from "./admin-draft-storage";
import { getPublishedGameForAdmin, publishAdminGameDraft } from "./admin-catalog-publish";
import { buildCatalogSeoSlug } from "./catalog-url";
import { catalogOverlayEnabled } from "./catalog-runtime-overlay";
import { CatalogConnectorError, catalogSubmissionDigest, type CatalogSubmission } from "./direct-catalog-connector";
import { slugify } from "./slug";

function sameIdentity(
  game: Awaited<ReturnType<typeof getPublishedGameForAdmin>>,
  input: CatalogSubmission,
): boolean {
  if (!game) return false;
  return game.game.title === input.title &&
    game.game.platformSlug === input.platformSlug &&
    game.game.region === input.region &&
    (game.game.physicalVariant ?? null) === input.physicalVariant;
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
    if (!sameIdentity(existing, input)) {
      throw new CatalogConnectorError(409, "El identificador calculado ya pertenece a otra edición física.");
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
