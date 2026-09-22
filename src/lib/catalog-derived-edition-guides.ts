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
  "GOLD",
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

function derivedGroupIdentity(game: CatalogGame): string {
  return game.listingStatus === "listed"
    ? derivedRelationshipIdentity(game)
    : `${game.platformSlug}:pending:${game.id}`;
}

let catalogGamesByDerivedGroupCache: Map<string, CatalogGame[]> | null = null;

function catalogGamesByDerivedGroup(): Map<string, CatalogGame[]> {
  if (catalogGamesByDerivedGroupCache) return catalogGamesByDerivedGroupCache;

  const groups = new Map<string, CatalogGame[]>();
  for (const game of publicListedCatalog) {
    const key = derivedGroupIdentity(game);
    const games = groups.get(key);
    if (games) games.push(game);
    else groups.set(key, [game]);
  }
  catalogGamesByDerivedGroupCache = groups;
  return groups;
}

function relationshipKeys(game: CatalogGame): string[] {
  const resolvedWork = workIdentity(game);
  return [resolvedWork ?? titleIdentity(game)];
}

export function catalogDerivedEditionType(game: CatalogGame): CatalogPhysicalEditionType {
  const bracketVariant = game.title.match(/\[([^\]]+)\]\s*$/)?.[1];
  const editionIdentity = [...new Set(
    [game.edition, game.physicalVariant, bracketVariant]
      .map(normalizedIdentity)
      .filter(Boolean),
  )].join(" ");
  const title = normalizedIdentity(game.title);
  const has = (pattern: RegExp) => pattern.test(editionIdentity);
  const titleHas = (pattern: RegExp) => pattern.test(title);

  if (has(/steelbook|steel book/) || titleHas(/steelbook|steel book/)) return "STEELBOOK";
  if (has(/collector|coleccionista/) || titleHas(/collector s edition|edicion coleccionista/)) return "COLLECTOR";
  if (has(/gold/) || titleHas(/gold edition/)) return "GOLD";
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
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[-_]+/g, " ")
    .replace(/\b\p{L}/gu, (character) => character.toLocaleUpperCase("es"));
}

function editionIdentityLabel(game: CatalogGame): string | undefined {
  const physicalVariant = game.physicalVariant?.trim();
  if (physicalVariant && !/^(standard|standard edition)$/i.test(physicalVariant)) {
    return physicalVariant;
  }
  const edition = game.edition?.trim();
  if (edition && !/^(standard|standard edition)$/i.test(edition)) return edition;
  const bracketVariant = game.title.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim();
  return bracketVariant || edition || physicalVariant || undefined;
}

function familyIdentity(game: CatalogGame): string {
  const type = catalogDerivedEditionType(game);
  if (type !== "BUDGET_REISSUE" && type !== "OTHER") return type;
  return `${type}:${normalizedIdentity(editionIdentityLabel(game) || type)}`;
}

function familyLabel(game: CatalogGame): string {
  const type = catalogDerivedEditionType(game);
  if (type === "BUDGET_REISSUE" || type === "OTHER") {
    const raw = editionIdentityLabel(game);
    if (raw) {
      const displayRaw = decodeHtmlEntities(raw)
        .trim()
        .replace(/[‐‑‒–—−]/g, "-")
        .replace(/\bT-shirt\b/gi, "T-Shirt");
      return /[A-ZÁÉÍÓÚÑ]/.test(displayRaw) ? displayRaw : humanize(displayRaw);
    }
  }
  return catalogPhysicalEditionTypeLabel(type);
}

function priceConditions(type: CatalogPhysicalEditionType): CatalogPhysicalPriceCondition[] {
  if (["SPECIAL", "COLLECTOR", "DELUXE", "GOLD", "LIMITED", "STEELBOOK"].includes(type)) {
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

export function catalogDerivedBroadRegion(game: CatalogGame): CatalogPhysicalEdition["broadRegion"] {
  const marketRegions = exactMarketRegions(game);
  return marketRegions.length === 1
    ? catalogBroadRegionFromMarketRegion(marketRegions[0])
    : catalogBroadRegionFromLegacyRegion(game.regionFamily ?? game.region);
}

function physicalEditionFromCatalogGames(games: CatalogGame[]): CatalogPhysicalEdition {
  const game = representative(games);
  const scan = getOwnedScanSetById(game.id);
  const originalContents = resolveOriginalGameContents(game);
  const marketRegions = [...new Set(games.flatMap(exactMarketRegions))];
  const releaseGroup = game.physicalReleaseGroup ?? null;
  const barcode = releaseGroup?.barcode || scan?.packaging.ean || undefined;
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
    id: releaseGroup ? `catalog-edition-group-${slugify(releaseGroup.id)}` : `catalog-edition-${game.id}`,
    label: releaseGroup?.label || familyLabel(game),
    broadRegion: catalogDerivedBroadRegion(game),
    editionType: catalogDerivedEditionType(game),
    releaseStatus: "RELEASED",
    collectionIdentity: "catalog-entry",
    marketRegions,
    evidenceMarkets: [],
    distributionMarkets: [],
    packagingLanguages: releaseGroup?.packagingLanguages ?? scan?.packaging.languages ?? [],
    softwareLanguages: releaseGroup?.softwareLanguages ?? [],
    componentLanguageEvidence: [],
    ratingSystems: releaseGroup?.ratingSystems ?? [],
    softwareFamilyCodes: [],
    productCodes: releaseGroup?.productCodes ?? [],
    compatiblePlatforms: [game.platformSlug],
    ...(barcode ? { barcode } : {}),
    ...(releaseGroup?.confidence ? { confidence: releaseGroup.confidence } : {}),
    ...(releaseGroup?.catalogNumber || catalogNumber ? { catalogNumber: releaseGroup?.catalogNumber || catalogNumber } : {}),
    ...(releaseGroup?.serial ? { serial: releaseGroup.serial } : {}),
    ...(releaseGroup?.boxCode ? { boxCode: releaseGroup.boxCode } : {}),
    ...(releaseGroup?.releaseDate ? { releaseDate: releaseGroup.releaseDate } : {}),
    ...(releaseGroup?.releaseDateContext ? { releaseDateContext: releaseGroup.releaseDateContext } : {}),
    physicalContentStatus: releaseGroup?.physicalContentStatus,
    physicalProductType: releaseGroup?.physicalProductType,
    dimensions: releaseGroup?.dimensions,
    physicalContents: releaseGroup?.physicalContents?.length ? releaseGroup.physicalContents : physicalContents,
    digitalContents: releaseGroup?.digitalContents ?? [],
    catalogIds: games.map((entry) => entry.id),
    catalogLinks: games.map((entry) => ({
      catalogId: entry.id,
      href: catalogGamePath(entry),
      current: false,
      region: entry.region,
    })),
    scanSetIds: games.filter((entry) => getOwnedScanSetById(entry.id)).map((entry) => entry.id),
    evidence: [],
    images: releaseGroup?.images ?? [],
    includesEditionIds: [],
    includesVariantIds: [],
    containsCatalogIds: [],
    variants: [],
    notes: releaseGroup?.notes ?? [],
  };
}

function physicalEditionGroups(games: CatalogGame[]): CatalogGame[][] {
  const grouped = new Map<string, CatalogGame[]>();
  for (const game of games) {
    const key = game.physicalReleaseGroup?.id || `catalog-entry:${game.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), game]);
  }
  return [...grouped.values()];
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
  const editions = sortedFamilies.flatMap((familyGames) => physicalEditionGroups(familyGames)
    .sort((left, right) => regionSortRank(representative(left).region) - regionSortRank(representative(right).region))
    .map(physicalEditionFromCatalogGames));
  const families: CatalogEditionFamily[] = sortedFamilies.map((familyGames) => {
    const first = familyGames[0];
    const label = familyLabel(first);
    return {
      id: uniqueFamilyId(familyIdentity(first), usedFamilyIds),
      label,
      representativeCatalogId: representative(familyGames).id,
      physicalEditionIds: physicalEditionGroups(familyGames).map((group) => physicalEditionFromCatalogGames(group).id),
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
    physicalBonusItems: [],
    relatedReleases: [],
    editionFamilies: families,
    sharedDiscs: [],
    sources: [],
    evidenceNote: "Solo las fichas publicadas cuentan como evidencia regional; los candidatos del worker no se incorporan.",
    researchTasks: [],
  };
}

function cloneGuide(guide: CatalogEditionGuideModel): CatalogEditionGuideModel {
  return {
    ...guide,
    physicalEditions: guide.physicalEditions.map((edition) => ({
      ...edition,
      evidenceMarkets: [...edition.evidenceMarkets],
      distributionMarkets: [...edition.distributionMarkets],
      packagingLanguages: [...edition.packagingLanguages],
      softwareLanguages: [...edition.softwareLanguages],
      softwareFamilyCodes: [...edition.softwareFamilyCodes],
      productCodes: [...edition.productCodes],
      catalogIds: [...edition.catalogIds],
      catalogLinks: edition.catalogLinks.map((link) => ({ ...link })),
    })),
    physicalBonusItems: guide.physicalBonusItems.map((item) => ({
      ...item,
      catalogIds: [...item.catalogIds],
      catalogLinks: item.catalogLinks.map((link) => ({ ...link })),
      evidence: item.evidence.map((entry) => ({ ...entry })),
      notes: [...item.notes],
    })),
    relatedReleases: guide.relatedReleases.map((release) => ({
      ...release,
      evidence: release.evidence.map((entry) => ({ ...entry })),
      notes: [...release.notes],
    })),
    editionFamilies: guide.editionFamilies.map((family) => ({
      ...family,
      physicalEditionIds: [...family.physicalEditionIds],
      priceConditions: [...family.priceConditions],
    })),
    researchTasks: guide.researchTasks.map((task) => ({
      ...task,
      marketRegions: [...task.marketRegions],
      notes: [...task.notes],
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
  const edition = physicalEditionFromCatalogGames([game]);
  const existingEdition = guide.physicalEditions.find((candidate) => candidate.id === edition.id);
  if (existingEdition) {
    existingEdition.catalogIds = [...new Set([...existingEdition.catalogIds, ...edition.catalogIds])];
    existingEdition.catalogLinks = [
      ...existingEdition.catalogLinks,
      ...edition.catalogLinks.filter((link) => !existingEdition.catalogLinks.some((current) => current.catalogId === link.catalogId)),
    ];
    existingEdition.marketRegions = [...new Set([...existingEdition.marketRegions, ...edition.marketRegions])];
  } else {
    guide.physicalEditions.push(edition);
  }
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
  if (!family.physicalEditionIds.includes(edition.id)) family.physicalEditionIds.push(edition.id);
  const familyGames = family.physicalEditionIds.flatMap((editionId) => {
    const familyEdition = guide.physicalEditions.find((candidate) => candidate.id === editionId);
    const catalogId = familyEdition?.catalogIds[0];
    const catalogGame = catalogId ? catalogById.get(catalogId) : undefined;
    return catalogGame ? [catalogGame] : [];
  });
  if (familyGames.length) family.representativeCatalogId = representative(familyGames).id;
  return guide;
}

function isSparseCatalogEdition(edition: CatalogPhysicalEdition): boolean {
  return edition.id.startsWith("catalog-edition-")
    && !edition.id.startsWith("catalog-edition-group-")
    && !edition.barcode
    && !edition.catalogNumber
    && !edition.serial
    && !edition.boxCode
    && edition.productCodes.length === 0
    && edition.images.length === 0;
}

function mergeSparseCatalogEditions(guide: CatalogEditionGuideModel): CatalogEditionGuideModel {
  const merged = cloneGuide(guide);
  const removed = new Set<string>();

  for (const target of merged.physicalEditions) {
    if (!target.id.startsWith("catalog-edition-group-") || target.marketRegions.length === 0) continue;

    const duplicates = merged.physicalEditions.filter((candidate) => (
      candidate.id !== target.id
      && !removed.has(candidate.id)
      && isSparseCatalogEdition(candidate)
      && candidate.editionType === target.editionType
      && candidate.marketRegions.length === 1
      && target.marketRegions.includes(candidate.marketRegions[0])
    ));

    for (const duplicate of duplicates) {
      target.catalogIds = [...new Set([...target.catalogIds, ...duplicate.catalogIds])];
      target.catalogLinks = [
        ...target.catalogLinks,
        ...duplicate.catalogLinks.filter((link) => (
          !target.catalogLinks.some((current) => current.catalogId === link.catalogId)
        )),
      ];
      target.scanSetIds = [...new Set([...target.scanSetIds, ...duplicate.scanSetIds])];
      target.packagingLanguages = [...new Set([...target.packagingLanguages, ...duplicate.packagingLanguages])];
      target.softwareLanguages = [...new Set([...target.softwareLanguages, ...duplicate.softwareLanguages])];
      target.ratingSystems = [...new Set([...target.ratingSystems, ...duplicate.ratingSystems])];
      removed.add(duplicate.id);
    }
  }

  if (!removed.size) return merged;
  merged.physicalEditions = merged.physicalEditions.filter((edition) => !removed.has(edition.id));
  merged.editionFamilies = merged.editionFamilies.map((family) => ({
    ...family,
    physicalEditionIds: family.physicalEditionIds.filter((editionId) => !removed.has(editionId)),
  }));
  return merged;
}

/**
 * Completa una ficha V2 con las publicaciones calientes de la misma obra y
 * familia. La coincidencia por titulo solo se usa dentro de la misma plataforma
 * y tipo de edicion; las fichas genericas sin identificador se absorben cuando
 * una caja regional confirmada representa inequívocamente el mismo mercado.
 */
export function extendCatalogEditionGuideWithRuntimeGames(
  sourceGuide: CatalogEditionGuideModel,
  currentGame: CatalogGame,
  runtimeGames: CatalogGame[],
): CatalogEditionGuideModel {
  const currentTitle = normalizedIdentity(currentGame.title);
  const currentFamily = familyIdentity(currentGame);
  const explicitCurrentWork = workIdentity(currentGame);
  // A legacy regional route can still resolve to its static row while another
  // runtime row for the same title already carries the reviewed workId. Adopt
  // that identity only when the runtime platform set has exactly one resolved
  // work for the title; ambiguous title matches remain deliberately isolated.
  const resolvedTitleWorks = new Set(runtimeGames.flatMap((candidate) => {
    if (
      candidate.platformSlug !== currentGame.platformSlug
      || normalizedIdentity(candidate.title) !== currentTitle
    ) return [];
    const candidateWork = workIdentity(candidate);
    return candidateWork ? [candidateWork] : [];
  }));
  const currentWork = explicitCurrentWork
    ?? (resolvedTitleWorks.size === 1 ? resolvedTitleWorks.values().next().value : null);
  const matches = runtimeGames.filter((candidate) => (
    candidate.listingStatus === "listed"
    && candidate.platformSlug === currentGame.platformSlug
    && normalizedIdentity(candidate.title) === currentTitle
    && (() => {
      const candidateWork = workIdentity(candidate);
      if (!currentWork) return familyIdentity(candidate) === currentFamily;
      if (candidateWork) return candidateWork === currentWork;
      return familyIdentity(candidate) === currentFamily;
    })()
  ));
  if (!matches.length) return sourceGuide;

  const catalogById = new Map(publicCatalogById);
  for (const candidate of matches) catalogById.set(candidate.id, candidate);
  const expanded = matches.reduce((guide, candidate) => {
    const alreadyIncluded = guide.physicalEditions.some((edition) => edition.catalogIds.includes(candidate.id));
    return alreadyIncluded ? guide : addCatalogGameToGuide(guide, candidate, catalogById);
  }, sourceGuide);

  return mergeSparseCatalogEditions(expanded);
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
  const claimed = new Set(guides.flatMap((guide) => [
    ...guide.physicalEditions.flatMap((edition) => edition.catalogIds),
    ...guide.physicalBonusItems.flatMap((item) => item.catalogIds),
  ]));
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
  const guides = [...catalogGamesByDerivedGroup().values()].flatMap((games) => {
    const availableGames = games.filter((game) => !excludedCatalogIds.has(game.id));
    return availableGames.length ? [buildGuide(availableGames)] : [];
  });
  const byCatalogId = new Map<string, CatalogEditionGuideModel>();
  for (const guide of guides) {
    for (const catalogId of guide.physicalEditions.flatMap((edition) => edition.catalogIds)) {
      byCatalogId.set(catalogId, guide);
    }
  }
  return { byCatalogId, guides };
}

export function buildCatalogDerivedGuideForGame(
  game: CatalogGame,
  excludedCatalogIds: ReadonlySet<string>,
): CatalogEditionGuideModel | undefined {
  const games = catalogGamesByDerivedGroup().get(derivedGroupIdentity(game))
    ?.filter((candidate) => !excludedCatalogIds.has(candidate.id)) ?? [];
  if (!games.some((candidate) => candidate.id === game.id)) return undefined;
  return buildGuide(games);
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
  const key = derivedGroupIdentity(game);
  const relatedRuntimeGames = runtimeGames.filter((candidate) => {
    if (candidate.listingStatus !== game.listingStatus) return false;
    const candidateKey = derivedGroupIdentity(candidate);
    return candidateKey === key;
  });
  if (!relatedRuntimeGames.some((candidate) => candidate.id === game.id)) relatedRuntimeGames.push(game);

  if (game.listingStatus === "listed") {
    const candidates = documentedGuideCandidates(documentedGuides, game);
    if (candidates.length === 1) {
      const catalogById = new Map(publicCatalogById);
      for (const candidate of relatedRuntimeGames) catalogById.set(candidate.id, candidate);
      const expandedGuide = relatedRuntimeGames.reduce((guide, candidate) => {
        const candidateGuides = documentedGuideCandidates(documentedGuides, candidate);
        return candidateGuides.length === 1 && candidateGuides[0] === candidates[0]
          ? addCatalogGameToGuide(guide, candidate, catalogById)
          : guide;
      }, documentedGuides[candidates[0]]);
      return mergeSparseCatalogEditions(expandedGuide);
    }
  }

  const claimed = new Set(
    documentedGuides.flatMap((guide) => [
      ...guide.physicalEditions.flatMap((edition) => edition.catalogIds),
      ...guide.physicalBonusItems.flatMap((item) => item.catalogIds),
    ]),
  );
  const siblings = game.listingStatus === "listed"
    ? (catalogGamesByDerivedGroup().get(key) ?? []).filter((candidate) => !claimed.has(candidate.id))
    : [];
  return mergeSparseCatalogEditions(buildGuide([...new Map(
    [...siblings, ...relatedRuntimeGames].map((candidate) => [candidate.id, candidate]),
  ).values()]));
}
