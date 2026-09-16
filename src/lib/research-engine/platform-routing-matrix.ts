import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResearchTargetField } from "./v2-types";

export type PlatformRoutingStatus = "COMPLETE" | "PARTIAL" | "INCOMPLETE";
export type PlatformRoutingEntry = {
  family: string;
  identifierFamilies: string[];
  evidenceFiles: string[];
  status: PlatformRoutingStatus;
  gaps: string[];
  fields?: Partial<Record<ResearchTargetField, string[]>>;
  forbidden?: string[];
};

export type PlatformRoutingMatrix = {
  schemaVersion: 1;
  reviewedAt: string;
  routeOrder: string[];
  families: Record<string, { fields: Partial<Record<ResearchTargetField, string[]>>; forbidden: string[] }>;
  platforms: Record<string, PlatformRoutingEntry>;
};

export function loadPlatformRoutingMatrix(rootDir = process.cwd()): PlatformRoutingMatrix {
  const file = path.join(rootDir, "data/research-engine/knowledge/platform-routing-matrix.json");
  const value = JSON.parse(readFileSync(file, "utf8")) as PlatformRoutingMatrix;
  if (value.schemaVersion !== 1 || !value.families || !value.platforms) throw new Error("INVALID_PLATFORM_ROUTING_MATRIX");
  return value;
}

export function resolvedPlatformRouting(matrix: PlatformRoutingMatrix, platformSlug: string) {
  const platform = matrix.platforms[platformSlug];
  if (!platform) return null;
  const family = matrix.families[platform.family];
  if (!family) throw new Error(`UNKNOWN_PLATFORM_ROUTING_FAMILY:${platform.family}`);
  return {
    ...platform,
    fields: { ...family.fields, ...(platform.fields ?? {}) },
    forbidden: [...new Set([...(family.forbidden ?? []), ...(platform.forbidden ?? [])])],
  };
}
