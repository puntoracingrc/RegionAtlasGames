#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  descriptionModel,
  openAiConfigured,
  runAdminAiFill,
  type AdminAiFillRunResult,
} from "../src/lib/admin-ai-fill";
import { draftFromCatalogGame } from "../src/lib/admin-draft-patch";
import {
  buildCatalogAiProposal,
  CATALOG_AI_ENRICHMENT_SCHEMA_VERSION,
  catalogGameNeedsAiEnrichment,
  type CatalogAiEnrichmentMode,
  type CatalogAiEnrichmentPlatform,
  type CatalogAiEnrichmentProposal,
  type CatalogAiEnrichmentResult,
} from "../src/lib/catalog-ai-enrichment-campaign";
import { listedCatalog } from "../src/lib/catalog";
import { getGameDetails } from "../src/lib/indexes";

type Options = {
  platformSlug: CatalogAiEnrichmentPlatform;
  enrichmentMode: CatalogAiEnrichmentMode;
  limit: number;
  startAfterCatalogId: string | null;
  titleQuery: string | null;
  output: string;
  delayMs: number;
};

function parseEnvFile(filePath: string): void {
  try {
    for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {}
}

function loadLocalEnvironment(): void {
  const explicit = process.env.REGION_ATLAS_ENV_FILE?.trim();
  if (explicit) parseEnvFile(path.resolve(explicit));
  parseEnvFile(path.join(process.cwd(), ".env.local"));
}

function valueAfter(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseOptions(argv: string[]): Options {
  const platformValue = valueAfter(argv, "--platform") ?? "ps5";
  if (!["ps4", "ps5", "switch2"].includes(platformValue)) {
    throw new Error("--platform debe ser ps4, ps5 o switch2");
  }
  const modeValue = valueAfter(argv, "--mode") ?? "missing";
  if (modeValue !== "missing" && modeValue !== "force") {
    throw new Error("--mode debe ser missing o force");
  }
  const limit = Math.max(1, Math.min(20, Number.parseInt(valueAfter(argv, "--limit") ?? "5", 10) || 5));
  const delayMs = Math.max(0, Math.min(10_000, Number.parseInt(valueAfter(argv, "--delay-ms") ?? "500", 10) || 0));
  const output = valueAfter(argv, "--output")?.trim();
  if (!output) throw new Error("Falta --output para guardar el informe de propuestas");

  return {
    platformSlug: platformValue as CatalogAiEnrichmentPlatform,
    enrichmentMode: modeValue,
    limit,
    startAfterCatalogId: valueAfter(argv, "--after")?.trim() || null,
    titleQuery: valueAfter(argv, "--title")?.trim() || null,
    output: path.resolve(output),
    delayMs,
  };
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function emptyFailedRun(error: unknown): AdminAiFillRunResult {
  return {
    finalDraft: null,
    error: error instanceof Error ? error.message : "Error inesperado en el enriquecedor local.",
    fieldsUpdated: [],
    sources: [],
    urls: [],
    steamTags: [],
    logs: [],
    qualitySignals: [],
  };
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const options = parseOptions(process.argv.slice(2));
  if (!openAiConfigured()) throw new Error("Falta OPENAI_API_KEY en el PC que ejecuta el runner.");

  const platformGames = listedCatalog
    .filter((game) => game.listingStatus !== "excluded" && game.platformSlug === options.platformSlug)
    .sort((a, b) => a.title.localeCompare(b.title, "es", { numeric: true }) || a.id.localeCompare(b.id));
  const incompleteBefore = platformGames.filter((game) => catalogGameNeedsAiEnrichment(getGameDetails(game.id))).length;
  let gamesAfterCursor = platformGames;
  if (options.startAfterCatalogId) {
    const cursorIndex = platformGames.findIndex((game) => game.id === options.startAfterCatalogId);
    if (cursorIndex < 0) {
      throw new Error(`El cursor ${options.startAfterCatalogId} ya no existe en ${options.platformSlug}.`);
    }
    gamesAfterCursor = platformGames.slice(cursorIndex + 1);
  }

  let candidates = gamesAfterCursor.filter((game) => {
    if (options.enrichmentMode === "force") return true;
    return catalogGameNeedsAiEnrichment(getGameDetails(game.id));
  });

  if (options.titleQuery) {
    const wanted = normalizeSearch(options.titleQuery);
    candidates = candidates.filter((game) => normalizeSearch(`${game.title} ${game.id}`).includes(wanted));
  }
  const selected = candidates.slice(0, options.limit);
  const proposals: CatalogAiEnrichmentProposal[] = [];
  console.log(
    `Campaña IA ${options.platformSlug.toUpperCase()}: ${selected.length} de ${candidates.length} candidatas · modelo ${descriptionModel()}`,
  );

  for (const [index, game] of selected.entries()) {
    const details = getGameDetails(game.id);
    const draft = draftFromCatalogGame(game, details);
    console.log(`[${index + 1}/${selected.length}] ${game.title} · ${game.id}`);
    let run: AdminAiFillRunResult;
    try {
      run = await runAdminAiFill(draft, {
        onlyMissing: options.enrichmentMode === "missing",
        includeMetadata: true,
        includeDescription: true,
      });
    } catch (error) {
      run = emptyFailedRun(error);
    }
    const proposal = buildCatalogAiProposal({ game, details, run });
    proposals.push(proposal);
    console.log(`  ${proposal.status} · calidad ${proposal.qualityScore}/100 · fuentes ${proposal.urls.length}`);
    if (options.delayMs > 0 && index < selected.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  const lastSelected = selected.at(-1)?.id ?? options.startAfterCatalogId;
  const result: CatalogAiEnrichmentResult = {
    schemaVersion: CATALOG_AI_ENRICHMENT_SCHEMA_VERSION,
    source: "region-atlas-catalog-ai",
    mode: "proposal-only",
    containsWrites: false,
    generatedAt: new Date().toISOString(),
    model: descriptionModel(),
    platformSlug: options.platformSlug,
    enrichmentMode: options.enrichmentMode,
    cursor: {
      startAfterCatalogId: options.startAfterCatalogId,
      nextCatalogId: lastSelected ?? null,
      hasMore: candidates.length > selected.length,
    },
    stats: {
      catalogGames: platformGames.length,
      incompleteBefore,
      selected: proposals.length,
      ready: proposals.filter((proposal) => proposal.status === "ready").length,
      review: proposals.filter((proposal) => proposal.status === "review").length,
      errors: proposals.filter((proposal) => proposal.status === "error").length,
    },
    proposals,
  };

  mkdirSync(path.dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Informe: ${options.output}`);
  console.log(`Resultado: listas ${result.stats.ready} · revisar ${result.stats.review} · errores ${result.stats.errors}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
