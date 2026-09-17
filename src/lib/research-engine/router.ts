import { createHash } from "node:crypto";
import { deduplicateScopedQueries } from "./identifier-resolution";
import type {
  ResearchComponent,
  ResearchDecisionTest,
  ResearchPlaybook,
  ResearchRouterInput,
  ResearchRouterPlan,
  ResearchSourceDefinition,
  ResearchSourcePlanItem,
  ResearchTargetField,
} from "./v2-types";

const quote = (value: string) => value.includes(" ") ? `"${value}"` : value;

function platformSearchLabel(platformSlug: string): string {
  return ({
    ds: "Nintendo DS", "3ds": "Nintendo 3DS", wiiu: "Wii U", switch: "Nintendo Switch",
    ps3: "PlayStation 3", ps4: "PlayStation 4", ps5: "PlayStation 5", xbox360: "Xbox 360",
    n64: "Nintendo 64", gameboy: "Game Boy",
  } as Record<string, string>)[platformSlug] ?? platformSlug;
}

function identifiersByType(input: ResearchRouterInput, type: string): string[] {
  return [...new Set(knownIdentifiersForRouter(input).filter((identifier) => identifier.type === type).map((identifier) => identifier.value))];
}

function contextIdentifiers(input: ResearchRouterInput): Array<{ type: string; value: string }> {
  const context = input.catalogContext;
  return [
    ...[context.barcode, context.ean].filter((value): value is string => Boolean(value)).map((value) => ({ type: "BARCODE", value })),
    ...[context.serial, ...context.canonicalSerials, ...context.sourceSerials, ...context.resolutionSerials]
      .filter((value): value is string => Boolean(value)).map((value) => ({ type: "SERIAL", value })),
    ...context.productCodes.map((value) => ({ type: "PRODUCT_CODE", value })),
    ...context.softwareFamilyCodes.map((value) => ({ type: "PRODUCT_CODE", value })),
    ...[context.boxCode].filter((value): value is string => Boolean(value)).map((value) => ({ type: "BOX_CODE", value })),
  ];
}

export function knownIdentifiersForRouter(input: Pick<ResearchRouterInput, "catalogContext" | "knownIdentifiers">) {
  const combined = [...contextIdentifiers(input as ResearchRouterInput), ...input.knownIdentifiers];
  const queryable = combined.filter((identifier) => {
    const value = identifier.value.trim();
    return value.length >= 4 && !/^(?:unknown|unresolved|pending|none|null|n\/a|pendiente)$/i.test(value);
  });
  return [...new Map(queryable.map((identifier) => [`${identifier.type}:${identifier.value}`, identifier])).values()];
}

function triggerSet(input: ResearchRouterInput): Set<string> {
  const known = knownIdentifiersForRouter(input);
  const set = new Set<string>();
  if (input.catalogContext.ownedScans.length) set.add("OWN_SCAN_AVAILABLE");
  if (known.some((identifier) => identifier.type === "BARCODE")) set.add("BARCODE_KNOWN");
  else {
    set.add("BARCODE_UNKNOWN");
    set.add("NO_BARCODE");
  }
  if (known.some((identifier) => identifier.type === "SERIAL")) set.add("SERIAL_KNOWN");
  if (known.some((identifier) => identifier.type === "PRODUCT_CODE")) {
    set.add("PRODUCT_CODE_KNOWN");
    set.add("CARTRIDGE_CODE_KNOWN");
  } else set.add("NO_COMPONENT_CODE");
  if (known.some((identifier) => identifier.type === "BOX_CODE")) set.add("BOX_CODE_KNOWN");
  else set.add("BOX_CODE_UNKNOWN");
  if (!known.length) set.add("NO_IDENTIFIERS");
  if (input.currentConflicts.some((conflict) => conflict.severity === "CRITICAL" || conflict.reason.includes("PLATFORM"))) {
    set.add("PLATFORM_IDENTIFIER_CONFLICT");
  }
  if (["PHYSICAL_EXISTENCE", "PHYSICAL_PRODUCT_TYPE", "RELEASE_STATUS"].includes(input.targetField)) set.add("PHYSICAL_STATUS_CONFLICT");
  if (["OUTER_INNER_RELATION", "BUNDLE_CONTENTS", "COLLECTOR_CONTENTS"].includes(input.targetField)) set.add("OUTER_INNER_RELATION_UNKNOWN");
  if (/\b(?:skull|buccaneer|black chest|collector|special)\b/i.test(input.catalogContext.edition)) set.add("COLLECTOR_EDITION");
  if (/\b(?:double pack|compilation|bundle)\b/i.test(input.catalogContext.edition)) set.add("BUNDLE_PRODUCT");
  set.add(`TARGET=${input.targetField}`);
  for (const identifier of known) {
    const suffix = identifier.value.toUpperCase().match(/-([A-Z0-9]{2,5})(?:-\d+)?$/)?.[1];
    if (suffix) set.add(`SUFFIX=${suffix}`);
    if (/^DIS-NUS-/i.test(identifier.value)) set.add("DIS_NUS_CODE");
  }
  return set;
}

function scorePlaybook(playbook: ResearchPlaybook, target: ResearchTargetField, triggers: Set<string>, platformSlug: string): number {
  if (!playbook.targets.includes("*") && !playbook.targets.includes(target)) return -1;
  let score = playbook.targets.includes(target) ? 30 : 5;
  score += playbook.triggers.filter((trigger) => triggers.has(trigger)).length * 20;
  if (playbook.id.startsWith(`${platformSlug.toUpperCase()}_`)) score += 12;
  if (playbook.id === "OWN_SCAN_FIRST" && triggers.has("OWN_SCAN_AVAILABLE")) score += 100;
  if (playbook.id.includes("SERIAL_KNOWN") && triggers.has("SERIAL_KNOWN")) score += 18;
  if (playbook.id.includes("BARCODE_KNOWN") && triggers.has("BARCODE_KNOWN")) score += 18;
  if (playbook.id.includes("CART_KNOWN") && triggers.has("CARTRIDGE_CODE_KNOWN")) score += 18;
  if (playbook.triggers.length && !playbook.triggers.some((trigger) => triggers.has(trigger))) score -= 25;
  return score;
}

function selectPlaybook(input: ResearchRouterInput, triggers: Set<string>): ResearchPlaybook {
  const ranked = input.playbooks
    .map((playbook) => ({ playbook, score: scorePlaybook(playbook, input.targetField, triggers, input.catalogContext.platformSlug) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.playbook.id.localeCompare(b.playbook.id));
  if (ranked[0]) return ranked[0].playbook;
  throw new Error(`No research playbook for ${input.targetField}`);
}

function sourceSupportsPlatform(source: ResearchSourceDefinition, platformSlug: string): boolean {
  return source.platforms.includes("*") || source.platforms.includes(platformSlug);
}

function sourceRoleMatches(source: ResearchSourceDefinition, roles: string[]): boolean {
  if (!roles.length) return true;
  const normalized = new Set(source.roles.map((role) => role.toUpperCase()));
  return roles.some((role) => normalized.has(role.toUpperCase()) || [...normalized].some((candidate) => candidate.includes(role.toUpperCase())));
}

function rankSources(input: ResearchRouterInput, playbook: ResearchPlaybook): ResearchSourcePlanItem[] {
  const explicit = new Map(playbook.sourceIds.map((id, index) => [id, playbook.sourceIds.length - index]));
  const packed = input.knowledgePack?.fieldPlans[input.targetField]?.preferredSourceIds ?? [];
  const packedBoost = new Map(packed.map((id, index) => [id, packed.length - index]));
  const franchisePriority = input.franchiseKnowledge
    .find((rule) => rule.startsWith("Preferred franchise sources:"))
    ?.replace(/^Preferred franchise sources:\s*/, "")
    .replace(/\.$/, "")
    .split(",")
    .map((value) => value.trim()) ?? [];
  const franchiseBoost = new Map(franchisePriority.map((id, index) => [id, franchisePriority.length - index]));
  const rows = input.sourceKnowledge
    .filter((source) => sourceSupportsPlatform(source, input.catalogContext.platformSlug))
    .filter((source) => source.id !== "regionatlas-own-scan" || input.catalogContext.ownedScans.length > 0)
    .map((source) => {
      const capability = source.fieldCapabilities[input.targetField] ?? 0;
      const explicitBoost = (explicit.get(source.id) ?? 0) * 100;
      const roleBoost = sourceRoleMatches(source, playbook.sourceRoles) ? 25 : 0;
      const score = explicitBoost + (packedBoost.get(source.id) ?? 0) * 120 + (franchiseBoost.get(source.id) ?? 0) * 8 + capability * 2 + source.defaultReliability + roleBoost;
      return {
        score,
        item: {
          sourceId: source.id,
          hosts: source.hosts,
          roles: source.roles,
          accessModes: source.accessModes,
          capabilityScore: capability,
          reason: packedBoost.has(source.id)
            ? `Precomputed ResearchKnowledgePack order; target capability ${capability || "not declared"}.`
            : explicit.has(source.id)
            ? `Ordered by ${playbook.id}; target capability ${capability || "not declared"}.`
            : `Field capability ${capability || "unspecified"}; default reliability ${source.defaultReliability}.`,
        } satisfies ResearchSourcePlanItem,
      };
    });
  for (const url of input.catalogContext.officialSourceCandidates) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      rows.push({
        score: 310,
        item: {
          sourceId: `company-official:${host}`,
          hosts: [host],
          roles: ["OFFICIAL_SOURCE_CANDIDATE"],
          accessModes: ["DIRECT_FETCH", "DOMAIN_SEARCH", "BROWSER", "ARCHIVE"],
          capabilityScore: ["PHYSICAL_EXISTENCE", "PHYSICAL_PRODUCT_TYPE", "RELEASE_STATUS"].includes(input.targetField) ? 96 : 75,
          reason: "Current RegionAtlas company profile supplies this official domain.",
        },
      });
    } catch {
      // Invalid profile URLs are ignored, never converted into queries.
    }
  }
  const legacySources = new Map<string, { sourceId: string; trust: "reviewed_guidance" | "candidate_only"; host: string }>();
  for (const entry of input.legacyKnowledge) {
    for (const source of entry.sources) {
      try {
        const host = new URL(source.url).hostname.toLowerCase();
        const key = `${source.id}:${host}`;
        const current = legacySources.get(key);
        if (!current || entry.trust === "reviewed_guidance") legacySources.set(key, { sourceId: source.id, trust: entry.trust, host });
      } catch {
        // Legacy source URLs are documentary hints only; invalid URLs are ignored.
      }
    }
  }
  for (const source of legacySources.values()) {
    const reviewed = source.trust === "reviewed_guidance";
    const capability = ["BOX_CODE", "PRODUCT_CODE", "SERIAL", "PACKAGING_LANGUAGES", "CANONICAL_IDENTITY"].includes(input.targetField)
      ? reviewed ? 82 : 35
      : reviewed ? 62 : 25;
    rows.push({
      score: reviewed ? 230 : 70,
      item: {
        sourceId: `legacy:${source.sourceId}`,
        hosts: [source.host],
        roles: ["LEGACY_SCANNER_DOCUMENTARY"],
        accessModes: ["SEARCH_ENGINE", "DIRECT_FETCH", "BROWSER"],
        capabilityScore: capability,
        reason: reviewed
          ? "Reviewed legacy scanner guidance contributes a component-bound documentary source; it is not runtime truth."
          : "Legacy candidate source is discovery-only and remains untrusted until independently validated.",
      },
    });
  }
  return [...new Map(rows.sort((a, b) => b.score - a.score).map((row) => [row.item.sourceId, row.item])).values()].slice(0, 24);
}

function templateValues(input: ResearchRouterInput, source: ResearchSourcePlanItem | null): Record<string, string> {
  const context = input.catalogContext;
  const known = knownIdentifiersForRouter(input);
  const first = (type: string) => known.find((identifier) => identifier.type === type)?.value ?? "";
  const edition = cleanEdition(context.edition);
  const sourceHost = (() => {
    if (!source) return "";
    if (/^(?:ps|playstation)/.test(context.platformSlug)) return source.hosts.find((host) => host.includes("playstation")) ?? source.hosts[0] ?? "";
    if (/^(?:xbox)/.test(context.platformSlug)) return source.hosts.find((host) => host.includes("xbox")) ?? source.hosts[0] ?? "";
    if (["ds", "3ds", "wiiu", "switch", "switch2"].includes(context.platformSlug)) return source.hosts.find((host) => host.includes("nintendo")) ?? source.hosts[0] ?? "";
    return source.hosts[0] ?? "";
  })();
  return {
    TITLE: context.title,
    EDITION: edition,
    PLATFORM: platformSearchLabel(context.platformSlug),
    BARCODE: first("BARCODE"),
    SERIAL: first("SERIAL"),
    PRODUCT_CODE: first("PRODUCT_CODE"),
    BOX_CODE: first("BOX_CODE"),
    CART_CODE: first("PRODUCT_CODE"),
    SOURCE_HOST: sourceHost,
    HOST: sourceHost,
    REGION: input.coverageBucket ?? (context.marketRegions.join(" ") || context.marketRegion || context.region || ""),
  };
}

function renderTemplate(template: string, values: Record<string, string>): string | null {
  let missing = false;
  const rendered = template.replace(/\{([A-Z_]+)\}/g, (_match, key: string) => {
    const value = values[key] ?? "";
    if (!value) missing = true;
    return value;
  }).replace(/\s+/g, " ").trim();
  return missing || !rendered ? null : rendered;
}

function cleanEdition(value: string): string {
  return value
    .split(/[·|]/)
    .map((part) => part.trim())
    .filter((part) => part
      && !/^(?:standard|unknown|pending)$/i.test(part)
      && !/(?:edition|product identity|identity|edici[oó]n|identidad).*(?:pendiente|pending)/i.test(part)
      && !/(?:identificadores?|identifiers?|barcodes?|c[oó]digos?|codes?).*(?:pendientes?|pending)/i.test(part)
      && !/(?:pendientes?|pending).*(?:identificadores?|identifiers?|barcodes?|c[oó]digos?|codes?)/i.test(part))
    .join(" ");
}

function exactIdentifierQueries(input: ResearchRouterInput, sourcePlan: ResearchSourcePlanItem[]): ResearchRouterPlan["queryPlan"] {
  const context = input.catalogContext;
  const region = context.marketRegions.join(" ") || context.marketRegion || context.region || "";
  const platform = platformSearchLabel(context.platformSlug);
  const identifiers = knownIdentifiersForRouter(input);
  const specialized = sourcePlan.filter((source) => source.capabilityScore > 0
    && source.accessModes.some((mode) => mode === "SEARCH_ENGINE" || mode === "DOMAIN_SEARCH"))
    .slice(0, 4);
  const rows: ResearchRouterPlan["queryPlan"] = [];
  const exactQuote = (value: string) => `"${value.replace(/"/g, "").trim()}"`;
  const baseFor = (identifier: (typeof identifiers)[number]) => ({
    sourceId: null,
    purpose: input.targetField,
    strategy: "EXACT_IDENTIFIER" as const,
    identifierType: identifier.type,
    identifierValue: identifier.value,
    stage: "EXACT_IDENTIFIER_SEARCH" as const,
    coverageBucket: input.coverageBucket ?? null,
  });
  for (const identifier of identifiers) {
    const exact = exactQuote(identifier.value);
    rows.push({ ...baseFor(identifier), query: exact });
  }
  for (const identifier of identifiers) {
    rows.push({ ...baseFor(identifier), query: `${exactQuote(identifier.value)} ${quote(platform)}` });
  }
  for (const identifier of identifiers) {
    const source = specialized[0];
    if (source?.hosts[0]) rows.push({ ...baseFor(identifier), query: `site:${source.hosts[0]} ${exactQuote(identifier.value)}`, sourceId: source.sourceId });
  }
  for (const identifier of identifiers) {
    rows.push({ ...baseFor(identifier), query: `${exactQuote(identifier.value)} ${quote(context.title)}` });
  }
  if (region) {
    for (const identifier of identifiers) rows.push({ ...baseFor(identifier), query: `${exactQuote(identifier.value)} ${quote(region)}` });
  }
  for (const identifier of identifiers) {
    const source = specialized[1];
    if (source?.hosts[0]) rows.push({ ...baseFor(identifier), query: `site:${source.hosts[0]} ${exactQuote(identifier.value)}`, sourceId: source.sourceId });
  }
  return rows;
}

function queryRow(input: ResearchRouterInput, query: string, stage: ResearchRouterPlan["queryPlan"][number]["stage"], sourceId: string | null = null): ResearchRouterPlan["queryPlan"][number] {
  return {
    query,
    sourceId,
    purpose: input.targetField,
    strategy: stage === "GENERIC_LAST_RESORT" ? "GENERIC" : "SOURCE_SPECIFIC",
    stage,
    coverageBucket: input.coverageBucket ?? null,
  };
}

function structuredReleaseSeedQueries(input: ResearchRouterInput): ResearchRouterPlan["queryPlan"] {
  const title = quote(input.catalogContext.title);
  const platform = quote(platformSearchLabel(input.catalogContext.platformSlug));
  return [
    queryRow(input, `${title} ${platform} release data`, "STRUCTURED_RELEASE_SEED"),
    queryRow(input, `${title} ${platform} product code barcode`, "STRUCTURED_RELEASE_SEED"),
    queryRow(input, `${title} ${platform} serial UPC EAN`, "STRUCTURED_RELEASE_SEED"),
    queryRow(input, `${title} ${platform} physical release regions`, "STRUCTURED_RELEASE_SEED"),
  ];
}

function inferredCoverageBucket(input: ResearchRouterInput): ResearchRouterInput["coverageBucket"] {
  if (input.coverageBucket) return input.coverageBucket;
  const region = `${input.catalogContext.region ?? ""} ${input.catalogContext.broadRegion ?? ""} ${input.catalogContext.marketRegion ?? ""} ${input.catalogContext.marketRegions.join(" ")}`.toUpperCase();
  if (/JAPAN|\bJP\b|CERO/.test(region)) return "JAPAN";
  if (/KOREA|HONG KONG|TAIWAN|\bKR\b|\bHK\b|\bTW\b|ASIA/.test(region)) return "ASIA_OTHER";
  if (/USA|NORTH AMERICA|\bUS\b|CANADA|\bCA\b/.test(region)) return "NORTH_AMERICA";
  if (/AUSTRALIA|NEW ZEALAND|OCEANIA|\bAU\b|\bNZ\b/.test(region)) return "OCEANIA";
  if (/MEXICO|BRAZIL|LATIN|LATAM|\bMX\b|\bBR\b/.test(region)) return "LATIN_AMERICA";
  return "EUROPE";
}

function fieldSpecificQueries(input: ResearchRouterInput): ResearchRouterPlan["queryPlan"] {
  const title = quote(input.catalogContext.title);
  const platform = quote(platformSearchLabel(input.catalogContext.platformSlug));
  const bucket = inferredCoverageBucket(input);
  const byBucket = {
    NORTH_AMERICA: [`${title} ${platform} USA UPC`, `${title} ${platform} US barcode`, `${title} ${platform} ESRB UPC`],
    EUROPE: [`${title} ${platform} EAN`, `${title} ${platform} Europe barcode`, `${title} ${platform} PEGI EAN`, `${title} ${platform} USK EAN`],
    JAPAN: [`${title} ${platform} JAN`, `${title} ${platform} Japan JAN`, `${title} ${platform} 型番`],
    ASIA_OTHER: [`${title} ${platform} Korea barcode`, `${title} ${platform} GRAC`, `${title} ${platform} Hong Kong barcode`, `${title} ${platform} Taiwan barcode`, `${title} ${platform} Asia UPC EAN`, `${title} ${platform} Chinese edition barcode`],
    OCEANIA: [`${title} ${platform} Australia barcode`, `${title} ${platform} AU physical`],
    LATIN_AMERICA: [`${title} ${platform} Mexico UPC`, `${title} ${platform} Brazil barcode`],
  } satisfies Record<NonNullable<ResearchRouterInput["coverageBucket"]>, string[]>;
  return byBucket[bucket ?? "EUROPE"].map((query) => queryRow(input, query, "FIELD_SPECIFIC"));
}

function regionalFallbackQueries(input: ResearchRouterInput, sourcePlan: ResearchSourcePlanItem[]): ResearchRouterPlan["queryPlan"] {
  const title = quote(input.catalogContext.title);
  const platform = quote(platformSearchLabel(input.catalogContext.platformSlug));
  const rows: ResearchRouterPlan["queryPlan"] = [];
  for (const sourceId of ["gamefaqs-guarded", "libretro-thumbnails"]) {
    const source = sourcePlan.find((candidate) => candidate.sourceId === sourceId);
    if (source?.hosts[0]) rows.push(queryRow(input, `site:${source.hosts[0]} ${title} ${platform}`, "REGIONAL_FALLBACK", sourceId));
  }
  for (const regionalTitle of input.regionalTitleCandidates ?? []) {
    rows.push(queryRow(input, `${quote(regionalTitle)} ${platform} JAN UPC barcode`, "LOCAL_LANGUAGE_FALLBACK"));
  }
  return rows;
}

function buildQueries(input: ResearchRouterInput, playbook: ResearchPlaybook, sourcePlan: ResearchSourcePlanItem[]): {
  queryPlan: ResearchRouterPlan["queryPlan"];
  duplicateQueriesPrevented: number;
} {
  const groups = playbook.queryTemplateGroups.length
    ? playbook.queryTemplateGroups
    : identifiersByType(input, "BARCODE").length ? ["BARCODE"]
      : identifiersByType(input, "SERIAL").length ? ["SERIAL"]
        : [input.targetField, "NO_IDENTIFIERS"];
  const platformRaw = input.platformKnowledge?.playbooks[playbook.id];
  const inlineTemplates = Array.isArray(platformRaw?.queryTemplates)
    ? platformRaw.queryTemplates.filter((item): item is string => typeof item === "string")
    : [];
  const genericTemplates = groups.flatMap((group) => input.queryTemplates[group] ?? []);
  const queries: ResearchRouterPlan["queryPlan"] = [];
  const packedQueries = input.knowledgePack?.fieldPlans[input.targetField]?.exactQueries ?? [];
  for (const row of packedQueries.filter((row) => row.strategy !== "GENERIC_LAST_RESORT")) {
    queries.push({
      query: row.query,
      sourceId: row.sourceId,
      purpose: input.targetField,
      strategy: row.strategy === "EXACT_IDENTIFIER" ? "EXACT_IDENTIFIER" : "SOURCE_SPECIFIC",
    });
  }
  const physicalMode = input.researchMode === "PHYSICAL_EVIDENCE_MODE";
  const queryableSources = sourcePlan.filter((source) => source.accessModes.some((mode) => mode === "SEARCH_ENGINE" || mode === "DOMAIN_SEARCH"));
  const globalValues = templateValues(input, null);
  // A newly discovered identifier changes the research question from discovery
  // to verification. Every candidate is chased before title-led discovery.
  const knownIdentifierCount = knownIdentifiersForRouter(input).length;
  queries.push(...exactIdentifierQueries(input, sourcePlan).slice(0, Math.min(8, Math.max(2, knownIdentifierCount * 2))));
  const identifierVerification = queries.length > 0;
  const earlyEdition = cleanEdition(input.catalogContext.edition);
  const collectorEdition = /\b(?:skull|buccaneer|black chest|collector|special|double pack)\b/i.test(earlyEdition);
  if (!identifierVerification && collectorEdition) {
    const editionName = earlyEdition.replace(/\b(?:spain|españa|espana|europe|europa)\b/gi, "").replace(/\s+/g, " ").trim();
    const platform = platformSearchLabel(input.catalogContext.platformSlug);
    queries.push(
      queryRow(input, `${quote(input.catalogContext.title)} ${quote(editionName)} ${quote(platform)}`, "FIELD_SPECIFIC"),
      queryRow(input, `${quote(editionName)} ${quote(platform)} barcode`, "FIELD_SPECIFIC"),
      queryRow(input, `${quote(input.catalogContext.title)} ${quote(editionName)} "back cover"`, "FIELD_SPECIFIC"),
    );
  }
  queries.push(...fieldSpecificQueries(input));
  queries.push(...structuredReleaseSeedQueries(input));
  queries.push(...regionalFallbackQueries(input, sourcePlan));
  if (physicalMode) {
    const gapTerms: Record<string, string> = {
      MISSING_BACK_COVER: '"back cover"', MISSING_BARCODE_PHOTO: '"back cover" barcode', MISSING_CART_PHOTO: "cartridge cart label",
      MISSING_OUTER_BOX_PHOTO: '"outer box" package', MISSING_INNER_BOX_PHOTO: '"inner case"', MISSING_MANUAL_PHOTO: "manual scan",
      MISSING_DOWNLOAD_STATEMENT: '"back cover" "download required"', MISSING_MARKET_PROOF: 'packaging distributor "legal text"',
      MISSING_EDITION_PROOF: 'edition box packaging', MISSING_COMPONENT_BINDING: 'unboxing outer inner', MISSING_SECOND_SOURCE: "identifier",
    };
    const terms = [...new Set((input.evidenceGaps ?? []).map((gap) => gapTerms[gap.type]).filter(Boolean))].join(" ") || "physical packaging";
    const exactSubject = `${quote(input.catalogContext.title)} ${quote(platformSearchLabel(input.catalogContext.platformSlug))} ${quote(cleanEdition(input.catalogContext.edition))} ${terms}`.replace(/\s+/g, " ").trim();
    for (const source of sourcePlan.filter((row) => row.accessModes.some((mode) => mode === "SEARCH_ENGINE" || mode === "DOMAIN_SEARCH")).slice(0, 6)) {
      if (source.hosts[0]) queries.push({ query: `site:${source.hosts[0]} ${exactSubject}`, sourceId: source.sourceId, purpose: input.targetField, strategy: "SOURCE_SPECIFIC" });
    }
    queries.push({ query: exactSubject, sourceId: null, purpose: input.targetField, strategy: "GENERIC" });
    queries.push({ query: `${exactSubject} photo`, sourceId: null, purpose: input.targetField, strategy: "GENERIC" });
  }
  const edition = earlyEdition;
  if (collectorEdition) {
    const editionName = edition.replace(/\b(?:spain|españa|espana|europe|europa)\b/gi, "").replace(/\s+/g, " ").trim();
    const platform = platformSearchLabel(input.catalogContext.platformSlug);
    queries.push(
      { query: `${quote(input.catalogContext.title)} ${quote(editionName)} ${quote(platform)}`, sourceId: null, purpose: input.targetField, strategy: "GENERIC" },
      { query: `${quote(editionName)} ${quote(platform)} barcode`, sourceId: null, purpose: input.targetField, strategy: "GENERIC" },
      { query: `${quote(input.catalogContext.title)} ${quote(editionName)} "back cover"`, sourceId: null, purpose: input.targetField, strategy: "GENERIC" },
    );
  }
  // Platform-specific playbook queries encode the strongest identifier rules
  // and must remain ahead of general source discovery (for example N64 codes).
  for (const template of inlineTemplates) {
    const rendered = renderTemplate(template, globalValues);
    if (rendered) queries.push({ query: rendered, sourceId: null, purpose: input.targetField, strategy: "GENERIC" });
  }
  // Ask the highest-ranked technical/physical sources first. Broad discovery is
  // still available afterwards, but cannot consume the whole case budget before
  // source-bound queries have had a chance to produce auditable evidence.
  const sourceQueries = queryableSources.slice(0, 8).map((source) => {
    const values = templateValues(input, source);
    return {
      source,
      rendered: (input.sourceKnowledge.find((item) => item.id === source.sourceId)?.queryTemplates ?? [])
        .map((template) => renderTemplate(template, values))
        .filter((query): query is string => Boolean(query)),
    };
  });
  const sourceDepth = Math.max(0, ...sourceQueries.map((row) => row.rendered.length));
  for (let depth = 0; depth < sourceDepth; depth += 1) {
    for (const { source, rendered } of sourceQueries) {
      const query = rendered[depth];
      if (query) queries.push({ query, sourceId: source.sourceId, purpose: input.targetField, strategy: "SOURCE_SPECIFIC" });
    }
  }
  if (!identifierVerification) {
    for (const template of genericTemplates) {
      const rendered = renderTemplate(template, globalValues);
      if (rendered) queries.push({ query: rendered, sourceId: null, purpose: input.targetField, strategy: "GENERIC" });
    }
  }
  for (const row of packedQueries.filter((row) => row.strategy === "GENERIC_LAST_RESORT")) {
    queries.push({ query: row.query, sourceId: row.sourceId, purpose: input.targetField, strategy: "GENERIC" });
  }
  const beforeDeduplication = queries.length;
  const scoped = deduplicateScopedQueries({
    rows: queries,
    canonicalWork: input.catalogContext.workId ?? input.catalogContext.canonicalGameId ?? input.catalogContext.title,
    platform: input.catalogContext.platformSlug,
    regionBucket: input.coverageBucket ?? inferredCoverageBucket(input) ?? "UNSCOPED",
    field: input.targetField,
  });
  let physicalGenericCount = 0;
  const deduplicated = scoped.rows.filter((query) => {
    if (physicalMode && query.strategy === "GENERIC" && physicalGenericCount >= 2) return false;
    if (physicalMode && query.strategy === "GENERIC") physicalGenericCount += 1;
    return true;
  });
  // Generic discovery is a true last resort. Keep the detailed ordering within
  // each class, but never allow an early generic template to jump ahead of a
  // precomputed identifier or source-specific route added later in the plan.
  const queryPlan = [
    ...deduplicated.filter((query) => query.strategy !== "GENERIC"),
    ...deduplicated.filter((query) => query.strategy === "GENERIC"),
  ].slice(0, 32);
  return { queryPlan, duplicateQueriesPrevented: Math.max(0, beforeDeduplication - deduplicated.length) };
}

function imagePlanFor(target: ResearchTargetField): ResearchRouterPlan["imagePlan"] {
  const rows: Partial<Record<ResearchTargetField, Array<{ component: ResearchComponent; fields: ResearchTargetField[]; reason: string }>>> = {
    BARCODE: [{ component: "OUTER_PACKAGE_BACK", fields: ["BARCODE"], reason: "Barcode must be read from the exact rear package or sticker." }],
    BOX_CODE: [{ component: "OUTER_PACKAGE_FLAP", fields: ["BOX_CODE", "PRINT_REVISION"], reason: "Box codes and print revisions are component-scoped." }],
    PACKAGING_LANGUAGES: [{ component: "OUTER_PACKAGE_BACK", fields: ["PACKAGING_LANGUAGES"], reason: "Printed package text must be visually observed." }],
    RATING: [{ component: "OUTER_PACKAGE_FRONT", fields: ["RATING"], reason: "Rating marks are usually visible on physical packaging." }],
    OUTER_INNER_RELATION: [
      { component: "OUTER_PACKAGE_BACK", fields: ["OUTER_INNER_RELATION", "BARCODE"], reason: "Bind the outer identifier separately." },
      { component: "INNER_CASE_BACK", fields: ["OUTER_INNER_RELATION", "PRODUCT_CODE"], reason: "Bind the inner game separately." },
    ],
    BUNDLE_CONTENTS: [{ component: "OUTER_PACKAGE_FRONT", fields: ["BUNDLE_CONTENTS", "PHYSICAL_PRODUCT_TYPE"], reason: "The exact bundle contents must be visible or documented." }],
    COLLECTOR_CONTENTS: [{ component: "OUTER_PACKAGE_FRONT", fields: ["COLLECTOR_CONTENTS", "PHYSICAL_PRODUCT_TYPE"], reason: "Collector packaging does not prove game media is included." }],
    PHYSICAL_PRODUCT_TYPE: [{ component: "OUTER_PACKAGE_BACK", fields: ["PHYSICAL_PRODUCT_TYPE"], reason: "Back-cover download/code statements or an exact unboxing must distinguish on-media content from required downloads." }],
    PRODUCT_CODE: [
      { component: "CARTRIDGE_FRONT", fields: ["PRODUCT_CODE"], reason: "Read the code from the exact physical medium." },
      { component: "CART_FRONT", fields: ["PRODUCT_CODE"], reason: "Legacy compatibility alias; canonicalized to CARTRIDGE_FRONT before binding." },
    ],
    ROM_REVISION: [
      { component: "CARTRIDGE_FRONT", fields: ["ROM_REVISION"], reason: "Label evidence is only a clue; technical evidence remains required." },
      { component: "CART_FRONT", fields: ["ROM_REVISION"], reason: "Legacy compatibility alias; canonicalized to CARTRIDGE_FRONT before binding." },
    ],
  };
  return rows[target] ?? [];
}

function directUrlPlan(input: ResearchRouterInput, sourcePlan: ResearchSourcePlanItem[]): ResearchRouterPlan["directUrlPlan"] {
  const candidates: ResearchRouterPlan["directUrlPlan"] = (input.knowledgePack?.fieldPlans[input.targetField]?.directUrls ?? [])
    .map((row) => ({ url: row.url, sourceId: row.sourceId, reason: row.reason }));
  if (input.catalogContext.gameRetailer?.url) {
    candidates.push({ url: input.catalogContext.gameRetailer.url, sourceId: "national-retailer", reason: "Exact retailer URL already bound to the catalog subject." });
  }
  for (const url of input.catalogContext.officialSourceCandidates) {
    try {
      const host = new URL(url).hostname;
      const source = sourcePlan.find((row) => row.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)));
      candidates.push({ url, sourceId: source?.sourceId ?? `company-official:${host}`, reason: "Known official URL from current catalog context." });
    } catch {
      // Invalid context URLs never become retrieval work.
    }
  }
  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].slice(0, 8);
}

function factsUsed(input: ResearchRouterInput, playbook: ResearchPlaybook): string[] {
  const context = input.catalogContext;
  return [
    `target=${input.targetField}`,
    `platform=${context.platformSlug}`,
    `title=${context.title}`,
    `edition=${context.edition}`,
    ...(context.ownedScans.length ? [`ownedScans=${context.ownedScans.length}`] : []),
    ...(knownIdentifiersForRouter(input).map((identifier) => `${identifier.type}=${quote(identifier.value)}`)),
    ...(input.legacyKnowledge.length ? [
      `legacyScannerReviewed=${input.legacyKnowledge.filter((entry) => entry.trust === "reviewed_guidance").length}`,
      `legacyScannerCandidates=${input.legacyKnowledge.filter((entry) => entry.trust === "candidate_only").length}`,
    ] : []),
    ...(input.knowledgePack ? [
      `knowledgePack=${input.knowledgePack.packId}`,
      `knownVariants=${input.knowledgePack.knownVariants.length}`,
      `knownDirectUrls=${input.knowledgePack.knownDirectUrls.length}`,
    ] : []),
    `playbook=${playbook.id}`,
  ];
}

export function routeResearch(input: ResearchRouterInput): ResearchRouterPlan {
  const triggers = triggerSet(input);
  const selectedPlaybook = selectPlaybook(input, triggers);
  const sourcePlan = rankSources(input, selectedPlaybook);
  const directUrls = directUrlPlan(input, sourcePlan);
  const { queryPlan, duplicateQueriesPrevented } = buildQueries(input, selectedPlaybook, sourcePlan);
  const deterministicChecks = [...new Set([
    ...selectedPlaybook.deterministicChecks,
    "SUBJECT_BINDING",
    ...(input.targetField === "BARCODE" ? ["BARCODE_CHECKSUM"] : []),
    ...(["SERIAL", "PRODUCT_CODE", "MEDIA_ID"].includes(input.targetField) ? ["PLATFORM_MATCH"] : []),
  ])];
  const escalationRules = [
    "REPLAN_AFTER_NEW_IDENTIFIER",
    "BROWSER_ONLY_AFTER_DIRECT_FETCH_FAILURE",
    "IMAGE_SEARCH_IS_DISCOVERY_NOT_FINAL_EVIDENCE",
    "PRESERVE_CONFLICT_OR_RETURN_UNRESOLVED",
    "TIER_3_ONLY_FOR_EXCEPTIONAL_UNRESOLVED_CONFLICT",
  ];
  const fingerprintInput = JSON.stringify({
    targetField: input.targetField,
    playbook: selectedPlaybook.id,
    identifiers: knownIdentifiersForRouter(input),
    sources: sourcePlan.map((source) => source.sourceId),
    directUrls: directUrls.map((row) => row.url),
    queries: queryPlan.map((query) => query.query),
  });
  return {
    targetField: input.targetField,
    factsUsed: factsUsed(input, selectedPlaybook),
    selectedPlaybook,
    sourcePlan,
    directUrlPlan: directUrls,
    queryPlan,
    imagePlan: imagePlanFor(input.targetField),
    deterministicChecks,
    escalationRules,
    researchMode: input.researchMode ?? "STANDARD",
    evidenceGapTypes: [...new Set((input.evidenceGaps ?? []).map((gap) => gap.type))],
    duplicateQueriesPrevented,
    routeFingerprint: createHash("sha256").update(fingerprintInput).digest("hex"),
  };
}

export function shouldDynamicallyReplan(
  previousIdentifiers: Array<{ type: string; value: string }>,
  nextIdentifiers: Array<{ type: string; value: string }>,
): boolean {
  const previous = new Set(previousIdentifiers.map((identifier) => `${identifier.type}:${identifier.value}`));
  return nextIdentifiers.some((identifier) => !previous.has(`${identifier.type}:${identifier.value}`));
}

export function applicableDecisionTests(input: ResearchRouterInput): ResearchDecisionTest[] {
  const tests = input.platformKnowledge?.decisionTests ?? [];
  const identifiers = knownIdentifiersForRouter(input).map((identifier) => identifier.value.toUpperCase());
  return tests.filter((test) => {
    const id = test.id.toLowerCase();
    if (id.includes("euu")) return identifiers.some((value) => value.includes("-EUU"));
    if (id.includes("eur-cart")) return identifiers.some((value) => value.includes("-EUR"));
    if (id.includes("nfr")) return identifiers.some((value) => value.startsWith("DIS-NUS-"));
    if (id.includes("label-minus-one")) return identifiers.some((value) => /-\d+$/.test(value));
    return ["BARCODE", "MARKET_REGION", "PACKAGING_LANGUAGES", "CANONICAL_IDENTITY", "ROM_REVISION"].includes(input.targetField);
  });
}
