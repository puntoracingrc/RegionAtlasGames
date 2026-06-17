import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relativePath, fallback) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) return fallback;
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function hasDeveloper(detail) {
  return Boolean(detail?.developer?.name || detail?.developerName || detail?.developerSlug);
}

function hasPublisher(detail) {
  return Boolean(detail?.publisher?.name || detail?.publisherName || detail?.publisherSlug);
}

function hasGenres(detail) {
  return Array.isArray(detail?.genres) && detail.genres.length > 0;
}

function hasYear(game, detail) {
  return Boolean(detail?.year || detail?.releaseYear || game?.year || game?.displayYear);
}

function hasEnoughForRuleSuggestions(game, detail) {
  const title = normalizeText(game?.title);
  if (!title || !game?.platformSlug) return false;
  if (hasGenres(detail)) return true;
  return /\b(fifa|pes|nba|nfl|nhl|wwe|gran turismo|mario kart|resident evil|street fighter|tekken|mortal kombat|tony hawk|formula|f1)\b/.test(title);
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es"))
    .slice(0, limit);
}

function percent(value, total) {
  if (!total) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

const catalog = readJson("data/catalog.json", []);
const details = readJson("data/game-details.json", {});
const genreIndex = readJson("data/index/genres.json", {});

let withPlatform = 0;
let withGenre = 0;
let withPublisher = 0;
let withDeveloper = 0;
let withReleaseYear = 0;
let enoughForRuleSuggestions = 0;
let needingEnrichment = 0;
const byPlatform = new Map();
const existingGenres = new Map();

for (const game of catalog) {
  const detail = details[game.id] ?? null;
  if (game.platformSlug) {
    withPlatform += 1;
    byPlatform.set(game.platformSlug, (byPlatform.get(game.platformSlug) ?? 0) + 1);
  }
  if (hasGenres(detail)) {
    withGenre += 1;
    for (const genre of detail.genres) {
      const name = genre?.name || genre?.slug;
      if (name) existingGenres.set(name, (existingGenres.get(name) ?? 0) + 1);
    }
  }
  if (hasPublisher(detail)) withPublisher += 1;
  if (hasDeveloper(detail)) withDeveloper += 1;
  if (hasYear(game, detail)) withReleaseYear += 1;
  if (hasEnoughForRuleSuggestions(game, detail)) enoughForRuleSuggestions += 1;
  if (!hasGenres(detail) || !hasPublisher(detail) || !hasDeveloper(detail) || !hasYear(game, detail)) needingEnrichment += 1;
}

if (!existingGenres.size) {
  for (const genre of Object.values(genreIndex)) {
    const name = genre?.name || genre?.slug;
    const count = Array.isArray(genre?.gameIds) ? genre.gameIds.length : Number(genre?.gameCount ?? 0);
    if (name && count) existingGenres.set(name, count);
  }
}

const totalGames = catalog.length;
const detailCount = Object.keys(details).length;

console.log("GAME_FACETS_TAXONOMY_AUDIT_V1 coverage");
console.log(`Total games: ${totalGames.toLocaleString("es-ES")}`);
console.log(`Game details available: ${detailCount.toLocaleString("es-ES")}`);
console.log(`Games with existing genre: ${withGenre.toLocaleString("es-ES")} (${percent(withGenre, totalGames)})`);
console.log(`Games with platform: ${withPlatform.toLocaleString("es-ES")} (${percent(withPlatform, totalGames)})`);
console.log(`Games with publisher: ${withPublisher.toLocaleString("es-ES")} (${percent(withPublisher, totalGames)})`);
console.log(`Games with developer: ${withDeveloper.toLocaleString("es-ES")} (${percent(withDeveloper, totalGames)})`);
console.log(`Games with release year: ${withReleaseYear.toLocaleString("es-ES")} (${percent(withReleaseYear, totalGames)})`);
console.log(`Games with enough data for rule-based suggestions: ${enoughForRuleSuggestions.toLocaleString("es-ES")} (${percent(enoughForRuleSuggestions, totalGames)})`);
console.log(`Games needing enrichment: ${needingEnrichment.toLocaleString("es-ES")} (${percent(needingEnrichment, totalGames)})`);
console.log("");
console.log("Top platforms by count:");
for (const [platform, count] of topEntries(byPlatform)) {
  console.log(`- ${platform}: ${count.toLocaleString("es-ES")}`);
}
console.log("");
console.log("Top existing genres/categories:");
for (const [genre, count] of topEntries(existingGenres)) {
  console.log(`- ${genre}: ${count.toLocaleString("es-ES")}`);
}
console.log("");
console.log("Read-only diagnostic: no data was modified.");
