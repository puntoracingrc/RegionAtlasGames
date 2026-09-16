import { getCatalogGame } from "../catalog";
import { getCatalogEditionGuides } from "../catalog-edition-guides";
import type { CatalogPhysicalEdition } from "../catalog-edition-guide-types";
import { getOwnedScanSetById } from "../catalog-owned-scans";
import { resolveGameCompanyCredits } from "../company-credits";
import { getStoredCompanyProfile } from "../company-profile";
import { getGameDetails } from "../indexes";
import type { CatalogGame, GameDetails, GameDetailsSources } from "../types";
import type { ResearchSubject } from "./types";
import type { ResearchCatalogContext, ResearchCompanyContext } from "./v2-types";

type Guide = ReturnType<typeof getCatalogEditionGuides>[number];

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}

function guideAndEdition(subject: ResearchSubject): { guide: Guide | null; edition: CatalogPhysicalEdition | null } {
  if (!subject.guideId || !subject.physicalEditionId) return { guide: null, edition: null };
  const guide = getCatalogEditionGuides().find((candidate) => candidate.id === subject.guideId) ?? null;
  const edition = guide?.physicalEditions.find((candidate) => candidate.id === subject.physicalEditionId) ?? null;
  return { guide, edition };
}

function sourceUrls(sources: GameDetailsSources | undefined): string[] {
  if (!sources) return [];
  return unique([
    sources.ownedScan?.url,
    sources.official?.url,
    sources.gameEs?.productUrl,
    sources.gameEs?.preowned?.productUrl,
    sources.wikidata?.wikidataId
      ? `https://www.wikidata.org/wiki/${encodeURIComponent(sources.wikidata.wikidataId)}`
      : null,
  ]);
}

function companyContexts(details: GameDetails | undefined): ResearchCompanyContext[] {
  if (!details) return [];
  return resolveGameCompanyCredits(details).map((credit) => {
    const profile = getStoredCompanyProfile(credit.company.slug);
    let sourceCandidateHost: string | null = null;
    if (profile?.websiteUrl) {
      try {
        sourceCandidateHost = new URL(profile.websiteUrl).hostname.toLowerCase();
      } catch {
        sourceCandidateHost = null;
      }
    }
    return {
      role: credit.role,
      name: credit.company.name,
      slug: credit.company.slug,
      websiteUrl: profile?.websiteUrl ?? null,
      sourceCandidateHost,
    };
  });
}

function ownedScans(catalogIds: string[]) {
  return catalogIds.flatMap((catalogId) => {
    const scan = getOwnedScanSetById(catalogId);
    if (!scan) return [];
    return [{
      catalogId,
      capturedAt: scan.capturedAt,
      sourceLabel: scan.sourceLabel,
      barcode: scan.packaging.ean,
      boxCode: scan.packaging.productNumber ?? scan.packaging.reference,
      packagingLanguages: scan.packaging.languages,
      images: scan.images.map((image) => ({ role: image.role, label: image.label, url: image.url, thumbnailUrl: image.thumbnailUrl })),
    }];
  });
}

function catalogGameForSubject(subject: ResearchSubject, edition: CatalogPhysicalEdition | null): CatalogGame | null {
  const catalogId = subject.catalogId ?? edition?.catalogIds[0] ?? null;
  return catalogId ? getCatalogGame(catalogId) ?? null : null;
}

export function buildResearchCatalogContext(subject: ResearchSubject): ResearchCatalogContext {
  const { guide, edition } = guideAndEdition(subject);
  const game = catalogGameForSubject(subject, edition);
  const catalogIds = unique([
    subject.catalogId,
    ...(edition?.catalogIds ?? []),
    guide?.game.canonicalCatalogId,
  ]);
  const details = game ? getGameDetails(game.id) : undefined;
  const companies = companyContexts(details);
  const creditsByRole = (role: string) => companies.find((company) => company.role === role)?.name ?? null;
  const scans = ownedScans(catalogIds);
  const gameEs = details?.sources?.gameEs;
  const priceCharting = details?.sources?.pricecharting;
  const guideSources = guide?.sources.flatMap((source) => source.url ? [source.url] : []) ?? [];
  const officialSourceCandidates = unique([
    details?.sources?.official?.url,
    ...companies.map((company) => company.websiteUrl),
  ]);
  return {
    subjectId: subject.id,
    subjectKind: subject.kind,
    catalogId: game?.id ?? subject.catalogId,
    canonicalGameId: guide?.game.canonicalGameId ?? null,
    workId: game?.workId ?? null,
    platformReleaseId: guide?.game.platformReleaseId ?? null,
    guideId: guide?.id ?? subject.guideId,
    physicalEditionId: edition?.id ?? subject.physicalEditionId,
    title: game?.title ?? guide?.game.title ?? subject.title,
    aliases: unique([...(guide?.game.aliases ?? []), game?.titlePc]),
    titlePc: game?.titlePc ?? null,
    slug: game?.slug ?? null,
    platformSlug: game?.platformSlug ?? guide?.game.platformSlug ?? subject.platformSlug,
    edition: edition?.label ?? game?.edition ?? subject.edition,
    physicalVariant: game?.physicalVariant ?? null,
    region: game?.region ?? subject.region ?? null,
    regionFamily: game?.regionFamily ?? null,
    marketRegion: game?.marketRegion ?? null,
    regionalStatus: game?.regionalStatus ?? null,
    languages: game?.languages ?? [],
    regionalPackaging: game?.regionalPackaging ?? [],
    canonicalSerials: game?.canonicalSerials ?? [],
    sourceSerials: game?.sourceSerials ?? [],
    resolutionSerials: game?.resolutionSerials ?? [],
    publisher: details?.publisher?.name ?? null,
    developer: details?.developer?.name ?? null,
    companyCredits: companies,
    physicalPublisherOrDistributor: creditsByRole("physicalPublisherOrDistributor"),
    regionalPublisher: creditsByRole("regionalPublisher"),
    releaseDate: edition?.releaseDate ?? details?.releaseDate ?? null,
    year: details?.year ?? null,
    ean: details?.ean ?? null,
    barcode: edition?.barcode ?? scans.find((scan) => scan.barcode)?.barcode ?? subject.barcode,
    productCodes: unique([...(edition?.productCodes ?? []), ...subject.productCodes]),
    softwareFamilyCodes: edition?.softwareFamilyCodes ?? [],
    serial: edition?.serial ?? subject.serials[0] ?? null,
    catalogNumber: edition?.catalogNumber ?? null,
    boxCode: edition?.boxCode ?? scans.find((scan) => scan.boxCode)?.boxCode ?? null,
    ratingSystems: edition?.ratingSystems ?? [],
    packagingLanguages: unique([...(edition?.packagingLanguages ?? []), ...subject.packagingLanguages]),
    softwareLanguages: unique([...(edition?.softwareLanguages ?? []), ...subject.softwareLanguages]),
    componentLanguageEvidence: edition?.componentLanguageEvidence ?? [],
    broadRegion: edition?.broadRegion ?? null,
    marketRegions: unique([...(edition?.marketRegions ?? []), ...subject.marketRegions]),
    evidenceMarkets: unique([...(edition?.evidenceMarkets ?? []), ...subject.evidenceMarkets]),
    distributionMarkets: edition?.distributionMarkets ?? [],
    physicalProductType: edition?.physicalProductType ?? subject.physicalProductType,
    nativePhysicalPlatform: edition?.nativePhysicalPlatform ?? null,
    compatiblePlatforms: edition?.compatiblePlatforms ?? [],
    containsDisc: edition?.containsDisc ?? subject.containsDisc,
    countsAsNativePhysicalRelease: edition?.countsAsNativePhysicalRelease ?? subject.countsAsNativePhysicalRelease,
    physicalContents: edition?.physicalContents ?? [],
    digitalContents: edition?.digitalContents ?? [],
    releaseStatus: edition?.releaseStatus ?? subject.releaseStatus,
    confidence: edition?.confidence ?? subject.confidence,
    sharedDiscId: edition?.sharedDiscId ?? null,
    scanSetIds: unique([...(edition?.scanSetIds ?? []), ...scans.map((scan) => scan.catalogId)]),
    ownedScans: scans,
    coverUrl: game?.coverUrl ?? null,
    editionImages: (edition?.images ?? []).map((image) => ({ key: image.key, url: image.url, label: image.caption, evidenceType: image.evidenceType })),
    existingEvidence: (edition?.evidence ?? []).map((evidence) => ({
      id: evidence.id,
      type: evidence.type,
      label: evidence.label,
      url: evidence.url ?? null,
      summary: evidence.summary ?? null,
      supports: evidence.supports,
    })),
    existingResearchTasks: (guide?.researchTasks ?? []).map((task) => ({
      id: task.id,
      label: task.label,
      status: task.status,
      marketRegions: task.marketRegions,
      notes: task.notes,
    })),
    gameRetailer: gameEs ? { sku: gameEs.sku, url: gameEs.productUrl, imageUrl: gameEs.imageUrl ?? null } : null,
    priceCharting: priceCharting ? { productId: priceCharting.productId ?? null, path: priceCharting.pcPath } : null,
    museumPath: details?.museumPath ?? details?.sources?.museum?.museumPath ?? game?.museumPath ?? null,
    legacySources: unique([...sourceUrls(details?.sources), ...guideSources]),
    fieldProvenance: details?.fieldProvenance ?? {},
    officialSourceCandidates,
  };
}

export function findResearchSubjects(input: {
  title: string;
  platformSlug: string;
  edition?: string | null;
  barcode?: string | null;
}): ResearchSubject[] {
  const normal = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const title = normal(input.title);
  const edition = input.edition ? normal(input.edition) : null;
  const subjects: ResearchSubject[] = [];
  for (const guide of getCatalogEditionGuides()) {
    if (guide.game.platformSlug !== input.platformSlug) continue;
    if (![guide.game.title, ...(guide.game.aliases ?? [])].some((candidate) => normal(candidate) === title)) continue;
    for (const physical of guide.physicalEditions) {
      if (edition && normal(physical.label) !== edition) continue;
      if (input.barcode && physical.barcode !== input.barcode) continue;
      subjects.push({
        id: `edition:${guide.id}:${physical.id}`,
        kind: "physical-edition",
        catalogId: physical.catalogIds[0] ?? guide.game.canonicalCatalogId,
        guideId: guide.id,
        physicalEditionId: physical.id,
        title: guide.game.title,
        platformSlug: guide.game.platformSlug,
        edition: physical.label,
        region: physical.broadRegion,
        barcode: physical.barcode ?? null,
        productCodes: unique([...physical.productCodes, ...physical.softwareFamilyCodes, physical.boxCode]),
        serials: physical.serial ? [physical.serial] : [],
        marketRegions: physical.marketRegions,
        evidenceMarkets: physical.evidenceMarkets,
        packagingLanguages: physical.packagingLanguages,
        softwareLanguages: physical.softwareLanguages,
        releaseStatus: physical.releaseStatus,
        physicalProductType: physical.physicalProductType ?? null,
        containsDisc: physical.containsDisc ?? null,
        countsAsNativePhysicalRelease: physical.countsAsNativePhysicalRelease ?? null,
        confidence: physical.confidence ?? null,
        evidenceCount: physical.evidence.length,
        sourceCount: guide.sources.length,
        notes: physical.notes,
      });
    }
  }
  return subjects;
}

export function getResearchSubjectById(subjectId: string): ResearchSubject | null {
  if (subjectId.startsWith("catalog:")) {
    const game = getCatalogGame(subjectId.slice("catalog:".length));
    if (!game) return null;
    return {
      id: subjectId,
      kind: "catalog-entry",
      catalogId: game.id,
      guideId: null,
      physicalEditionId: null,
      title: game.title,
      platformSlug: game.platformSlug,
      edition: game.edition || "Standard",
      region: game.region,
      barcode: null,
      productCodes: [],
      serials: unique([...(game.canonicalSerials ?? []), ...(game.sourceSerials ?? []), ...(game.resolutionSerials ?? [])]),
      marketRegions: game.marketRegion ? [game.marketRegion] : [],
      evidenceMarkets: [],
      packagingLanguages: game.languages ?? [],
      softwareLanguages: [],
      releaseStatus: null,
      physicalProductType: null,
      containsDisc: null,
      countsAsNativePhysicalRelease: null,
      confidence: game.matchConfidence,
      evidenceCount: game.regionEvidence?.length ?? 0,
      sourceCount: 0,
      notes: [],
    };
  }
  if (!subjectId.startsWith("edition:")) return null;
  for (const guide of getCatalogEditionGuides()) {
    for (const physical of guide.physicalEditions) {
      if (`edition:${guide.id}:${physical.id}` !== subjectId) continue;
      return findResearchSubjects({
        title: guide.game.title,
        platformSlug: guide.game.platformSlug,
        edition: physical.label,
        barcode: physical.barcode ?? null,
      }).find((subject) => subject.id === subjectId) ?? null;
    }
  }
  return null;
}
