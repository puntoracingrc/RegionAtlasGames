import {
  RESEARCH_ACCESS_MODES,
  RESEARCH_TARGET_FIELDS,
  type ResearchAccessMode,
  type ResearchDecisionTest,
  type ResearchIdentifierRule,
  type ResearchPlatformKnowledge,
  type ResearchPlaybook,
  type ResearchSourceDefinition,
  type ResearchTargetField,
} from "./v2-types";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a number`);
  return value;
}

const targetSet = new Set<string>(RESEARCH_TARGET_FIELDS);
const accessModeSet = new Set<string>(RESEARCH_ACCESS_MODES);

export function isResearchTargetField(value: unknown): value is ResearchTargetField {
  return typeof value === "string" && targetSet.has(value);
}

function normalizeCapabilityField(value: string): ResearchTargetField | null {
  if (isResearchTargetField(value)) return value;
  if (["CARTRIDGE_CODE", "MANUAL_CODE"].includes(value)) return "PRODUCT_CODE";
  if (value === "NFR_DEMO") return "PHYSICAL_PRODUCT_TYPE";
  if (value === "CANONICAL_GAME_IDENTITY") return "CANONICAL_IDENTITY";
  return null;
}

export function parseResearchSources(value: unknown): ResearchSourceDefinition[] {
  const root = record(value, "sources document");
  if (root.schemaVersion !== 1 || !Array.isArray(root.sources)) throw new Error("sources document schemaVersion=1 is required");
  return root.sources.map((raw, index) => {
    const row = record(raw, `sources[${index}]`);
    const capabilities = record(row.fieldCapabilities ?? {}, `sources[${index}].fieldCapabilities`);
    const fieldCapabilities: Partial<Record<ResearchTargetField, number>> = {};
    for (const [field, score] of Object.entries(capabilities)) {
      const normalized = normalizeCapabilityField(field);
      if (!normalized) continue;
      fieldCapabilities[normalized] = Math.max(fieldCapabilities[normalized] ?? 0, finiteNumber(score, `${field} score`));
    }
    const accessModes = stringArray(row.accessModes, `sources[${index}].accessModes`)
      .filter((mode): mode is ResearchAccessMode => accessModeSet.has(mode));
    if (!accessModes.length) throw new Error(`sources[${index}] has no valid accessModes`);
    const physical = row.physicalImageCapabilities && typeof row.physicalImageCapabilities === "object"
      ? record(row.physicalImageCapabilities, `sources[${index}].physicalImageCapabilities`)
      : null;
    return {
      id: stringValue(row.id, `sources[${index}].id`),
      hosts: stringArray(row.hosts, `sources[${index}].hosts`),
      platforms: stringArray(row.platforms, `sources[${index}].platforms`),
      countries: stringArray(row.countries, `sources[${index}].countries`),
      roles: stringArray(row.roles, `sources[${index}].roles`),
      accessModes,
      fieldCapabilities,
      defaultReliability: finiteNumber(row.defaultReliability, `sources[${index}].defaultReliability`),
      knownRisks: stringArray(row.knownRisks, `sources[${index}].knownRisks`),
      queryTemplates: stringArray(row.queryTemplates, `sources[${index}].queryTemplates`),
      physicalImageCapabilities: physical ? {
        realSpecimenImages: physical.realSpecimenImages === true,
        frontImages: physical.frontImages === true,
        backImages: physical.backImages === true,
        spineImages: physical.spineImages === true,
        cartImages: physical.cartImages === true,
        discImages: physical.discImages === true,
        outerPackageImages: physical.outerPackageImages === true,
        innerContentsImages: physical.innerContentsImages === true,
        gallery: physical.gallery === true,
        originalImages: physical.originalImages === true,
        componentLabels: physical.componentLabels === true,
        regionLabels: physical.regionLabels === true,
        listingIds: physical.listingIds === true,
        accessRisk: Array.isArray(physical.accessRisk) ? physical.accessRisk.filter((item): item is string => typeof item === "string") : [],
      } : undefined,
    };
  });
}

function parseDecisionTests(value: unknown): ResearchDecisionTest[] {
  if (!Array.isArray(value)) throw new Error("decisionTests must be an array");
  return value.map((raw, index) => {
    const row = record(raw, `decisionTests[${index}]`);
    const correct = Array.isArray(row.correct)
      ? stringArray(row.correct, `decisionTests[${index}].correct`)
      : stringValue(row.correct, `decisionTests[${index}].correct`);
    return {
      id: stringValue(row.id, `decisionTests[${index}].id`),
      question: stringValue(row.question, `decisionTests[${index}].question`),
      options: stringArray(row.options, `decisionTests[${index}].options`),
      correct,
      ...(typeof row.action === "string" ? { action: row.action } : {}),
    };
  });
}

function parseIdentifierRules(value: unknown): ResearchIdentifierRule[] {
  if (!Array.isArray(value)) throw new Error("identifierRules must be an array");
  return value.map((raw, index) => {
    const row = record(raw, `identifierRules[${index}]`);
    return {
      id: stringValue(row.id, `identifierRules[${index}].id`),
      trigger: stringValue(row.trigger, `identifierRules[${index}].trigger`),
      ...(typeof row.rule === "string" ? { rule: row.rule } : {}),
      ...(Array.isArray(row.allowedConclusions) ? { allowedConclusions: stringArray(row.allowedConclusions, "allowedConclusions") } : {}),
      ...(Array.isArray(row.forbiddenConclusions) ? { forbiddenConclusions: stringArray(row.forbiddenConclusions, "forbiddenConclusions") } : {}),
      ...(Array.isArray(row.nextEvidence) ? { nextEvidence: stringArray(row.nextEvidence, "nextEvidence") } : {}),
    };
  });
}

export function parsePlatformKnowledge(value: unknown): ResearchPlatformKnowledge {
  const root = record(value, "platform knowledge");
  if (root.schemaVersion !== 1) throw new Error("platform knowledge schemaVersion=1 is required");
  const sources = record(root.sources, "platform sources");
  const capabilities = record(root.sourceCapabilities, "sourceCapabilities");
  const sourceCapabilities: Record<string, Array<[string, number]>> = {};
  for (const [field, rows] of Object.entries(capabilities)) {
    if (!Array.isArray(rows)) throw new Error(`sourceCapabilities.${field} must be an array`);
    sourceCapabilities[field] = rows.map((raw, index) => {
      if (!Array.isArray(raw) || raw.length !== 2) throw new Error(`sourceCapabilities.${field}[${index}] must be a tuple`);
      return [stringValue(raw[0], `${field} source`), finiteNumber(raw[1], `${field} score`)];
    });
  }
  return {
    schemaVersion: 1,
    knowledgeId: stringValue(root.knowledgeId, "knowledgeId"),
    platformSlug: stringValue(root.platformSlug, "platformSlug"),
    reviewedAt: stringValue(root.reviewedAt, "reviewedAt"),
    status: stringValue(root.status, "status"),
    mode: stringValue(root.mode, "mode"),
    purpose: stringValue(root.purpose, "purpose"),
    coreModel: record(root.coreModel, "coreModel"),
    sources: Object.fromEntries(Object.entries(sources).map(([id, source]) => [id, record(source, `source ${id}`)])),
    sourceCapabilities,
    identifierRules: parseIdentifierRules(root.identifierRules),
    decisionTests: parseDecisionTests(root.decisionTests),
    playbooks: Object.fromEntries(Object.entries(record(root.playbooks, "playbooks")).map(([id, playbook]) => [id, record(playbook, `playbook ${id}`)])),
    knownTraps: (Array.isArray(root.knownTraps) ? root.knownTraps : []).map((item, index) => record(item, `knownTraps[${index}]`)),
    caseLearnings: (Array.isArray(root.caseLearnings) ? root.caseLearnings : []).map((item, index) => record(item, `caseLearnings[${index}]`)),
    workerPolicy: record(root.workerPolicy, "workerPolicy"),
    integrationNotes: record(root.integrationNotes, "integrationNotes"),
  };
}

export function sourcesFromPlatformKnowledge(knowledge: ResearchPlatformKnowledge): ResearchSourceDefinition[] {
  return Object.entries(knowledge.sources).map(([id, raw]) => {
    const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "";
    let host = "";
    try {
      host = baseUrl.startsWith("http") ? new URL(baseUrl).hostname : "";
    } catch {
      host = "";
    }
    const fieldCapabilities: Partial<Record<ResearchTargetField, number>> = {};
    for (const [field, rows] of Object.entries(knowledge.sourceCapabilities)) {
      const normalized = normalizeCapabilityField(field);
      const hit = rows.find(([sourceId]) => sourceId === id);
      if (normalized && hit) fieldCapabilities[normalized] = Math.max(fieldCapabilities[normalized] ?? 0, hit[1]);
    }
    const modes = Array.isArray(raw.accessModes) ? raw.accessModes.filter((mode): mode is ResearchAccessMode => typeof mode === "string" && accessModeSet.has(mode)) : [];
    return {
      id,
      hosts: host ? [host] : [],
      platforms: [knowledge.platformSlug],
      countries: ["*"],
      roles: [typeof raw.kind === "string" ? raw.kind.toUpperCase() : "SPECIALIZED_DATABASE"],
      accessModes: modes.length ? modes : ["SEARCH_ENGINE"],
      fieldCapabilities,
      defaultReliability: typeof raw.priority === "number" ? raw.priority : 50,
      knownRisks: Array.isArray(raw.cautions) ? raw.cautions.filter((item): item is string => typeof item === "string") : [],
      queryTemplates: [],
    };
  });
}

export function parseGeneralPlaybooks(value: unknown): ResearchPlaybook[] {
  const root = record(value, "playbooks document");
  if (root.schemaVersion !== 1 || !Array.isArray(root.playbooks)) throw new Error("playbooks document schemaVersion=1 is required");
  return root.playbooks.map((raw, index) => {
    const row = record(raw, `playbooks[${index}]`);
    const targets = stringArray(row.targets, `playbooks[${index}].targets`)
      .filter((target): target is ResearchTargetField | "*" => target === "*" || isResearchTargetField(target));
    if (!targets.length) throw new Error(`playbooks[${index}] has no valid targets`);
    return {
      id: stringValue(row.id, `playbooks[${index}].id`),
      targets,
      triggers: stringArray(row.triggers, `playbooks[${index}].triggers`),
      sourceRoles: Array.isArray(row.sourceRoles) ? stringArray(row.sourceRoles, "sourceRoles") : [],
      queryTemplateGroups: Array.isArray(row.queryTemplateGroups) ? stringArray(row.queryTemplateGroups, "queryTemplateGroups") : [],
      deterministicChecks: Array.isArray(row.deterministicChecks) ? stringArray(row.deterministicChecks, "deterministicChecks") : [],
      steps: Array.isArray(row.steps) ? stringArray(row.steps, "steps") : [],
      stopWhen: typeof row.stopWhen === "string" ? row.stopWhen : null,
      stopRule: typeof row.stopRule === "string" ? row.stopRule : null,
      sourceIds: Array.isArray(row.sourceIds) ? stringArray(row.sourceIds, "sourceIds") : [],
      requiredEvidencePreference: Array.isArray(row.requiredEvidencePreference) ? stringArray(row.requiredEvidencePreference, "requiredEvidencePreference") : [],
    };
  });
}

export function playbooksFromPlatformKnowledge(knowledge: ResearchPlatformKnowledge): ResearchPlaybook[] {
  return Object.entries(knowledge.playbooks).map(([id, raw]) => {
    const triggers = Array.isArray(raw.trigger) ? raw.trigger.filter((item): item is string => typeof item === "string") : [];
    const targets = triggers
      .filter((trigger) => trigger.startsWith("TARGET="))
      .map((trigger) => trigger.slice("TARGET=".length))
      .filter(isResearchTargetField);
    return {
      id,
      targets: targets.length ? targets : ["*"],
      triggers,
      sourceRoles: [],
      queryTemplateGroups: [],
      deterministicChecks: ["SUBJECT_BINDING", "PLATFORM_MATCH", "COMPONENT_BINDING"],
      steps: Array.isArray(raw.steps) ? raw.steps.filter((item): item is string => typeof item === "string") : [],
      stopWhen: null,
      stopRule: typeof raw.stopRule === "string" ? raw.stopRule : null,
      sourceIds: Array.isArray(raw.sourceOrder) ? raw.sourceOrder.filter((item): item is string => typeof item === "string") : [],
      requiredEvidencePreference: Array.isArray(raw.requiredEvidencePreference)
        ? raw.requiredEvidencePreference.filter((item): item is string => typeof item === "string")
        : [],
    };
  });
}
