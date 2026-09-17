import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLegacyScannerKnowledge } from "./legacy-knowledge-adapter";
import {
  parseGeneralPlaybooks,
  parsePlatformKnowledge,
  parseResearchSources,
  playbooksFromPlatformKnowledge,
  sourcesFromPlatformKnowledge,
} from "./knowledge-schema";
import type { ResearchKnowledgeBundle, ResearchPlaybook, ResearchSourceDefinition } from "./v2-types";

async function readJson(rootDir: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

function versionedDocument(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).schemaVersion !== 1) {
    throw new Error(`${label} schemaVersion=1 is required`);
  }
  return value as Record<string, unknown>;
}

function mergeSources(values: ResearchSourceDefinition[]): ResearchSourceDefinition[] {
  const merged = new Map<string, ResearchSourceDefinition>();
  for (const source of values) {
    const current = merged.get(source.id);
    if (!current) {
      merged.set(source.id, source);
      continue;
    }
    const fieldCapabilities = { ...current.fieldCapabilities };
    for (const [field, score] of Object.entries(source.fieldCapabilities)) {
      const key = field as keyof typeof fieldCapabilities;
      fieldCapabilities[key] = Math.max(fieldCapabilities[key] ?? 0, score ?? 0);
    }
    merged.set(source.id, {
      ...current,
      hosts: [...new Set([...current.hosts, ...source.hosts])],
      platforms: [...new Set([...current.platforms, ...source.platforms])],
      countries: [...new Set([...current.countries, ...source.countries])],
      roles: [...new Set([...current.roles, ...source.roles])],
      accessModes: [...new Set([...current.accessModes, ...source.accessModes])],
      fieldCapabilities,
      discoveryCapabilities: [...new Set([...(current.discoveryCapabilities ?? []), ...(source.discoveryCapabilities ?? [])])],
      confirmationCapabilities: [...new Set([...(current.confirmationCapabilities ?? []), ...(source.confirmationCapabilities ?? [])])],
      negativeEvidenceCapabilities: [...new Set([...(current.negativeEvidenceCapabilities ?? []), ...(source.negativeEvidenceCapabilities ?? [])])],
      defaultReliability: Math.max(current.defaultReliability, source.defaultReliability),
      knownRisks: [...new Set([...current.knownRisks, ...source.knownRisks])],
      queryTemplates: [...new Set([...current.queryTemplates, ...source.queryTemplates])],
      physicalImageCapabilities: source.physicalImageCapabilities ?? current.physicalImageCapabilities,
    });
  }
  return [...merged.values()];
}

function mergePlaybooks(values: ResearchPlaybook[]): ResearchPlaybook[] {
  return [...new Map(values.map((playbook) => [playbook.id, playbook])).values()];
}

export async function loadResearchKnowledge(input: {
  platformSlug: string;
  catalogIds?: string[];
  franchiseId?: string | null;
  rootDir?: string;
}): Promise<ResearchKnowledgeBundle> {
  const rootDir = input.rootDir ?? process.cwd();
  const base = "data/research-engine/knowledge";
  const loadedFiles = [
    `${base}/sources.json`,
    `${base}/playbooks/general.json`,
    `${base}/query-templates.json`,
  ];
  const generalPaths = [
    `${base}/source-capabilities.json`,
    `${base}/source-access.json`,
    `${base}/identifier-patterns.json`,
    `${base}/barcode-rules.json`,
    `${base}/region-patterns.json`,
    `${base}/physical-product-rules.json`,
    `${base}/known-traps.json`,
  ];
  loadedFiles.push(...generalPaths);
  const [genericSourcesRaw, genericPlaybooksRaw, queryTemplatesRaw, ...generalRaw] = await Promise.all([
    readJson(rootDir, loadedFiles[0]),
    readJson(rootDir, loadedFiles[1]),
    readJson(rootDir, loadedFiles[2]),
    ...generalPaths.map((filename) => readJson(rootDir, filename)),
  ]);
  const generalDocuments = Object.fromEntries(generalPaths.map((filename, index) => [
    path.basename(filename, ".json"),
    versionedDocument(generalRaw[index], filename),
  ]));
  let platform = null;
  const platformPath = `${base}/platforms/${input.platformSlug}.json`;
  try {
    platform = parsePlatformKnowledge(await readJson(rootDir, platformPath));
    loadedFiles.push(platformPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const franchiseRules: string[] = [];
  if (input.franchiseId) {
    const franchisePath = `${base}/franchises/${input.franchiseId}.json`;
    try {
      const raw = await readJson(rootDir, franchisePath) as { rules?: unknown; platformMethods?: unknown; sourcePriority?: unknown };
      if (Array.isArray(raw.rules)) franchiseRules.push(...raw.rules.filter((item): item is string => typeof item === "string"));
      if (raw.platformMethods && typeof raw.platformMethods === "object" && !Array.isArray(raw.platformMethods)) {
        const methods = (raw.platformMethods as Record<string, unknown>)[input.platformSlug];
        if (Array.isArray(methods)) franchiseRules.push(...methods.filter((item): item is string => typeof item === "string"));
      }
      if (Array.isArray(raw.sourcePriority)) {
        franchiseRules.push(`Preferred franchise sources: ${raw.sourcePriority.filter((item): item is string => typeof item === "string").join(", ")}.`);
      }
      loadedFiles.push(franchisePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const queryDocument = queryTemplatesRaw as { schemaVersion?: unknown; templates?: unknown };
  if (queryDocument.schemaVersion !== 1 || !queryDocument.templates || typeof queryDocument.templates !== "object" || Array.isArray(queryDocument.templates)) {
    throw new Error("query templates schemaVersion=1 is required");
  }
  const queryTemplates = Object.fromEntries(Object.entries(queryDocument.templates as Record<string, unknown>).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
  ]));
  const genericSources = parseResearchSources(genericSourcesRaw);
  const genericPlaybooks = parseGeneralPlaybooks(genericPlaybooksRaw);
  const legacyEntries = await loadLegacyScannerKnowledge({
    platformSlug: input.platformSlug,
    catalogIds: input.catalogIds,
    rootDir,
  });
  return {
    platform,
    generalDocuments,
    sources: mergeSources([...genericSources, ...(platform ? sourcesFromPlatformKnowledge(platform) : [])]),
    playbooks: mergePlaybooks([...genericPlaybooks, ...(platform ? playbooksFromPlatformKnowledge(platform) : [])]),
    queryTemplates,
    legacyEntries,
    franchiseRules,
    loadedFiles,
  };
}
