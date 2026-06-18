import mappingData from "../../../data/facet-external-signal-mapping.json";
import { normalizeFacetText } from "./normalize";
import {
  findGameFacetEntityById,
  findGameFacetEntityByNameOrAlias,
} from "./taxonomy";
import type { GameFacetTaxonomyEntity, GameFacetTaxonomyType } from "./types";

export type ExternalFacetSignalSource =
  | "steam"
  | "vandal"
  | "official"
  | "wikipedia"
  | "wikidata"
  | "pricecharting"
  | "manual"
  | "unknown";

export type ExternalFacetSignalMappingStatus = "approved" | "review" | "blocked";

export type ExternalFacetSignalMapping = {
  source: ExternalFacetSignalSource;
  signal: string;
  targetId: string;
  targetType: GameFacetTaxonomyType;
  confidence: number;
  status: ExternalFacetSignalMappingStatus;
  notes?: string;
};

export type ExternalFacetSignalInput = {
  source?: ExternalFacetSignalSource | string | null;
  signal: string;
};

export type ExternalFacetSignalResolution = {
  ok: boolean;
  source: ExternalFacetSignalSource;
  signal: string;
  normalizedSignal: string;
  matchMethod: "explicit" | "taxonomy-alias" | "none";
  confidence: number;
  status: ExternalFacetSignalMappingStatus | "unmapped";
  target: GameFacetTaxonomyEntity | null;
  warning?: string;
};

const VALID_SOURCES = new Set<ExternalFacetSignalSource>([
  "steam",
  "vandal",
  "official",
  "wikipedia",
  "wikidata",
  "pricecharting",
  "manual",
  "unknown",
]);

const mappings = mappingData as ExternalFacetSignalMapping[];

function normalizeSource(source: ExternalFacetSignalInput["source"]): ExternalFacetSignalSource {
  const normalized = String(source ?? "unknown").trim().toLowerCase();
  return VALID_SOURCES.has(normalized as ExternalFacetSignalSource)
    ? (normalized as ExternalFacetSignalSource)
    : "unknown";
}

function mappingKey(source: ExternalFacetSignalSource, signal: string): string {
  return `${source}:${normalizeFacetText(signal)}`;
}

const explicitMappings = new Map<string, ExternalFacetSignalMapping>();
for (const mapping of mappings) {
  explicitMappings.set(mappingKey(mapping.source, mapping.signal), mapping);
}

export function listExternalFacetSignalMappings(): ExternalFacetSignalMapping[] {
  return mappings;
}

export function resolveExternalFacetSignal(input: ExternalFacetSignalInput): ExternalFacetSignalResolution {
  const source = normalizeSource(input.source);
  const signal = input.signal.trim();
  const normalizedSignal = normalizeFacetText(signal);

  if (!signal) {
    return {
      ok: false,
      source,
      signal,
      normalizedSignal,
      matchMethod: "none",
      confidence: 0,
      status: "unmapped",
      target: null,
      warning: "empty_signal",
    };
  }

  const explicit = explicitMappings.get(mappingKey(source, signal)) ?? explicitMappings.get(mappingKey("unknown", signal));
  if (explicit) {
    const target = findGameFacetEntityById(explicit.targetId) ?? null;
    return {
      ok: Boolean(target) && explicit.status !== "blocked",
      source,
      signal,
      normalizedSignal,
      matchMethod: "explicit",
      confidence: explicit.confidence,
      status: explicit.status,
      target,
      warning: target ? undefined : "missing_target_entity",
    };
  }

  const target = findGameFacetEntityByNameOrAlias(signal) ?? null;
  if (target) {
    return {
      ok: true,
      source,
      signal,
      normalizedSignal,
      matchMethod: "taxonomy-alias",
      confidence: source === "steam" || source === "vandal" ? 0.82 : 0.75,
      status: "review",
      target,
      warning: "implicit_taxonomy_alias_match",
    };
  }

  return {
    ok: false,
    source,
    signal,
    normalizedSignal,
    matchMethod: "none",
    confidence: 0,
    status: "unmapped",
    target: null,
    warning: "unmapped_signal",
  };
}

export function resolveExternalFacetSignals(inputs: ExternalFacetSignalInput[]): ExternalFacetSignalResolution[] {
  const seen = new Set<string>();
  const results: ExternalFacetSignalResolution[] = [];

  for (const input of inputs) {
    const result = resolveExternalFacetSignal(input);
    const key = `${result.target?.id ?? result.normalizedSignal}:${result.source}:${result.matchMethod}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(result);
  }

  return results.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return b.confidence - a.confidence || a.normalizedSignal.localeCompare(b.normalizedSignal, "es");
  });
}
