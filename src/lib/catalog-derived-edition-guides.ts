import { publicListedCatalog } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import {
  catalogBroadRegionFromMarketRegion,
  catalogBroadRegionFromLegacyRegion,
  catalogPhysicalEditionTypeLabel,
  isCatalogMarketRegion,
  type CatalogEditionFamily,
  type CatalogEditionGuideModel,
  type CatalogPhysicalEdition,
  type CatalogPhysicalEditionType,
  type CatalogPhysicalPriceCondition,
} from "./catalog-edition-guide-types";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { decodeHtmlEntities } from "./decode-html-entities";
import {
  ORIGINAL_GAME_CONTENT_LABELS,
  resolveOriginalGameContents,
} from "./original-game-contents";
import { regionSortRank } from "./platform-catalog-insights";
import { getRegionDisplay } from "./region-display";
import { slugify } from "./slug";
import type { CatalogGame } from "./types";

const publicCatalogById = new Map(publicListedCatalog.map((game) => [game.id, game]));

const FAMILY_TYPE_ORDER: CatalogPhysicalEditionType[] = [
  "STANDARD",
  "SPECIAL",
  "COLLECTOR",
  "DELUXE",
  "LIMITED",
  "STEELBOOK",
  "COMPILATION",
  "BUDGET_REISSUE",
  "OTHER",
];

function normalizedIdentity(value: string | null | undefined): string {
  return decodeHtmlEntities(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleIdentity(game: CatalogGame): string {
  return `${game.platformSlug}:title:${normalizedIdentity(game.title)}`;
}

function workIdentity(game: CatalogGame): string | null {
  return game.workId && game.regionalStatus === "resolved"
    ? `${game.platformSlug}:work:${game.workId}`
    : null;
}

const resolvedWorkIdentitiesByTitle = new Map<string, Set<string>>();
for (const game of publicListedCatalog) {
  const resolvedWork = workIdentity(game);
  if (!resolvedWork) continue;
  const titleKey = titleIdentity(game);
  const identities = resolvedWorkIdentitiesByTitle.get(titleKey) ?? new Set<string>();
  identities.add(resolvedWork);
  resolvedWorkIdentitiesByTitle.set(titleKey, identities);
}

function derivedRelationshipIdentity(game: CatalogGame): string {
  const resolvedWork = workIdentity(game);
  if (resolvedWork) return resolvedWork;

  const titleKey = titleIdentity(game);
  const resolvedCandidates = resolvedWorkIdentitiesByTitle.get(titleKey);
  return resolvedCandidates?.size === 1
    ? resolvedCandidates.values().next().value!
    : titleKey;
}

function relationshipKeys(game: CatalogGame): string[] {
  const resolvedWork = workIdentity(game);
  return [resolvedWork ?? titleIdentity(game)];
}

export function catalogDerivedEditionType(game: CatalogGame): CatalogPhysicalEditionType {
  const editionIdentity = normalizedIdentity(`${game.edition} ${game.physicalVariant ?? ""}`);
  const title = normalizedIdentity(game.title);
  const has = (pattern: RegExp) => pattern.test(editionIdentity);
  const titleHas = (pattern: RegExp) => pattern.test(title);

  if (has(/steelbook|steel book/) || titleHas(/steelbook|steel book/)) return "STEELBOOK";
  if (has(/collector|coleccionista/) || titleHas(/collector s edition|edicion coleccionista/)) return "COLLECTOR";
  if (has(/deluxe/) || titleHas(/deluxe edition/)) return "DELUXE";
  if (has(/limited|limitada/) || titleHas(/limited edition|edicion limitada/)) return "LIMITED";
  if (has(/special|especial|lenticular/) || titleHas(/special edition|edicion especial|lenticular/)) return "SPECIAL";
  if (has(/compilation|recopilatorio|trilogy|double pack|twin pack/)) return "COMPILATION";
  if (has(/platinum|essentials|greatest hits|the best|best hits|best collection|reprint|rerelease|reedicion|value|classics|classic|budget|superlite|simple 1500|major wave|capkore|ultimate hits|best price/)) {
    return "BUDGET_REISSUE";
  }
  if (!editionIdentity || editionIdentity === "standard" || editionIdentity === "standard edition") return "STANDARD";
  return "OTHER";
}

function humanize(value: string): string {
  return decodeHtmlEntities(value)
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\p{L}/gu, (character) => character.toLocaleUpperCase("es"));
}

function familyIdentity(game: CatalogGame): string {
  const type = catalogDerivedEditionType(game);
  if (type !== "BUDGET_REISSUE" && type !== "OTHER") return type;
  return `${type}:${normalizedIdentity(game.edition || game.physicalVariant || type)}`;
}

function familyLabel(game: CatalogGame): string {
  const type = catalogDerivedEditionType(game);
  if (type === "BUDGET_REISSUE" || type === "OTHER") {
    const raw = game.edition?.trim() || game.physicalVariant?.trim();
    if (raw) return humanize(raw);
  }
  return catalogPhysicalEditionTypeLabel(type);
}

function priceConditions(type: CatalogPhysicalEditionType): CatalogPhysicalPriceCondition[] {
  if (["SPECIAL", "COLLECTOR", "DELUXE", "LIMITED", "STEELBOOK"].includes(type)) {
    return ["sealed", "newRetail", "complete"];
  }
  return ["sealed", "newRetail", "complete", "gameManual", "loose"];
}

function exactMarketRegions(game: CatalogGame): string[] {
  if (isCatalogMarketRegion(game.marketRegion ?? "")) return [game.marketRegion!];
  if (/\/|por determinar/i.test(game.region)) return [];
  const flagCode = getRegionDisplay(game.region).flagCode;
  return isCatalogMarketRegion(flagCode) ? [flagCode] : [];
}

function physicalEditionFromCatalog(game: CatalogGame): CatalogPhysicalEdition {
  const scan = getOwnedScanSetById(game.id);
  const originalContents = resolveOriginalGameContents(game);
  const marketRegions = exactMarketRegions(game);
  const catalogNumber = scan?.packaging.reference
    ?? (game.regionalStatus === "resolved" ? game.canonicalSerials?.join(" / ") : undefined)
    ?? (game.regionalStatus === "resolved" ? game.resolutionSerials?.join(" / ") : undefined);
  const physicalContents = originalContents.explicit
    ? [
        "Caja",
        "Juego",
        ...originalContents.contents.map((content) => ORIGINAL_GAME_CONTENT_LABELS[content]),
      ]
    : [];

  return {
    id: `catalog-edition-${game.id}`,
    label: familyLabel(game),
    broadRegion: marketRegions.length === 1
      ? catalogBroadRegionFromMarketRegion(marketRegions[0])
      : catalogBroadRegionFromLegacyRegion(game.regionFamily ?? game.region),
    editionType: catalogDerivedEditionType(game),
    collectionIdentity: "catalog-entry",
    marketRegions,
    packagingLanguages: scan?.packaging.languages ?? [],
    componentLanguageEvidence: [],
    ratingSystems: [],
    ...(scan?.packaging.ean ? { barcode: scan.packaging.ean } : {}),
    ...(catalogNumber ? { catalogNumber } : {}),
    physicalContents,
    digitalContents: [],
    catalogIds: [game.id],
    catalogLinks: [{
      catalogId: game.id,
      href: catalogGamePath(game),
      current: false,
      region: game.region,
    }],
    scanSetIds: scan ? [game.id] : [],
    evidence: [],
    images: [],
    includesEditionIds: [],
    includesVariantIds: [],
    containsCatalogIds: [],
    variants: [],
    notes: [],
  };
}

function representative(games: CatalogGame[]): CatalogGame {
  return [...games].sort((left, right) => {
    const regionRank = regionSortRank(left.region) - regionSortRank(right.region);
    if (regionRank) return regionRank;
    const coverRank = Number(Boolean(right.coverUrl)) - Number(Boolean(left.coverUrl));
    if (coverRank) return coverRank;
    return left.id.localeCompare(right.id, "es");
  })[0];
}

function uniqueFamilyId(base: string, used: Set<string>): string {
  const stem = `catalog-family-${slugify(base) || "edition"}`;
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}-${suffix++}`;
  used.add(id);
  return id;
}

function buildGuide(games: CatalogGame[]): CatalogEditionGuideModel {
  const editionsByFamily = new Map<string, CatalogGame[]>();
  for (const game of games) {
    const key = familyIdentity(game);
    editionsByFamily.set(key, [...(editionsByFamily.get(key) ?? []), game]);
  }
  const usedFamilyIds = new Set<string>();
  const sortedFamilies = [...editionsByFamily.values()].sort((left, right) => {
    const typeDiff = FAMILY_TYPE_ORDER.indexOf(catalogDerivedEditionType(left[0]))
      - FAMILY_TYPE_ORDER.indexOf(catalogDerivedEditionType(right[0]));
    if (typeDiff) return typeDiff;
    return familyLabel(left[0]).localeCompare(familyLabel(right[0]), "es");
  });
  const editions = sortedFamilies.flatMap((familyGames) => [...familyGames]
    .sort((left, right) => regionSortRank(left.region) - regionSortRank(right.region) || left.id.localeCompare(right.id, "es"))
    .map(physicalEditionFromCatalog));
  const families: CatalogEditionFamily[] = sortedFamilies.map((familyGames) => {
    const first = familyGames[0];
    const label = familyLabel(first);
    return {
      id: uniqueFamilyId(familyIdentity(first), usedFamilyIds),
      label,
      representativeCatalogId: representative(familyGames).id,
      physicalEditionIds: familyGames.map((game) => `catalog-edition-${game.id}`),
      priceConditions: priceConditions(catalogDerivedEditionType(first)),
    };
  });
  const standardFamily = families.find((family) => {
    const edition = editions.find((candidate) => family.physicalEditionIds.includes(candidate.id));
    return edition?.editionType === "STANDARD";
  });
  const canonicalCatalogId = standardFamily?.representativeCatalogId ?? families[0].representativeCatalogId;
  const canonical = games.find((game) => game.id === canonicalCatalogId) ?? representative(games);

  return {
    schemaVersion: 2,
    origin: "catalog-derived",
    id: `catalog-derived-${canonical.id}`,
    title: `Ediciones físicas de ${decodeHtmlEntities(canonical.title)}`,
    reviewedAt: "",
    note: "Relación construida con las fichas regionales públicas que ya existen en el catálogo.",
    game: {
      title: decodeHtmlEntities(canonical.title),
      platformSlug: canonical.platformSlug,
      canonicalCatalogId,
    },
    physicalEditions: editions,
    editionFamilies: families,
    sharedDiscs: [],
    sources: [],
    evidenceNote: "Solo las fichas publicadas cuentan como evidencia regional; los candidatos del worker no se incorporan.",
  };
}

function cloneGuide(guide: CatalogEditionGuideModel): CatalogEditionGuideModel {
  return {
    ...guide,
    physicalEditions: guide.physicalEditions.map((edition) => ({
      ...edition,
      catalogIds: [...edition.catalogIds],
      catalogLinks: edition.catalogLinks.map((link) => ({ ...link })),
    })),
    editionFamilies: guide.editionFamilies.map((family) => ({
      ...family,
      physicalEditionIds: [...family.physicalEditionIds],
      priceConditions: [...family.priceConditions],
    })),
  };
}

function matchingFamily(guide: CatalogEditionGuideModel, game: CatalogGame): CatalogEditionFamily | undefined {
  const type = catalogDerivedEditionType(game);
  const candidates = guide.editionFamilies.filter((family) => {
    const first = guide.physicalEditions.find((edition) => family.physicalEditionIds.includes(edition.id));
    return first?.editionType === type;
  });
  if (candidates.length === 1) return candidates[0];
  const identity = normalizedIdentity(game.edition || game.physicalVariant);
  return candidates.find((family) => {
    const label = normalizedIdentity(family.label);
    return identity && (label.includes(identity) || identity.includes(label));
  });
}

function documentedGuideCandidates(
  guides: CatalogEditionGuideModel[],
  game: CatalogGame,
): number[] {
  const gameKeys = new Set(relationshipKeys(game));
  return guides.flatMap((guide, index) => {
    if (guide.game.platformSlug !== game.platformSlug) return [];
    const linkedGames = guide.physicalEditions.flatMap((edition) => edition.catalogIds.flatMap((catalogId) => {
      const linkedGame = publicCatalogById.get(catalogId);
      return linkedGame ? [linkedGame] : [];
    }));
    const guideKeys = new Set([
      `${guide.game.platformSlug}:title:${normalizedIdentity(guide.game.title)}`,
      ...linkedGames.flatMap(relationshipKeys),
    ]);
    return [...gameKeys].some((key) => guideKeys.has(key)) ? [index] : [];
  });
}

function addCatalogGameToGuide(
  sourceGuide: CatalogEditionGuideModel,
  game: CatalogGame,
  catalogById: Map<string, CatalogGame>,
): CatalogEditionGuideModel {
  const guide = cloneGuide(sourceGuide);
  const edition = physicalEditionFromCatalog(game);
  guide.physicalEditions.push(edition);
  let family = matchingFamily(guide, game);
  if (!family) {
    const used = new Set(guide.editionFamilies.map((candidate) => candidate.id));
    family = {
      id: uniqueFamilyId(familyIdentity(game), used),
      label: familyLabel(game),
      representativeCatalogId: game.id,
      physicalEditionIds: [],
      priceConditions: priceConditions(edition.editionType),
    };
    guide.editionFamilies.push(family);
  }
  family.physicalEditionIds.push(edition.id);
  const familyGames = family.physicalEditionIds.flatMap((editionId) => {
    const familyEdition = guide.physicalEditions.find((candidate) => candidate.id === editionId);
    const catalogId = familyEdition?.catalogIds[0];
    const catalogGame = catalogId ? catalogById.get(catalogId) : undefined;
    return catalogGame ? [catalogGame] : [];
  });
  if (familyGames.length) family.representativeCatalogId = representative(familyGames).id;
  return guide;
}

/**
 * Amplía las guías documentales con nuevas fichas públicas inequívocas. Esta es
 * la conexión que permite que una región validada por el worker aparezca en V2
 * sin editar manualmente el dossier previo.
 */
export function extendDocumentedGuidesWithCatalog(
  inputGuides: CatalogEditionGuideModel[],
): CatalogEditionGuideModel[] {
  const guides = inputGuides.map(cloneGuide);
  const claimed = new Set(guides.flatMap((guide) => guide.physicalEditions.flatMap((edition) => edition.catalogIds)));
  const guidesByRelationship = new Map<string, Set<number>>();

  guides.forEach((guide, index) => {
    const linkedGames = guide.physicalEditions.flatMap((edition) => edition.catalogIds.flatMap((catalogId) => {
      const game = publicCatalogById.get(catalogId);
      return game ? [game] : [];
    }));
    const keys = new Set([
      `${guide.game.platformSlug}:title:${normalizedIdentity(guide.game.title)}`,
      ...linkedGames.flatMap(relationshipKeys),
    ]);
    for (const key of keys) {
      const matches = guidesByRelationship.get(key) ?? new Set<number>();
      matches.add(index);
      guidesByRelationship.set(key, matches);
    }
  });

  for (const game of publicListedCatalog) {
    if (claimed.has(game.id) || game.listingStatus !== "listed") continue;
    const candidates = new Set(relationshipKeys(game).flatMap((key) => [...(guidesByRelationship.get(key) ?? [])]));
    if (candidates.size !== 1) continue;
    const guide = guides[[...candidates][0]];
    if (guide.game.platformSlug !== game.platformSlug) continue;

    guides[[...candidates][0]] = addCatalogGameToGuide(guide, game, publicCatalogById);
    claimed.add(game.id);
  }

  return guides;
}

type DerivedGuideIndex = {
  byCatalogId: Map<string, CatalogEditionGuideModel>;
  guides: CatalogEditionGuideModel[];
};

export function buildCatalogDerivedGuideIndex(excludedCatalogIds: Set<string>): DerivedGuideIndex {
  const groups = new Map<string, CatalogGame[]>();
  for (const game of publicListedCatalog) {
    if (excludedCatalogIds.has(game.id)) continue;
    const key = game.listingStatus === "listed"
      ? derivedRelationshipIdentity(game)
      : `${game.platformSlug}:pending:${game.id}`;
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }

  const guides = [...groups.values()].map(buildGuide);
  const byCatalogId = new Map<string, CatalogEditionGuideModel>();
  for (const guide of guides) {
    for (const catalogId of guide.physicalEditions.flatMap((edition) => edition.catalogIds)) {
      byCatalogId.set(catalogId, guide);
    }
  }
  return { byCatalogId, guides };
}

/**
 * Resuelve una ficha publicada solo en el overlay del worker. La ficha conserva
 * su catalogId y se une a una guía únicamente cuando la relación es inequívoca.
 */
export function buildRuntimeCatalogEditionGuide(
  game: CatalogGame,
  documentedGuides: CatalogEditionGuideModel[],
  runtimeGames: CatalogGame[] = [game],
): CatalogEditionGuideModel {
  const key = game.listingStatus === "listed"
    ? derivedRelationshipIdentity(game)
    : `${game.platformSlug}:pending:${game.id}`;
  const relatedRuntimeGames = runtimeGames.filter((candidate) => {
    if (candidate.listingStatus !== game.listingStatus) return false;
    const candidateKey = candidate.listingStatus === "listed"
      ? derivedRelationshipIdentity(candidate)
      : `${candidate.platformSlug}:pending:${candidate.id}`;
    return candidateKey === key;
  });
  if (!relatedRuntimeGames.some((candidate) => candidate.id === game.id)) relatedRuntimeGames.push(game);

  if (game.listingStatus === "listed") {
    const candidates = documentedGuideCandidates(documentedGuides, game);
    if (candidates.length === 1) {
      const catalogById = new Map(publicCatalogById);
      for (const candidate of relatedRuntimeGames) catalogById.set(candidate.id, candidate);
      return relatedRuntimeGames.reduce((guide, candidate) => {
        const candidateGuides = documentedGuideCandidates(documentedGuides, candidate);
        return candidateGuides.length === 1 && candidateGuides[0] === candidates[0]
          ? addCatalogGameToGuide(guide, candidate, catalogById)
          : guide;
      }, documentedGuides[candidates[0]]);
    }
  }

  const claimed = new Set(
    documentedGuides.flatMap((guide) => guide.physicalEditions.flatMap((edition) => edition.catalogIds)),
  );
  const siblings = game.listingStatus === "listed"
    ? publicListedCatalog.filter((candidate) => {
        if (claimed.has(candidate.id) || candidate.listingStatus !== "listed") return false;
        return derivedRelationshipIdentity(candidate) === key;
      })
    : [];
  return buildGuide([...new Map(
    [...siblings, ...relatedRuntimeGames].map((candidate) => [candidate.id, candidate]),
  ).values()]);
}
