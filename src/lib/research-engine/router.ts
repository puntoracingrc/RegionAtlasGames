import { createHash } from "node:crypto";
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
  return [...new Map(combined.map((identifier) => [`${identifier.type}:${identifier.value}`, identifier])).values()];
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
  const rows = input.sourceKnowledge
    .filter((source) => sourceSupportsPlatform(source, input.catalogContext.platformSlug))
    .filter((source) => source.id !== "regionatlas-own-scan" || input.catalogContext.ownedScans.length > 0)
    .map((source) => {
      const capability = source.fieldCapabilities[input.targetField] ?? 0;
      const explicitBoost = (explicit.get(source.id) ?? 0) * 100;
      const roleBoost = sourceRoleMatches(source, playbook.sourceRoles) ? 25 : 0;
      const score = explicitBoost + capability * 2 + source.defaultReliability + roleBoost;
      return {
        score,
        item: {
          sourceId: source.id,
          hosts: source.hosts,
          roles: source.roles,
          accessModes: source.accessModes,
          capabilityScore: capability,
          reason: explicit.has(source.id)
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
  return [...new Map(rows.sort((a, b) => b.score - a.score).map((row) => [row.item.sourceId, row.item])).values()].slice(0, 16);
}

function templateValues(input: ResearchRouterInput, source: ResearchSourcePlanItem | null): Record<string, string> {
  const context = input.catalogContext;
  const known = knownIdentifiersForRouter(input);
  const first = (type: string) => known.find((identifier) => identifier.type === type)?.value ?? "";
  return {
    TITLE: context.title,
    EDITION: context.edition,
    PLATFORM: context.platformSlug,
    BARCODE: first("BARCODE"),
    SERIAL: first("SERIAL"),
    PRODUCT_CODE: first("PRODUCT_CODE"),
    BOX_CODE: first("BOX_CODE"),
    CART_CODE: first("PRODUCT_CODE"),
    SOURCE_HOST: source?.hosts[0] ?? "",
    HOST: source?.hosts[0] ?? "",
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

function normalizedQuery(query: string): string {
  return query.toLowerCase().replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();
}

function buildQueries(input: ResearchRouterInput, playbook: ResearchPlaybook, sourcePlan: ResearchSourcePlanItem[]) {
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
  const templates = [...inlineTemplates, ...genericTemplates];
  const queries: Array<{ query: string; sourceId: string | null; purpose: ResearchTargetField }> = [];
  const queryableSources = sourcePlan.filter((source) => source.accessModes.some((mode) => mode === "SEARCH_ENGINE" || mode === "DOMAIN_SEARCH"));
  const sources = queryableSources.length ? queryableSources.slice(0, 8) : [null];
  for (const source of sources) {
    const values = templateValues(input, source);
    for (const template of templates) {
      const rendered = renderTemplate(template, values);
      if (!rendered) continue;
      queries.push({ query: rendered, sourceId: source?.sourceId ?? null, purpose: input.targetField });
    }
    for (const template of source?.hosts.length ? input.sourceKnowledge.find((item) => item.id === source.sourceId)?.queryTemplates ?? [] : []) {
      const rendered = renderTemplate(template, values);
      if (rendered) queries.push({ query: rendered, sourceId: source?.sourceId ?? null, purpose: input.targetField });
    }
  }
  return [...new Map(queries.map((query) => [normalizedQuery(query.query), query])).values()].slice(0, 24);
}

function imagePlanFor(target: ResearchTargetField): ResearchRouterPlan["imagePlan"] {
  const rows: Partial<Record<ResearchTargetField, Array<{ component: ResearchComponent; fields: ResearchTargetField[]; reason: string }>>> = {
    BARCODE: [{ component: "BACK", fields: ["BARCODE"], reason: "Barcode must be read from the exact rear package or sticker." }],
    BOX_CODE: [{ component: "BOX_FLAPS", fields: ["BOX_CODE", "PRINT_REVISION"], reason: "Box codes and print revisions are component-scoped." }],
    PACKAGING_LANGUAGES: [{ component: "BACK", fields: ["PACKAGING_LANGUAGES"], reason: "Printed package text must be visually observed." }],
    RATING: [{ component: "FRONT", fields: ["RATING"], reason: "Rating marks are usually visible on physical packaging." }],
    OUTER_INNER_RELATION: [
      { component: "OUTER_BOX", fields: ["OUTER_INNER_RELATION", "BARCODE"], reason: "Bind the outer identifier separately." },
      { component: "INNER_BOX", fields: ["OUTER_INNER_RELATION", "PRODUCT_CODE"], reason: "Bind the inner game separately." },
    ],
    BUNDLE_CONTENTS: [{ component: "OUTER_BOX", fields: ["BUNDLE_CONTENTS", "PHYSICAL_PRODUCT_TYPE"], reason: "The exact bundle contents must be visible or documented." }],
    COLLECTOR_CONTENTS: [{ component: "OUTER_BOX", fields: ["COLLECTOR_CONTENTS", "PHYSICAL_PRODUCT_TYPE"], reason: "Collector packaging does not prove game media is included." }],
    PRODUCT_CODE: [{ component: "CART_FRONT", fields: ["PRODUCT_CODE"], reason: "Read the code from the exact physical medium." }],
    ROM_REVISION: [{ component: "CART_FRONT", fields: ["ROM_REVISION"], reason: "Label evidence is only a clue; technical evidence remains required." }],
  };
  return rows[target] ?? [];
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
    `playbook=${playbook.id}`,
  ];
}

export function routeResearch(input: ResearchRouterInput): ResearchRouterPlan {
  const triggers = triggerSet(input);
  const selectedPlaybook = selectPlaybook(input, triggers);
  const sourcePlan = rankSources(input, selectedPlaybook);
  const queryPlan = buildQueries(input, selectedPlaybook, sourcePlan);
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
    queries: queryPlan.map((query) => query.query),
  });
  return {
    targetField: input.targetField,
    factsUsed: factsUsed(input, selectedPlaybook),
    selectedPlaybook,
    sourcePlan,
    queryPlan,
    imagePlan: imagePlanFor(input.targetField),
    deterministicChecks,
    escalationRules,
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
