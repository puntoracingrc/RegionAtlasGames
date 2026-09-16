#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import { authoritativeResearchSourceRegistry } from "../src/lib/research-engine/source-policy";
import { loadPlatformRoutingMatrix, resolvedPlatformRouting } from "../src/lib/research-engine/platform-routing-matrix";

const root = process.cwd();
const outputDir = path.resolve(root, process.env.CURATOR_DEEP_OUTPUT_DIR || "artifacts/review-curator-deep");
const matrix = loadPlatformRoutingMatrix(root);
const catalogPlatforms = [...new Set(catalogData.map((game) => game.platformSlug))].sort();
const known = [...new Set([...Object.keys(matrix.platforms), ...catalogPlatforms])].sort();
const registry = authoritativeResearchSourceRegistry();
const legacyHosts = ["redump.org", "redump.info", "serialstation.com", "dbox.tools", "no-intro.org", "datomatic.no-intro.org"];
const registeredHosts = new Set(registry.flatMap((source) => source.hosts).map((host) => host.replace(/^www\./, "")));
const remainingLegacyInconsistencies = legacyHosts.filter((host) => !registeredHosts.has(host));

const rows = known.map((platform) => {
  const route = resolvedPlatformRouting(matrix, platform);
  const fields = route?.fields ?? {};
  const has = (field: string) => Array.isArray((fields as Record<string, unknown>)[field]) && ((fields as Record<string, string[]>)[field]?.length ?? 0) > 0;
  return {
    platform,
    identity: has("CANONICAL_IDENTITY") ? "YES" : "FAMILY",
    codes: has("PRODUCT_CODE") ? "YES" : "NO",
    region: has("MARKET_REGION") ? "YES" : "NO",
    packaging: has("PACKAGING_LANGUAGES") || has("BARCODE") ? "YES" : "NO",
    components: has("OUTER_INNER_RELATION") || route?.family.includes("CARTRIDGE") ? "YES" : "PARTIAL",
    sources: [...new Set(Object.values(fields).flat())].length,
    status: route?.status ?? "INCOMPLETE",
    gaps: route?.gaps ?? ["No reviewed operational routing entry; catalog presence alone is not knowledge."],
    evidenceFiles: route?.evidenceFiles ?? [],
  };
});
const counts = Object.fromEntries(["COMPLETE", "PARTIAL", "INCOMPLETE"].map((status) => [status.toLowerCase(), rows.filter((row) => row.status === status).length]));
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), knownPlatformCount: rows.length, counts,
  legacyNewSourceRegistryInconsistencies: { audited: legacyHosts.length, fixed: legacyHosts.length - remainingLegacyInconsistencies.length, remaining: remainingLegacyInconsistencies.length, remainingHosts: remainingLegacyInconsistencies },
  authoritativeSourceRegistry: "data/research-engine/knowledge/sources.json", rows,
};
mkdirSync(outputDir, { recursive: true });
writeFileSync(path.join(outputDir, "platform-knowledge-coverage.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const lines = [
  "# Platform knowledge coverage", "", `- Known platforms: ${rows.length}`, `- Complete: ${counts.complete}`, `- Partial: ${counts.partial}`, `- Incomplete: ${counts.incomplete}`,
  `- Legacy/new source inconsistencies: audited ${legacyHosts.length}; fixed ${legacyHosts.length - remainingLegacyInconsistencies.length}; remaining ${remainingLegacyInconsistencies.length}.`, "",
  "| Platform | Identity | Codes | Region | Packaging | Components | Sources | Status |", "|---|---|---|---|---|---|---:|---|",
  ...rows.map((row) => `| ${row.platform} | ${row.identity} | ${row.codes} | ${row.region} | ${row.packaging} | ${row.components} | ${row.sources} | ${row.status} |`), "",
  "## Gaps", "", ...rows.filter((row) => row.gaps.length).flatMap((row) => [`### ${row.platform}`, "", ...row.gaps.map((gap) => `- ${gap}`), ""]),
  "## Contract", "", "- PLATFORM KNOWLEDGE ROUTING: implemented.", "- Worker receives the precomputed platform knowledge pack.",
  "- First Pass receives the same pack without network access.", "- Deep Curator receives the same pack and generic search is last resort.",
];
writeFileSync(path.join(outputDir, "platform-knowledge-coverage.md"), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
