import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relativePath, fallback) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) return fallback;
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function htmlEntityLike(value) {
  return /&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/i.test(value) || /(^|\s)amp;(\s|$)/i.test(value);
}

function hasAmpArtifact(value) {
  return /(^|\s|&)amp;(\s|$)/i.test(value);
}

function hasUnusualSeparator(value) {
  return /\s*(?:\||;|\\|\+|\s\/\s|\s-\s|\s>\s)\s*/.test(value);
}

function looksCompound(value) {
  return /\s+(?:&|and|y|e|vs\.?|versus)\s+/i.test(value) || /\s\/\s/.test(value) || /,/.test(value) || hasAmpArtifact(value);
}

function splitSuggested(value) {
  const decoded = value
    .replace(/&amp;/gi, "&")
    .replace(/(^|\s)amp;(\s|$)/gi, " & ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  const parts = decoded
    .split(/\s*(?:&|\/|,|\||;|\+|\s+and\s+|\s+y\s+|\s+e\s+)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return [...new Set(parts)];
}

function actionFor(value) {
  const parts = splitSuggested(value);
  if (hasAmpArtifact(value) && parts.length > 1) return "suggest_split";
  if (htmlEntityLike(value) && parts.length === 1 && parts[0] !== value.trim()) return "suggest_normalize";
  if (looksCompound(value) && parts.length > 1) return "suggest_split";
  if (value !== value.trim() || /\s{2,}/.test(value)) return "suggest_trim";
  return "review";
}

function reasonFor(value) {
  if (hasAmpArtifact(value)) return "HTML entity parsing artifact";
  if (htmlEntityLike(value)) return "HTML entity found in genre value";
  if (value !== value.trim()) return "Leading/trailing spaces";
  if (/\s{2,}/.test(value)) return "Repeated whitespace";
  if (hasUnusualSeparator(value)) return "Unusual separator detected";
  if (looksCompound(value)) return "Compound genre candidate";
  return "Manual review candidate";
}

function confidenceFor(value) {
  if (hasAmpArtifact(value)) return 0.95;
  if (htmlEntityLike(value)) return 0.9;
  if (value !== value.trim() || /\s{2,}/.test(value)) return 0.85;
  if (looksCompound(value)) return 0.75;
  return 0.55;
}

function addGenre(map, raw, source, gameId = null) {
  const rawValue = raw == null ? "" : String(raw);
  const key = rawValue;
  const entry = map.get(key) ?? {
    raw: rawValue,
    count: 0,
    sources: new Set(),
    examples: [],
  };
  entry.count += 1;
  entry.sources.add(source);
  if (gameId && entry.examples.length < 5) entry.examples.push(gameId);
  map.set(key, entry);
}

function topEntries(entries, limit) {
  return entries
    .sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw, "es"))
    .slice(0, limit);
}

function printList(title, entries, limit = 20) {
  console.log(title);
  if (!entries.length) {
    console.log("- none");
    console.log("");
    return;
  }
  for (const entry of entries.slice(0, limit)) {
    const examples = entry.examples.length ? ` · examples: ${entry.examples.join(", ")}` : "";
    console.log(`- ${entry.raw || "<empty>"}: ${entry.count.toLocaleString("es-ES")}${examples}`);
  }
  console.log("");
}

const details = readJson("data/game-details.json", {});
const genreIndex = readJson("data/index/genres.json", {});
const genreMap = new Map();
let emptyOrNullGenreValues = 0;
let detailRecordsWithEmptyGenreArray = 0;

for (const [gameId, detail] of Object.entries(details)) {
  if (!Array.isArray(detail?.genres)) continue;
  if (detail.genres.length === 0) detailRecordsWithEmptyGenreArray += 1;
  for (const genre of detail.genres) {
    const value = typeof genre === "string" ? genre : genre?.name ?? genre?.slug ?? "";
    if (value == null || String(value).trim() === "") emptyOrNullGenreValues += 1;
    addGenre(genreMap, value, "game-details", gameId);
  }
}

for (const [slug, genre] of Object.entries(genreIndex)) {
  const count = Array.isArray(genre?.gameIds) ? genre.gameIds.length : Number(genre?.gameCount ?? 0) || 1;
  const value = genre?.name ?? genre?.slug ?? slug;
  const entry = genreMap.get(String(value)) ?? {
    raw: String(value ?? ""),
    count: 0,
    sources: new Set(),
    examples: [],
  };
  entry.count += count;
  entry.sources.add("genre-index");
  genreMap.set(entry.raw, entry);
}

const genres = [...genreMap.values()].map((entry) => ({
  ...entry,
  sources: [...entry.sources].sort(),
  normalizedKey: normalizeKey(entry.raw),
}));

const lowerCaseGroups = new Map();
for (const entry of genres) {
  if (!entry.raw.trim()) continue;
  const group = lowerCaseGroups.get(entry.normalizedKey) ?? [];
  group.push(entry);
  lowerCaseGroups.set(entry.normalizedKey, group);
}

const duplicateVariants = [...lowerCaseGroups.values()]
  .filter((group) => new Set(group.map((entry) => entry.raw)).size > 1)
  .flatMap((group) => group);

const ampGenres = genres.filter((entry) => hasAmpArtifact(entry.raw));
const htmlEntityGenres = genres.filter((entry) => htmlEntityLike(entry.raw));
const whitespaceGenres = genres.filter((entry) => entry.raw !== entry.raw.trim() || /\s{2,}/.test(entry.raw));
const separatorGenres = genres.filter((entry) => hasUnusualSeparator(entry.raw));
const compoundGenres = genres.filter((entry) => looksCompound(entry.raw));
const tooSpecificGenres = genres.filter((entry) => entry.count <= 3 && /\b(?:edition|bundle|collection|pack|demo|nfr|promo|limited|collector|deluxe|ultimate|complete)\b/i.test(entry.raw));
const emptyGenres = genres.filter((entry) => !entry.raw.trim());

const candidatePreview = topEntries(
  [...new Map([...ampGenres, ...htmlEntityGenres, ...whitespaceGenres, ...separatorGenres, ...compoundGenres, ...duplicateVariants, ...tooSpecificGenres].map((entry) => [entry.raw, entry])).values()],
  30,
).map((entry) => {
  const suggested = splitSuggested(entry.raw);
  return {
    raw: entry.raw,
    suggestedNormalized: suggested.length > 1 ? suggested : suggested[0] ?? entry.raw.trim(),
    reason: reasonFor(entry.raw),
    confidence: confidenceFor(entry.raw),
    action: actionFor(entry.raw),
    destructive: false,
  };
});

console.log("GAME_GENRE_DATA_QUALITY_AUDIT_V1");
console.log(`Total unique genres: ${genres.length.toLocaleString("es-ES")}`);
console.log(`Genres containing amp;: ${ampGenres.length.toLocaleString("es-ES")}`);
console.log(`Genres containing HTML entities: ${htmlEntityGenres.length.toLocaleString("es-ES")}`);
console.log(`Genres with leading/trailing or double spaces: ${whitespaceGenres.length.toLocaleString("es-ES")}`);
console.log(`Genres with unusual separators: ${separatorGenres.length.toLocaleString("es-ES")}`);
console.log(`Genres that look compound: ${compoundGenres.length.toLocaleString("es-ES")}`);
console.log(`Empty/null genre values: ${(emptyOrNullGenreValues + emptyGenres.length).toLocaleString("es-ES")}`);
console.log(`Detail records with empty genre arrays: ${detailRecordsWithEmptyGenreArray.toLocaleString("es-ES")}`);
console.log(`Case/diacritic duplicate variant entries: ${duplicateVariants.length.toLocaleString("es-ES")}`);
console.log(`Too-specific review candidates: ${tooSpecificGenres.length.toLocaleString("es-ES")}`);
console.log("");

printList("Top 50 genres by count:", topEntries([...genres], 50), 50);
printList("Genres containing amp;:", topEntries([...ampGenres], 50), 50);
printList("Genres containing HTML entities:", topEntries([...htmlEntityGenres], 50), 50);
printList("Genres with leading/trailing spaces or double spaces:", topEntries([...whitespaceGenres], 50), 50);
printList("Genres with unusual separators:", topEntries([...separatorGenres], 50), 50);
printList("Genres that look like compound genres:", topEntries([...compoundGenres], 50), 50);
printList("Empty/null genres:", topEntries([...emptyGenres], 50), 50);
printList("Too-specific candidates:", topEntries([...tooSpecificGenres], 50), 50);

console.log("Candidate normalization map preview:");
if (!candidatePreview.length) {
  console.log("- none");
} else {
  for (const candidate of candidatePreview) {
    const suggested = Array.isArray(candidate.suggestedNormalized)
      ? candidate.suggestedNormalized.join(" + ")
      : candidate.suggestedNormalized;
    console.log(
      `- ${candidate.raw || "<empty>"} -> ${suggested} (${candidate.action}, confidence ${candidate.confidence})`,
    );
  }
}
console.log("");
console.log("Read-only diagnostic: no games, categories, facets, landings or public UI were modified.");
