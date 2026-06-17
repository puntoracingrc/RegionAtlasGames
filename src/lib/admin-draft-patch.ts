import type { AdminGameDraft } from "./admin-draft-types";
import type { CatalogGame, GameDetails } from "./types";
import { catalogIdFromStaging } from "./pc-path-guess";

export function draftFromCatalogGame(
  game: CatalogGame,
  details: GameDetails | null | undefined,
): AdminGameDraft {
  return {
    pcId: game.pcId ?? 0,
    catalogId: game.id,
    slug: game.slug,
    title: game.title,
    titlePc: game.titlePc,
    platformSlug: game.platformSlug,
    region: game.region,
    physicalVariant: game.physicalVariant ?? null,
    edition: game.edition || "standard",
    reference: details?.reference ?? null,
    coverUrl: game.coverUrl,
    year: details?.year ?? null,
    releaseDate: details?.releaseDate ?? null,
    players: details?.players ?? null,
    support: details?.support ?? null,
    developerName: details?.developer?.name ?? null,
    developerSlug: details?.developer?.slug ?? null,
    publisherName: details?.publisher?.name ?? null,
    publisherSlug: details?.publisher?.slug ?? null,
    genreNames: details?.genres?.map((g) => g.name).filter(Boolean) ?? [],
    description: details?.description ?? null,
    seoMeta: details?.seoMeta ?? null,
    descriptionMeta: details?.descriptionMeta ?? null,
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}

export function recomputeCatalogId(draft: Pick<AdminGameDraft, "platformSlug" | "slug" | "region">) {
  return catalogIdFromStaging({
    platformSlug: draft.platformSlug,
    slug: draft.slug,
    region: draft.region,
  });
}

export function applyDraftPatch(
  draft: AdminGameDraft,
  body: Partial<Record<string, unknown>>,
): AdminGameDraft {
  const next = { ...draft };

  const assignString = (key: keyof AdminGameDraft, value: unknown) => {
    if (typeof value === "string") (next[key] as string | null) = value.trim() || null;
  };
  const assignNumber = (key: "year" | "players", value: unknown) => {
    if (value === null || value === "") next[key] = null;
    else if (typeof value === "number") next[key] = value;
    else if (typeof value === "string") {
      const n = Number.parseInt(value, 10);
      next[key] = Number.isFinite(n) ? n : null;
    }
  };

  if (typeof body.title === "string") next.title = body.title.trim();
  if (typeof body.slug === "string") next.slug = body.slug.trim();
  if (typeof body.platformSlug === "string") next.platformSlug = body.platformSlug;
  if (typeof body.region === "string") next.region = body.region;
  if (typeof body.physicalVariant === "string") next.physicalVariant = body.physicalVariant.trim() || null;
  if (typeof body.edition === "string") next.edition = body.edition;
  assignString("reference", body.reference);
  assignString("coverUrl", body.coverUrl);
  assignString("releaseDate", body.releaseDate);
  assignString("support", body.support);
  assignString("developerName", body.developerName);
  assignString("developerSlug", body.developerSlug);
  assignString("publisherName", body.publisherName);
  assignString("publisherSlug", body.publisherSlug);
  assignNumber("year", body.year);
  assignNumber("players", body.players);
  if (typeof body.description === "string") next.description = body.description.trim() || null;
  if (Array.isArray(body.genreNames)) {
    next.genreNames = body.genreNames.filter((g): g is string => typeof g === "string");
  }

  next.catalogId = recomputeCatalogId(next);
  next.updatedAt = new Date().toISOString();
  return next;
}
