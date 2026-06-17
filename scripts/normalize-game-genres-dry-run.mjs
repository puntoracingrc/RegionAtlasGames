import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "data/game-genre-normalization-report.local.json");

function readJson(relativePath, fallback) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) return fallback;
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function genreName(genre) {
  if (typeof genre === "string") return genre;
  return genre?.name ?? genre?.slug ?? "";
}

function cloneGenreWithName(template, name) {
  if (typeof template === "string") return name;
  return {
    ...template,
    name,
    slug: String(name)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    source: template?.source ? `${template.source}+normalization-v1` : "normalization-v1",
  };
}

function dedupeGenres(genres) {
  const seen = new Set();
  const output = [];
  for (const genre of genres) {
    const name = genreName(genre).trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("es-ES");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(genre);
  }
  return output;
}

function normalizeGenreArray(genres, approvedRules, affectedByRawGenre, gameId) {
  const after = [];
  let changed = false;
  const rulesUsed = [];

  for (const genre of genres) {
    const raw = genreName(genre);
    const rule = approvedRules.get(raw);
    if (!rule) {
      after.push(genre);
      continue;
    }

    changed = true;
    rulesUsed.push(rule.raw);
    const stat = affectedByRawGenre.get(rule.raw) ?? {
      raw: rule.raw,
      normalized: rule.normalized,
      action: rule.action,
      status: rule.status,
      affectedGames: 0,
      examples: [],
    };
    stat.affectedGames += 1;
    if (stat.examples.length < 8) stat.examples.push(gameId);
    affectedByRawGenre.set(rule.raw, stat);

    for (const normalizedName of rule.normalized) {
      after.push(cloneGenreWithName(genre, normalizedName));
    }
  }

  return { changed, after: dedupeGenres(after), rulesUsed: [...new Set(rulesUsed)] };
}

const catalog = readJson("data/catalog.json", []);
const details = readJson("data/game-details.json", {});
const normalizationMap = readJson("data/game-genre-normalization.json", []);

const approvedRules = new Map();
const reviewRules = [];
const warnings = [];

for (const rule of normalizationMap) {
  if (!rule?.raw || !Array.isArray(rule.normalized) || !rule.action || !rule.status) {
    warnings.push(`Regla incompleta ignorada: ${JSON.stringify(rule)}`);
    continue;
  }
  if (rule.status === "approved") approvedRules.set(rule.raw, rule);
  else reviewRules.push(rule);
}

const affectedByRawGenre = new Map();
const beforeAfterPreview = [];
const unknownGenreCounts = new Map();
let totalAffectedGames = 0;
let scannedGamesWithGenres = 0;

for (const game of catalog) {
  const detail = details[game.id];
  const genres = Array.isArray(detail?.genres) ? detail.genres : [];
  if (genres.length) scannedGamesWithGenres += 1;

  for (const genre of genres) {
    const raw = genreName(genre);
    if (raw && !approvedRules.has(raw) && !normalizationMap.some((rule) => rule.raw === raw)) {
      unknownGenreCounts.set(raw, (unknownGenreCounts.get(raw) ?? 0) + 1);
    }
  }

  const result = normalizeGenreArray(genres, approvedRules, affectedByRawGenre, game.id);
  if (!result.changed) continue;

  totalAffectedGames += 1;
  if (beforeAfterPreview.length < 40) {
    beforeAfterPreview.push({
      gameId: game.id,
      title: game.title,
      platformSlug: game.platformSlug,
      before: genres.map(genreName),
      after: result.after.map(genreName),
      rulesUsed: result.rulesUsed,
    });
  }
}

const unknownGenresNotMapped = [...unknownGenreCounts.entries()]
  .map(([raw, count]) => ({ raw, count }))
  .sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw, "es"))
  .slice(0, 80);

const report = {
  module: "GAME_GENRE_NORMALIZATION_V1",
  generatedAt: new Date().toISOString(),
  mode: "dry-run",
  noWritePerformed: true,
  totalGamesScanned: catalog.length,
  scannedGamesWithGenres,
  totalAffectedGames,
  approvedRules: [...approvedRules.values()].map((rule) => ({
    raw: rule.raw,
    normalized: rule.normalized,
    action: rule.action,
    confidence: rule.confidence,
  })),
  reviewRules: reviewRules.map((rule) => ({
    raw: rule.raw,
    normalized: rule.normalized,
    action: rule.action,
    confidence: rule.confidence,
    reason: rule.reason,
  })),
  affectedByRawGenre: [...affectedByRawGenre.values()].sort(
    (a, b) => b.affectedGames - a.affectedGames || a.raw.localeCompare(b.raw, "es"),
  ),
  beforeAfterPreview,
  unknownGenresNotMapped,
  warnings,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log("GAME_GENRE_NORMALIZATION_V1 dry-run");
console.log(`Total games scanned: ${report.totalGamesScanned.toLocaleString("es-ES")}`);
console.log(`Games with genres scanned: ${report.scannedGamesWithGenres.toLocaleString("es-ES")}`);
console.log(`Total affected games: ${report.totalAffectedGames.toLocaleString("es-ES")}`);
console.log("Affected by raw genre:");
if (!report.affectedByRawGenre.length) {
  console.log("- none");
} else {
  for (const item of report.affectedByRawGenre) {
    console.log(`- ${item.raw} -> ${item.normalized.join(" + ")}: ${item.affectedGames.toLocaleString("es-ES")}`);
  }
}
console.log(`Review-only rules: ${report.reviewRules.length.toLocaleString("es-ES")}`);
console.log(`Unknown genres not mapped: ${report.unknownGenresNotMapped.length.toLocaleString("es-ES")} shown in report`);
console.log(`Report: data/game-genre-normalization-report.local.json`);
console.log("No write performed: true");
