import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchLegacyKnowledgeEntry } from "./v2-types";

type LegacySource = { url?: unknown; kind?: unknown; attribution?: unknown };
type LegacyEntry = {
  id?: unknown;
  text?: unknown;
  status?: unknown;
  sourceIds?: unknown;
  catalogIds?: unknown;
  distributionVariants?: unknown;
};

type LegacyDocument = {
  platformSlug?: unknown;
  batch?: unknown;
  sources?: unknown;
  inspectionRules?: unknown;
  gameReferences?: unknown;
};

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
  : [];

function sourceMap(value: unknown): Record<string, LegacySource> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, LegacySource> : {};
}

function entries(value: unknown): LegacyEntry[] {
  return Array.isArray(value) ? value.filter((item): item is LegacyEntry => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function normalizedEntry(input: {
  raw: LegacyEntry;
  kind: ResearchLegacyKnowledgeEntry["kind"];
  platformSlug: string;
  batch: string;
  sources: Record<string, LegacySource>;
}): ResearchLegacyKnowledgeEntry | null {
  if (typeof input.raw.id !== "string" || typeof input.raw.text !== "string") return null;
  const status = typeof input.raw.status === "string" ? input.raw.status : "reviewed_guidance";
  const sourceIds = strings(input.raw.sourceIds);
  const resolvedSources = sourceIds.flatMap((sourceId) => {
    const source = input.sources[sourceId];
    if (!source || typeof source.url !== "string" || !/^https:\/\//i.test(source.url)) return [];
    return [{
      id: `${input.batch}:${sourceId}`,
      url: source.url,
      kind: typeof source.kind === "string" ? source.kind : "documentary_source",
      attribution: typeof source.attribution === "string" ? source.attribution : null,
    }];
  });
  if (!resolvedSources.length) return null;
  return {
    id: `${input.batch}:${input.raw.id}`,
    platformSlug: input.platformSlug,
    batch: input.batch,
    kind: input.kind,
    status,
    text: input.raw.text.trim(),
    catalogIds: strings(input.raw.catalogIds),
    sourceIds: resolvedSources.map((source) => source.id),
    sources: resolvedSources,
    distributionVariants: Array.isArray(input.raw.distributionVariants) ? input.raw.distributionVariants : [],
    trust: status === "reviewed_guidance" ? "reviewed_guidance" : "candidate_only",
  };
}

export async function loadLegacyScannerKnowledge(input: {
  platformSlug: string;
  catalogIds?: string[];
  rootDir?: string;
}): Promise<ResearchLegacyKnowledgeEntry[]> {
  const directory = path.join(input.rootDir ?? process.cwd(), "data", "region-research");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const selectedCatalogIds = new Set(input.catalogIds ?? []);
  const result: ResearchLegacyKnowledgeEntry[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(directory, file), "utf8")) as LegacyDocument;
    if (raw.platformSlug !== input.platformSlug || typeof raw.batch !== "string") continue;
    const sources = sourceMap(raw.sources);
    const candidates = [
      ...entries(raw.inspectionRules).map((entry) => ({ entry, kind: "inspection_rule" as const })),
      ...entries(raw.gameReferences).map((entry) => ({ entry, kind: "game_reference" as const })),
    ];
    for (const candidate of candidates) {
      const normalized = normalizedEntry({ raw: candidate.entry, kind: candidate.kind, platformSlug: input.platformSlug, batch: raw.batch, sources });
      if (!normalized) continue;
      if (candidate.kind === "game_reference" && selectedCatalogIds.size > 0 && !normalized.catalogIds.some((id) => selectedCatalogIds.has(id))) continue;
      result.push(normalized);
    }
  }
  return result;
}
