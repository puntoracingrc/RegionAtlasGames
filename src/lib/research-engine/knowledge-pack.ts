import { createHash } from "node:crypto";
import { catalogData } from "../catalog-data";
import type { PhysicalEvidenceBundleV1 } from "../review-curator";
import { buildResearchCatalogContext } from "./catalog-context";
import { loadResearchKnowledge } from "./knowledge-loader";
import { loadPlatformRoutingMatrix, resolvedPlatformRouting } from "./platform-routing-matrix";
import type { ResearchSubject } from "./types";
import type { ResearchCatalogContext, ResearchSourceDefinition, ResearchTargetField } from "./v2-types";

export const RESEARCH_KNOWLEDGE_PACK_VERSION = 1;
export const KNOWLEDGE_ROUTE_ORDER = [
  "LOCAL_KNOWLEDGE", "OWN_SCANS", "EXISTING_DIRECT_URLS", "EXACT_IDENTIFIERS",
  "SPECIALIZED_SOURCES", "OFFICIAL_SOURCES", "PHYSICAL_SPECIMENS", "GENERIC_SEARCH",
] as const;

export type ResearchKnowledgeFieldPlan = {
  field: ResearchTargetField;
  knownFacts: string[];
  knownConflicts: string[];
  directUrls: Array<{ url: string; sourceId: string; reason: string }>;
  preferredSourceIds: string[];
  sourceCapabilities: Array<{ sourceId: string; capability: "CAN_SUPPORT" | "CANNOT_SUPPORT" | "DISCOVERY_ONLY"; score: number; limitations: string[] }>;
  exactQueries: Array<{ query: string; strategy: "EXACT_IDENTIFIER" | "SOURCE_SPECIFIC" | "EXACT_PRODUCT" | "GENERIC_LAST_RESORT"; sourceId: string | null }>;
  forbiddenInferences: string[];
  routeOrder: typeof KNOWLEDGE_ROUTE_ORDER;
};

export type ResearchKnowledgePackV1 = {
  schemaVersion: 1;
  packId: string;
  generatedAt: string;
  subjectId: string;
  inputHash: string;
  evidenceHash: string;
  catalogContext: ResearchCatalogContext;
  knownVariants: Array<{ catalogId: string; region: string; edition: string; physicalVariant: string | null }>;
  knownIdentifiers: Array<{ type: string; value: string; component: string | null; source: string }>;
  ownedScans: ResearchCatalogContext["ownedScans"];
  knownDirectUrls: Array<{ url: string; sourceId: string; supports: string[] }>;
  existingEvidence: ResearchCatalogContext["existingEvidence"];
  fieldPlans: Partial<Record<ResearchTargetField, ResearchKnowledgeFieldPlan>>;
  forbiddenInferences: string[];
  sourcePriority: typeof KNOWLEDGE_ROUTE_ORDER;
  researchTasks: PhysicalEvidenceBundleV1["evidenceGaps"];
  loadedKnowledgeFiles: string[];
};

const EXPLICIT_FIELDS: ResearchTargetField[] = [
  "CANONICAL_IDENTITY", "BARCODE", "PRODUCT_CODE", "BOX_CODE", "MARKET_REGION",
  "PACKAGING_LANGUAGES", "PHYSICAL_PRODUCT_TYPE", "OUTER_INNER_RELATION",
  "BUNDLE_CONTENTS", "COLLECTOR_CONTENTS", "RELEASE_STATUS",
];

const COMMON_FORBIDDEN = [
  "sellerCountry=ES does not prove a Spanish physical variant",
  "Spanish text or software language does not prove Spanish distribution",
  "PEGI does not prove a national market",
  "an EAN prefix does not prove distribution country",
  "a correct identifier on the wrong component is not corroboration",
  "box, cartridge/disc, manual, voucher, outer package and inner case identifiers must not be cross-attributed",
];

const PLATFORM_SOURCE_ORDER: Record<string, Partial<Record<ResearchTargetField, string[]>>> = {
  ps4: {
    PRODUCT_CODE: ["regionatlas-own-scan", "serialstation", "redump", "ogdb", "launchbox-images", "todocoleccion", "ebay"],
    BARCODE: ["regionatlas-own-scan", "national-retailer", "ogdb", "todocoleccion", "ebay", "launchbox-images"],
    MARKET_REGION: ["regionatlas-own-scan", "publisher-official", "national-retailer", "todocoleccion", "ebay"],
    PACKAGING_LANGUAGES: ["regionatlas-own-scan", "launchbox-images", "todocoleccion", "ebay"],
    CANONICAL_IDENTITY: ["regionatlas-own-scan", "publisher-official", "platform-holder-official", "ogdb", "mobygames"],
    BUNDLE_CONTENTS: ["regionatlas-own-scan", "publisher-official", "national-retailer", "todocoleccion", "ebay"],
  },
  n64: {
    PRODUCT_CODE: ["regionatlas-own-scan", "no-intro", "datomatic", "ogdb", "launchbox-images", "todocoleccion", "ebay"],
    BOX_CODE: ["regionatlas-own-scan", "ogdb", "launchbox-images", "todocoleccion", "ebay"],
    BARCODE: ["regionatlas-own-scan", "ogdb", "launchbox-images", "todocoleccion", "ebay"],
    MARKET_REGION: ["regionatlas-own-scan", "ogdb", "todocoleccion", "ebay"],
    PACKAGING_LANGUAGES: ["regionatlas-own-scan", "launchbox-images", "todocoleccion", "ebay"],
    CANONICAL_IDENTITY: ["regionatlas-own-scan", "no-intro", "datomatic", "ogdb", "mobygames"],
  },
  ps5: {
    PRODUCT_CODE: ["regionatlas-own-scan", "serialstation", "redump", "ogdb", "launchbox-images", "todocoleccion", "ebay"],
    BARCODE: ["regionatlas-own-scan", "national-retailer", "ogdb", "todocoleccion", "ebay", "launchbox-images"],
    MARKET_REGION: ["regionatlas-own-scan", "publisher-official", "platform-holder-official", "national-retailer", "todocoleccion", "ebay"],
    PACKAGING_LANGUAGES: ["regionatlas-own-scan", "launchbox-images", "todocoleccion", "ebay"],
    PHYSICAL_PRODUCT_TYPE: ["regionatlas-own-scan", "doesitplay", "publisher-official", "platform-holder-official", "launchbox-images"],
    OUTER_INNER_RELATION: ["regionatlas-own-scan", "publisher-official", "launchbox-images", "todocoleccion", "ebay"],
    COLLECTOR_CONTENTS: ["regionatlas-own-scan", "publisher-official", "national-retailer", "launchbox-images", "todocoleccion", "ebay"],
    CANONICAL_IDENTITY: ["regionatlas-own-scan", "publisher-official", "platform-holder-official", "ogdb", "mobygames"],
  },
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function quote(value: string): string {
  return `"${value.replace(/"/g, "").trim()}"`;
}

function directUrls(context: ResearchCatalogContext, bundle: PhysicalEvidenceBundleV1) {
  const rows = [
    ...context.ownedScans.flatMap((scan) => scan.images.map((image) => ({ url: image.url, sourceId: "regionatlas-own-scan", supports: [image.role] }))),
    ...context.existingEvidence.flatMap((evidence) => evidence.url ? [{ url: evidence.url, sourceId: evidence.type || "existing-evidence", supports: evidence.supports }] : []),
    ...context.legacySources.map((url) => ({ url, sourceId: "legacy-direct", supports: [] as string[] })),
    ...context.officialSourceCandidates.map((url) => ({ url, sourceId: "publisher-official", supports: ["CANONICAL_IDENTITY", "PHYSICAL_EXISTENCE"] })),
    ...(context.gameRetailer?.url ? [{ url: context.gameRetailer.url, sourceId: "national-retailer", supports: ["BARCODE", "EVIDENCE_MARKET"] }] : []),
    ...(bundle.listing.url ? [{ url: bundle.listing.url, sourceId: bundle.source, supports: ["LISTING_EVIDENCE"] }] : []),
  ];
  return [...new Map(rows.filter((row) => /^https?:\/\//i.test(row.url)).map((row) => [row.url, row])).values()];
}

function identifiers(context: ResearchCatalogContext, bundle: PhysicalEvidenceBundleV1) {
  const rows = [
    ...unique([context.barcode, context.ean]).map((value) => ({ type: "BARCODE", value, component: "OUTER_PACKAGE_BACK", source: "catalog-context" })),
    ...unique([context.serial, ...context.canonicalSerials, ...context.sourceSerials, ...context.resolutionSerials]).map((value) => ({ type: "SERIAL", value, component: null, source: "catalog-context" })),
    ...unique(context.productCodes).map((value) => ({ type: "PRODUCT_CODE", value, component: null, source: "catalog-context" })),
    ...unique([context.boxCode]).map((value) => ({ type: "BOX_CODE", value, component: "OUTER_PACKAGE_FLAP", source: "catalog-context" })),
    ...bundle.identifiers.map((row) => ({ type: row.type, value: row.value, component: row.component, source: `worker:${row.observationId}` })),
  ];
  return [...new Map(rows.map((row) => [`${row.type}:${row.value}:${row.component || "unknown"}`, row])).values()];
}

function sourceCapability(source: ResearchSourceDefinition, field: ResearchTargetField) {
  const score = source.fieldCapabilities[field] ?? 0;
  const discovery = source.roles.some((role) => /DISCOVERY_ONLY|PHYSICAL_SPECIMEN_DISCOVERY|COVER_GALLERY/.test(role)) && score < 70;
  return {
    sourceId: source.id,
    capability: score <= 0 ? "CANNOT_SUPPORT" as const : discovery ? "DISCOVERY_ONLY" as const : "CAN_SUPPORT" as const,
    score,
    limitations: source.knownRisks,
  };
}

function exactQueries(input: {
  field: ResearchTargetField; context: ResearchCatalogContext; identifiers: ReturnType<typeof identifiers>;
  sources: ResearchSourceDefinition[]; preferredSourceIds: string[];
}): ResearchKnowledgeFieldPlan["exactQueries"] {
  const rows: ResearchKnowledgeFieldPlan["exactQueries"] = [];
  for (const identifier of input.identifiers) {
    rows.push({ query: quote(identifier.value), strategy: "EXACT_IDENTIFIER", sourceId: null });
    rows.push({ query: `${quote(identifier.value)} ${quote(input.context.title)}`, strategy: "EXACT_IDENTIFIER", sourceId: null });
  }
  const queryableSources = input.preferredSourceIds
    .map((sourceId) => input.sources.find((row) => row.id === sourceId))
    .filter((source): source is ResearchSourceDefinition => Boolean(source?.hosts[0]))
    .slice(0, 5);
  for (const source of queryableSources) {
    if (source.hosts[0]) rows.push({
      query: `site:${source.hosts[0]} ${quote(input.context.title)} ${quote(input.context.platformSlug)} ${quote(input.context.edition)}`,
      strategy: "SOURCE_SPECIFIC", sourceId: source.id,
    });
  }
  const component = input.field === "PRODUCT_CODE" ? "cartridge disc product code"
    : input.field === "BARCODE" ? "back cover barcode EAN"
      : input.field === "MARKET_REGION" ? "back cover distributor legal text"
        : input.field === "PACKAGING_LANGUAGES" ? "back cover spine"
          : input.field === "OUTER_INNER_RELATION" ? "unboxing outer package inner case"
            : input.field === "PHYSICAL_PRODUCT_TYPE" ? "back cover download required code in box"
              : input.field.toLowerCase().replace(/_/g, " ");
  rows.push({ query: `${quote(input.context.title)} ${quote(input.context.platformSlug)} ${quote(input.context.edition)} ${component}`, strategy: "EXACT_PRODUCT", sourceId: null });
  rows.push({ query: `${quote(input.context.title)} ${quote(input.context.platformSlug)} ${component}`, strategy: "GENERIC_LAST_RESORT", sourceId: null });
  return [...new Map(rows.map((row) => [row.query.toLowerCase(), row])).values()];
}

export async function buildResearchKnowledgePack(input: {
  bundle: PhysicalEvidenceBundleV1;
  subject: ResearchSubject;
  rootDir?: string;
  generatedAt?: string;
}): Promise<ResearchKnowledgePackV1> {
  const context = buildResearchCatalogContext(input.subject);
  const knowledge = await loadResearchKnowledge({ platformSlug: context.platformSlug, catalogIds: [context.catalogId].filter((value): value is string => Boolean(value)), rootDir: input.rootDir });
  const matrix = loadPlatformRoutingMatrix(input.rootDir);
  const platformRouting = resolvedPlatformRouting(matrix, context.platformSlug);
  const knownIdentifiers = identifiers(context, input.bundle);
  const knownDirectUrls = directUrls(context, input.bundle);
  const knownVariants = catalogData.filter((game) => game.platformSlug === context.platformSlug && game.title === context.title)
    .map((game) => ({ catalogId: game.id, region: game.region, edition: game.edition, physicalVariant: game.physicalVariant ?? null }));
  const fieldPlans: ResearchKnowledgePackV1["fieldPlans"] = {};
  for (const field of EXPLICIT_FIELDS) {
    const explicit = (platformRouting?.fields[field] ?? PLATFORM_SOURCE_ORDER[context.platformSlug]?.[field] ?? [])
      .filter((sourceId) => sourceId !== "regionatlas-own-scan" || context.ownedScans.length > 0);
    const capable = knowledge.sources.filter((source) => source.platforms.includes("*") || source.platforms.includes(context.platformSlug))
      .sort((a, b) => (b.fieldCapabilities[field] ?? 0) - (a.fieldCapabilities[field] ?? 0));
    const preferredSourceIds = unique([...explicit, ...capable.filter((source) => (source.fieldCapabilities[field] ?? 0) > 0).map((source) => source.id)]);
    fieldPlans[field] = {
      field,
      knownFacts: unique([
        `title=${context.title}`, `platform=${context.platformSlug}`, `edition=${context.edition}`,
        context.region ? `catalogRegion=${context.region}` : null,
        context.marketRegions.length ? `marketRegions=${context.marketRegions.join(",")}` : null,
        ...knownIdentifiers.map((row) => `${row.type}=${row.value} component=${row.component || "unbound"}`),
      ]),
      knownConflicts: [...input.bundle.conflicts],
      directUrls: knownDirectUrls.filter((row) => !row.supports.length || row.supports.includes(field) || row.supports.includes("LISTING_EVIDENCE")).map((row) => ({ ...row, reason: "Known exact URL supplied by RegionAtlas context." })),
      preferredSourceIds,
      sourceCapabilities: preferredSourceIds.map((sourceId) => {
        const source = knowledge.sources.find((candidate) => candidate.id === sourceId);
        return source ? sourceCapability(source, field) : { sourceId, capability: "DISCOVERY_ONLY" as const, score: 0, limitations: ["Source comes from platform playbook and requires exact component validation."] };
      }),
      exactQueries: exactQueries({ field, context, identifiers: knownIdentifiers, sources: knowledge.sources, preferredSourceIds }),
      forbiddenInferences: unique([...COMMON_FORBIDDEN, ...(platformRouting?.forbidden ?? [])]),
      routeOrder: KNOWLEDGE_ROUTE_ORDER,
    };
  }
  const base = {
    schemaVersion: 1 as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    subjectId: input.subject.id,
    inputHash: input.bundle.inputHash,
    evidenceHash: input.bundle.evidenceHash,
    catalogContext: context,
    knownVariants, knownIdentifiers, ownedScans: context.ownedScans, knownDirectUrls,
    existingEvidence: context.existingEvidence, fieldPlans, forbiddenInferences: unique([...COMMON_FORBIDDEN, ...(platformRouting?.forbidden ?? [])]),
    sourcePriority: KNOWLEDGE_ROUTE_ORDER, researchTasks: input.bundle.evidenceGaps,
    loadedKnowledgeFiles: [...knowledge.loadedFiles, "data/research-engine/knowledge/platform-routing-matrix.json", ...(platformRouting?.evidenceFiles ?? [])],
  };
  const packId = `knowledge-pack-${createHash("sha256").update(JSON.stringify(base)).digest("hex").slice(0, 24)}`;
  return { ...base, packId };
}

export function attachResearchKnowledgePack(bundle: PhysicalEvidenceBundleV1, pack: ResearchKnowledgePackV1): PhysicalEvidenceBundleV1 {
  if (pack.inputHash !== bundle.inputHash || pack.evidenceHash !== bundle.evidenceHash) throw new Error("STALE_RESEARCH_KNOWLEDGE_PACK");
  return { ...bundle, knowledgePack: pack };
}

export function assertResearchKnowledgePack(bundle: PhysicalEvidenceBundleV1): asserts bundle is PhysicalEvidenceBundleV1 & { knowledgePack: ResearchKnowledgePackV1 } {
  if (!bundle.knowledgePack || bundle.knowledgePack.schemaVersion !== 1) throw new Error("MISSING_RESEARCH_KNOWLEDGE_PACK");
  if (bundle.knowledgePack.inputHash !== bundle.inputHash || bundle.knowledgePack.evidenceHash !== bundle.evidenceHash) throw new Error("STALE_RESEARCH_KNOWLEDGE_PACK");
}

export function researchKnowledgePackSearchBudget(
  pack: ResearchKnowledgePackV1,
  field: ResearchTargetField,
  options: { reserveImageSearch?: boolean } = {},
): number {
  const plan = pack.fieldPlans[field];
  if (!plan) return 0;
  const exactOrSourceSpecific = new Set(plan.exactQueries
    .filter((row) => row.strategy !== "GENERIC_LAST_RESORT")
    .map((row) => row.query.toLowerCase().replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim()));
  // One final slot is available for the generic-last fallback, plus a separate
  // slot when image search is capable of closing this target. The floor is
  // derived from the pack instead of arbitrarily raising every worker budget.
  return exactOrSourceSpecific.size + 1 + (options.reserveImageSearch ? 1 : 0);
}
