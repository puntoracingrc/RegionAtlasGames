import { validateBarcode, validateIdentifierForPlatform } from "./validators";
import {
  RESEARCH_COVERAGE_BUCKETS,
  type ResearchCatalogContext,
  type ResearchCoverageBucket,
  type ResearchCoverageLedgerEntry,
  type ResearchIdentifierTrace,
  type ResearchQueryStage,
  type ResearchSearchResult,
  type ResearchTargetField,
} from "./v2-types";

export type IdentifierCandidate = {
  type: "BARCODE" | "SERIAL" | "PRODUCT_CODE";
  observedValue: string;
  normalizedValue: string;
  validation: ResearchIdentifierTrace["validation"];
  rejectionReason: string | null;
};

export type IdentifierSearchAssessment = {
  status: "CORROBORATED" | "PARTIAL" | "HARD_CONFLICT" | "UNRESOLVED";
  matchingSources: string[];
  conflictingSources: string[];
  subjectBinding: ResearchIdentifierTrace["subjectBinding"];
  platformBinding: ResearchIdentifierTrace["platformBinding"];
  editionBinding: ResearchIdentifierTrace["editionBinding"];
  reason: string;
};

function comparable(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleTokens(value: string): string[] {
  const ignored = new Set(["the", "and", "edition", "standard", "special", "game", "video", "playstation", "nintendo"]);
  return [...new Set(comparable(value).split(" ").filter((token) => token.length >= 2 && !ignored.has(token)))];
}

function platformAliases(platformSlug: string): string[] {
  return ({
    ps4: ["playstation 4", "ps4"],
    ps5: ["playstation 5", "ps5"],
    n64: ["nintendo 64", "n64"],
    gameboy: ["game boy", "gameboy", "dmg"],
  } as Record<string, string[]>)[platformSlug] ?? [platformSlug];
}

function otherPlatformMentioned(text: string, platformSlug: string): boolean {
  const groups: Record<string, string[]> = {
    ps4: ["playstation 4", "ps4"], ps5: ["playstation 5", "ps5"],
    n64: ["nintendo 64", "n64"], gameboy: ["game boy", "gameboy"],
    switch: ["nintendo switch", "switch"], xbox360: ["xbox 360", "xbox360"],
  };
  return Object.entries(groups).some(([slug, aliases]) => slug !== platformSlug && aliases.some((alias) => text.includes(alias)));
}

function codeCandidate(value: string, platformSlug: string): IdentifierCandidate | null {
  const normalized = value.toUpperCase().replace(/\s+/g, "-").replace(/--+/g, "-")
    .replace(/^(PPSA|CUSA|ELJM|ELAS)(?=\d)/, "$1-");
  const type = /^(?:PPSA|CUSA)-/i.test(normalized) ? "SERIAL" as const : "PRODUCT_CODE" as const;
  const errors = validateIdentifierForPlatform(platformSlug, normalized);
  return {
    type,
    observedValue: value,
    normalizedValue: normalized,
    validation: errors.length ? "PLATFORM_REJECTED" : "VALID",
    rejectionReason: errors[0] ?? null,
  };
}

export function normalizeIdentifierCandidate(value: string, type: IdentifierCandidate["type"], platformSlug: string): IdentifierCandidate {
  if (type === "BARCODE") {
    const checked = validateBarcode(value);
    return {
      type,
      observedValue: value,
      normalizedValue: checked.valid ? checked.digits : value.replace(/[\s-]+/g, ""),
      validation: checked.error === "BARCODE_CHECKSUM" ? "CHECKSUM_REJECTED" : checked.valid ? "VALID" : "FORMAT_REJECTED",
      rejectionReason: checked.error,
    };
  }
  return codeCandidate(value, platformSlug) ?? {
    type,
    observedValue: value,
    normalizedValue: value.trim().toUpperCase(),
    validation: "FORMAT_REJECTED",
    rejectionReason: "IDENTIFIER_FORMAT",
  };
}

export function discoverIdentifierCandidates(text: string, platformSlug: string): IdentifierCandidate[] {
  const rows: IdentifierCandidate[] = [];
  const numeric = text.match(/(?<!\d)(?:\d[\s-]?){11,12}\d(?!\d)/g) ?? [];
  for (const value of numeric) rows.push(normalizeIdentifierCandidate(value, "BARCODE", platformSlug));
  const patterns: Partial<Record<string, RegExp[]>> = {
    ps4: [/\bCUSA[-\s]?\d{4,6}\b/gi],
    ps5: [/\bPPSA[-\s]?\d{4,6}\b/gi, /\bELJM[-\s]?\d{4,6}[A-Z]?\b/gi, /\bELAS[-\s]?\d{4,6}[A-Z]?\b/gi],
    n64: [/\b(?:DIS-)?NUS-[A-Z0-9]{2,6}(?:-[A-Z0-9]{2,5}(?:-\d+)?)?\b/gi],
    gameboy: [/\bDMG-[A-Z0-9]{2,6}(?:-[A-Z0-9]{2,5}(?:-\d+)?)?\b/gi],
  };
  for (const pattern of patterns[platformSlug] ?? []) {
    for (const value of text.match(pattern) ?? []) {
      const candidate = codeCandidate(value, platformSlug);
      if (candidate) rows.push(candidate);
    }
  }
  return [...new Map(rows.map((row) => [`${row.type}:${row.normalizedValue}`, row])).values()];
}

function regionTerms(bucket: ResearchCoverageBucket | null | undefined, context: Pick<ResearchCatalogContext, "region" | "broadRegion" | "marketRegions">): string[] {
  const markets = new Set(context.marketRegions.map((market) => market.toUpperCase()));
  if (bucket === "ASIA_OTHER" && markets.has("KR")) return ["korea", "korean", "grac", "한국"];
  if (bucket === "ASIA_OTHER" && (markets.has("HK") || markets.has("TW"))) return ["hong kong", "taiwan", "traditional chinese", "chinese asia", "香港", "台灣", "台湾"];
  const inferred = bucket ?? (/JAPAN|\bJP\b/i.test(`${context.region} ${context.marketRegions.join(" ")}`) ? "JAPAN"
    : /KOREA|HONG KONG|TAIWAN|\bKR\b|\bHK\b|\bTW\b|ASIA/i.test(`${context.region} ${context.marketRegions.join(" ")}`) ? "ASIA_OTHER"
      : /USA|NORTH AMERICA|\bUS\b|CANADA/i.test(`${context.region} ${context.marketRegions.join(" ")}`) ? "NORTH_AMERICA"
        : /AUSTRALIA|NEW ZEALAND|OCEANIA/i.test(`${context.region} ${context.marketRegions.join(" ")}`) ? "OCEANIA"
          : /MEXICO|BRAZIL|LATIN|LATAM/i.test(`${context.region} ${context.marketRegions.join(" ")}`) ? "LATIN_AMERICA"
            : context.broadRegion === "EUROPE" ? "EUROPE" : null);
  return ({
    EUROPE: ["europe", "european", "pegi", "pal", "usk"],
    NORTH_AMERICA: ["usa", "united states", "north america", "esrb", "us version"],
    JAPAN: ["japan", "japanese", "cero", "jan", "日本"],
    ASIA_OTHER: ["asia", "asian", "hong kong", "taiwan", "korea", "korean", "grac", "chinese"],
    OCEANIA: ["australia", "australian", "new zealand", "oceania"],
    LATIN_AMERICA: ["mexico", "mexican", "brazil", "brazilian", "latin america", "latam"],
  } as Record<ResearchCoverageBucket, string[]>)[inferred as ResearchCoverageBucket] ?? [];
}

function phraseInText(raw: string, term: string): boolean {
  if (/[^\x00-\x7F]/.test(term)) return raw.toLowerCase().includes(term.toLowerCase());
  const text = ` ${comparable(raw)} `;
  const normalizedTerm = comparable(term);
  return Boolean(normalizedTerm) && text.includes(` ${normalizedTerm} `);
}

function regionalDomainMatch(url: string, bucket: ResearchCoverageBucket | null | undefined, markets: string[]): boolean {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  const normalizedMarkets = new Set(markets.map((market) => market.toUpperCase()));
  if (bucket === "JAPAN") return host.endsWith(".jp");
  if (bucket === "ASIA_OTHER" && normalizedMarkets.has("KR")) return host.endsWith(".kr");
  if (bucket === "ASIA_OTHER" && normalizedMarkets.has("HK")) return host.endsWith(".hk");
  if (bucket === "ASIA_OTHER" && normalizedMarkets.has("TW")) return host.endsWith(".tw");
  if (bucket === "OCEANIA") return host.endsWith(".au") || host.endsWith(".nz");
  if (bucket === "LATIN_AMERICA") return host.endsWith(".mx") || host.endsWith(".br");
  if (bucket === "EUROPE") return /\.(?:es|fr|de|it|uk|pt|nl|be|pl|se|no|dk|fi)$/.test(host);
  return false;
}

function editionTerms(edition: string): string[] {
  const text = comparable(edition);
  return ["special", "collector", "limited", "deluxe", "steelbook", "skull", "buccaneer", "black chest", "double pack"]
    .filter((term) => phraseInText(text, term));
}

function hitBinding(
  hit: ResearchSearchResult,
  context: Pick<ResearchCatalogContext, "title" | "aliases" | "platformSlug" | "edition" | "region" | "broadRegion" | "marketRegions">,
  identifier: string,
  coverageBucket?: ResearchCoverageBucket | null,
) {
  const raw = `${hit.title} ${hit.snippet} ${hit.url}`;
  const text = comparable(raw);
  const identifiersMatch = comparable(identifier) && text.includes(comparable(identifier));
  const expectedTitles = [context.title, ...context.aliases].map(titleTokens).filter((tokens) => tokens.length);
  const titleMatch = expectedTitles.some((tokens) => tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length));
  const expectedPlatform = platformAliases(context.platformSlug).some((alias) => text.includes(alias));
  const wrongPlatform = otherPlatformMentioned(text, context.platformSlug) && !expectedPlatform;
  const expectedRegionTerms = regionTerms(coverageBucket, context);
  const regionMatch = !expectedRegionTerms.length
    || expectedRegionTerms.some((term) => phraseInText(raw, term))
    || regionalDomainMatch(hit.url, coverageBucket, context.marketRegions);
  const expectedEditionTerms = editionTerms(context.edition);
  const editionMatch = !expectedEditionTerms.length || expectedEditionTerms.some((term) => text.includes(term));
  return { identifiersMatch, titleMatch, expectedPlatform, wrongPlatform, regionMatch, editionMatch, regionRequired: expectedRegionTerms.length > 0, editionRequired: expectedEditionTerms.length > 0 };
}

export function searchResultMatchesResearchScope(input: {
  hit: ResearchSearchResult;
  context: Pick<ResearchCatalogContext, "title" | "aliases" | "platformSlug" | "edition" | "region" | "broadRegion" | "marketRegions">;
  coverageBucket?: ResearchCoverageBucket | null;
}): boolean {
  const binding = hitBinding(input.hit, input.context, "", input.coverageBucket);
  return binding.titleMatch
    && binding.expectedPlatform
    && !binding.wrongPlatform
    && binding.regionMatch
    && binding.editionMatch;
}

export function assessIdentifierSearchResults(input: {
  identifier: string;
  context: Pick<ResearchCatalogContext, "title" | "aliases" | "platformSlug" | "edition" | "region" | "broadRegion" | "marketRegions">;
  hits: ResearchSearchResult[];
  coverageBucket?: ResearchCoverageBucket | null;
}): IdentifierSearchAssessment {
  const exactHits = input.hits.filter((hit) => hitBinding(hit, input.context, input.identifier, input.coverageBucket).identifiersMatch);
  const matching = exactHits.filter((hit) => {
    const binding = hitBinding(hit, input.context, input.identifier, input.coverageBucket);
    return binding.titleMatch && binding.expectedPlatform && !binding.wrongPlatform;
  });
  const conflicts = exactHits.filter((hit) => {
    const binding = hitBinding(hit, input.context, input.identifier, input.coverageBucket);
    return binding.wrongPlatform || (!binding.titleMatch && Boolean(hit.title.trim()));
  });
  const matchingSources = [...new Set(matching.map((hit) => hit.host))];
  const conflictingSources = [...new Set(conflicts.map((hit) => hit.host))];
  const regionBound = matching.some((hit) => hitBinding(hit, input.context, input.identifier, input.coverageBucket).regionMatch);
  const editionBound = matching.some((hit) => hitBinding(hit, input.context, input.identifier, input.coverageBucket).editionMatch);
  const needsRegion = exactHits.some((hit) => hitBinding(hit, input.context, input.identifier, input.coverageBucket).regionRequired);
  const needsEdition = exactHits.some((hit) => hitBinding(hit, input.context, input.identifier, input.coverageBucket).editionRequired);
  if (!matchingSources.length && conflictingSources.length >= 2) {
    return {
      status: "HARD_CONFLICT",
      matchingSources,
      conflictingSources,
      subjectBinding: "MISMATCH",
      platformBinding: conflicts.some((hit) => hitBinding(hit, input.context, input.identifier, input.coverageBucket).wrongPlatform) ? "MISMATCH" : "UNKNOWN",
      editionBinding: "UNKNOWN",
      reason: "HARD_IDENTIFIER_SUBJECT_CONFLICT",
    };
  }
  if (matchingSources.length >= 2 && (!needsRegion || regionBound) && (!needsEdition || editionBound)) {
    return { status: "CORROBORATED", matchingSources, conflictingSources, subjectBinding: "MATCH", platformBinding: "MATCH", editionBinding: needsEdition ? "MATCH" : "UNKNOWN", reason: "INDEPENDENT_EXACT_IDENTIFIER_CORROBORATION" };
  }
  if (matchingSources.length === 1) {
    return { status: "PARTIAL", matchingSources, conflictingSources, subjectBinding: "MATCH", platformBinding: "MATCH", editionBinding: editionBound ? "MATCH" : "UNKNOWN", reason: "SINGLE_EXACT_IDENTIFIER_SOURCE" };
  }
  if (matchingSources.length >= 2) {
    return { status: "PARTIAL", matchingSources, conflictingSources, subjectBinding: "MATCH", platformBinding: "MATCH", editionBinding: editionBound ? "MATCH" : "UNKNOWN", reason: needsEdition && !editionBound ? "EDITION_BINDING_MISSING" : "REGION_BINDING_MISSING" };
  }
  return { status: "UNRESOLVED", matchingSources, conflictingSources, subjectBinding: "UNKNOWN", platformBinding: "UNKNOWN", editionBinding: "UNKNOWN", reason: "NO_EXACT_IDENTIFIER_MATCH" };
}

export function exactIdentifierQueries(identifier: string, title: string): string[] {
  const safeIdentifier = identifier.replace(/"/g, "").trim();
  const safeTitle = title.replace(/"/g, "").trim();
  return [`"${safeIdentifier}"`, `"${safeIdentifier}" "${safeTitle}"`];
}

export function deduplicateScopedQueries<T extends { query: string; identifierValue?: string }>(input: {
  rows: T[];
  canonicalWork: string;
  platform: string;
  regionBucket: string;
  field: string;
}): { rows: T[]; prevented: number } {
  const seen = new Set<string>();
  const rows = input.rows.filter((row) => {
    const key = [
      comparable(row.query), comparable(input.canonicalWork), input.platform.toLowerCase(),
      input.regionBucket.toLowerCase(), input.field.toLowerCase(),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { rows, prevented: input.rows.length - rows.length };
}

export function shouldStopFieldSearch(input: { status: string; hasConflict: boolean; hasEditionAmbiguity: boolean; hasMultipleSkuCandidate: boolean }): boolean {
  return input.status === "CONFIRMED" && !input.hasConflict && !input.hasEditionAmbiguity && !input.hasMultipleSkuCandidate;
}

export function libretroRegionalLead(entryName: string | null, thumbnailUrl: string | null): { regionalCandidate: string | null; imageUrl: string | null; status: "DISCOVERY_LEAD" | "NO_LEAD" } {
  if (!entryName?.trim()) return { regionalCandidate: null, imageUrl: null, status: "NO_LEAD" };
  return { regionalCandidate: entryName.trim(), imageUrl: thumbnailUrl, status: "DISCOVERY_LEAD" };
}

export function libretroAbsenceConclusion(): "UNKNOWN" {
  return "UNKNOWN";
}

export function createIdentifierTrace(input: {
  candidate: IdentifierCandidate;
  discoveredFrom: ResearchIdentifierTrace["discoveredFrom"];
  discoveryQuery?: string | null;
  discoverySource?: string | null;
}): ResearchIdentifierTrace {
  return {
    candidate: input.candidate.observedValue,
    type: input.candidate.type,
    normalizedValue: input.candidate.normalizedValue,
    discoveredFrom: input.discoveredFrom,
    discoveryQuery: input.discoveryQuery ?? null,
    discoverySource: input.discoverySource ?? null,
    validation: input.candidate.validation,
    exactSearchQueries: [],
    matchingSources: [],
    conflictingSources: [],
    subjectBinding: "UNKNOWN",
    platformBinding: "UNKNOWN",
    editionBinding: "UNKNOWN",
    componentBinding: "UNBOUND",
    finalStatus: input.candidate.validation === "VALID" ? "DISCOVERED" : "REJECTED",
    rejectionReason: input.candidate.rejectionReason,
  };
}

export function createWorldwideCoverageLedger(): ResearchCoverageLedgerEntry[] {
  return RESEARCH_COVERAGE_BUCKETS.map((bucket) => ({
    bucket,
    status: "NOT_CHECKED",
    sourcesConsulted: [],
    queries: [],
    identifiersFound: [],
    physicalFamiliesFound: [],
    remainingGaps: [],
  }));
}

export function worldwideAcceptanceAllowed(ledger: ResearchCoverageLedgerEntry[]): boolean {
  const complete = new Map(ledger.map((entry) => [entry.bucket, entry]));
  return RESEARCH_COVERAGE_BUCKETS.every((bucket) => {
    const status = complete.get(bucket)?.status;
    return status === "CONFIRMED_VARIANT_FOUND" || status === "NO_DISTINCT_VARIANT_FOUND" || status === "NOT_APPLICABLE";
  });
}

export function nationalMarketRequirement(input: {
  broadRegion: string | null;
  marketRegions: string[];
  physicalExistenceConfirmed: boolean;
  identifierConfirmed: boolean;
}): "REQUIRED" | "NOT_REQUIRED" {
  return input.broadRegion === "EUROPE"
    && input.marketRegions.length === 0
    && input.physicalExistenceConfirmed
    && input.identifierConfirmed
    ? "NOT_REQUIRED"
    : "REQUIRED";
}

export function requiredExhaustionStages(input: {
  worldwide: boolean;
  candidatesFound: number;
  regionalTitleCandidates: number;
}): ResearchQueryStage[] {
  return [
    "STRUCTURED_RELEASE_SEED",
    "FIELD_SPECIFIC",
    ...(input.candidatesFound ? ["EXACT_IDENTIFIER_SEARCH" as const] : []),
    ...(input.worldwide ? ["REGIONAL_FALLBACK" as const] : []),
    ...(input.regionalTitleCandidates ? ["LOCAL_LANGUAGE_FALLBACK" as const] : []),
  ];
}

export function missingExhaustionStages(required: ResearchQueryStage[], attempted: ResearchQueryStage[]): ResearchQueryStage[] {
  const seen = new Set(attempted);
  return required.filter((stage) => !seen.has(stage));
}

export function identifierField(type: IdentifierCandidate["type"]): ResearchTargetField {
  return type === "BARCODE" ? "BARCODE" : type === "SERIAL" ? "SERIAL" : "PRODUCT_CODE";
}
