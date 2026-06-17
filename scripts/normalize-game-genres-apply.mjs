import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const confirm = process.env.CONFIRM_GAME_GENRE_NORMALIZATION;
const reportPath = path.join(root, "data/game-genre-normalization-apply-report.local.json");
const allowedApprovedRawGenres = new Set([
  "amp; Adventure",
  "amp; NFR",
  "amp; Card",
  "Track &amp; Field",
]);
const dataFiles = [
  "data/game-details.json",
  "data/index/genres.json",
  "data/index/genre-entities.json",
];

function timestampForPath(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readJson(relativePath, fallback) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) return fallback;
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function writeJson(relativePath, value) {
  writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    slug: slugify(name),
    source: template?.source ? `${template.source}+normalization-apply-v1` : "normalization-apply-v1",
  };
}

function dedupeGenres(genres) {
  const seen = new Set();
  const output = [];
  for (const genre of genres) {
    const name = genreName(genre).trim();
    if (!name) continue;
    const slug = typeof genre === "string" ? slugify(name) : genre.slug || slugify(name);
    const key = `${slug}|${name.toLocaleLowerCase("es-ES")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(genre);
  }
  return output;
}

function normalizeGenreArray(genres, approvedRules, ruleStats, gameMeta, samplesByRule) {
  const after = [];
  let changed = false;
  let modifiedEntries = 0;
  const rulesUsed = [];

  for (const genre of genres) {
    const raw = genreName(genre);
    const rule = approvedRules.get(raw);
    if (!rule) {
      after.push(genre);
      continue;
    }

    changed = true;
    modifiedEntries += 1;
    rulesUsed.push(rule.raw);
    const stat = ruleStats.get(rule.raw) ?? {
      raw: rule.raw,
      normalized: rule.normalized,
      action: rule.action,
      modifiedGenreEntries: 0,
      affectedGames: new Set(),
    };
    stat.modifiedGenreEntries += 1;
    if (gameMeta?.id) stat.affectedGames.add(gameMeta.id);
    ruleStats.set(rule.raw, stat);

    const samples = samplesByRule.get(rule.raw) ?? [];
    if (samples.length < 20 && gameMeta) {
      samples.push({
        gameId: gameMeta.id,
        title: gameMeta.title ?? null,
        platformSlug: gameMeta.platformSlug ?? null,
        before: genres.map(genreName),
        after: null,
      });
      samplesByRule.set(rule.raw, samples);
    }

    for (const normalizedName of rule.normalized) {
      after.push(cloneGenreWithName(genre, normalizedName));
    }
  }

  const deduped = dedupeGenres(after);
  if (changed) {
    for (const rule of rulesUsed) {
      const samples = samplesByRule.get(rule) ?? [];
      const pending = samples.find((sample) => sample.gameId === gameMeta?.id && sample.after === null);
      if (pending) pending.after = deduped.map(genreName);
    }
  }

  return { changed, after: deduped, modifiedEntries, rulesUsed: [...new Set(rulesUsed)] };
}

function catalogMap(catalog) {
  return new Map(catalog.map((game) => [game.id, game]));
}

function recalculateIndexEntry(entry, catalogById) {
  const gameIds = [...new Set((entry.gameIds ?? []).filter((id) => catalogById.has(id)))];
  const byPlatform = {};
  for (const id of gameIds) {
    const game = catalogById.get(id);
    if (!game?.platformSlug) continue;
    byPlatform[game.platformSlug] = (byPlatform[game.platformSlug] ?? 0) + 1;
  }
  return {
    ...entry,
    gameIds,
    byPlatform: Object.fromEntries(Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b))),
    gameCount: gameIds.length,
  };
}

function mergeIndexEntry(target, source, name, slug, catalogById) {
  return recalculateIndexEntry(
    {
      ...(target ?? {}),
      name: target?.name ?? name,
      slug,
      museumPath: target?.museumPath ?? `/genero/${slug}`,
      gameIds: [...(target?.gameIds ?? []), ...(source?.gameIds ?? [])],
      byPlatform: {},
      gameCount: 0,
    },
    catalogById,
  );
}

function normalizeGenreIndex(genreIndex, approvedRules, catalogById, warnings) {
  let changed = false;
  const modifiedIndexEntries = [];

  for (const [sourceSlug, entry] of Object.entries({ ...genreIndex })) {
    const rule = approvedRules.get(entry?.name);
    if (!rule) continue;
    const targetNames = rule.normalized;
    const sourceEntry = genreIndex[sourceSlug];
    for (const targetName of targetNames) {
      const targetSlug = slugify(targetName);
      if (!targetSlug) {
        warnings.push(`No se pudo crear slug para ${targetName}`);
        continue;
      }
      genreIndex[targetSlug] = mergeIndexEntry(
        genreIndex[targetSlug],
        sourceEntry,
        targetName,
        targetSlug,
        catalogById,
      );
    }
    if (!targetNames.map(slugify).includes(sourceSlug)) {
      delete genreIndex[sourceSlug];
    } else if (targetNames.length === 1) {
      const targetSlug = slugify(targetNames[0]);
      genreIndex[targetSlug] = { ...genreIndex[targetSlug], name: targetNames[0], slug: targetSlug };
    }
    modifiedIndexEntries.push({ raw: rule.raw, sourceSlug, normalized: targetNames });
    changed = true;
  }

  return { changed, modifiedIndexEntries };
}

function uniqueList(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeAliasNames(aliasNames, approvedRules) {
  let changed = false;
  const next = [];
  for (const alias of aliasNames ?? []) {
    const rule = approvedRules.get(alias);
    if (!rule) {
      next.push(alias);
      continue;
    }
    changed = true;
    next.push(...rule.normalized);
  }
  return { changed, aliasNames: uniqueList(next) };
}

function normalizeGenreEntities(genreEntities, approvedRules) {
  let changed = false;
  const entities = genreEntities.entities ?? {};
  genreEntities.entities = entities;
  genreEntities.slugToCanonical = genreEntities.slugToCanonical ?? {};
  genreEntities.normalizedToCanonical = genreEntities.normalizedToCanonical ?? {};

  for (const [sourceSlug, entity] of Object.entries({ ...entities })) {
    const nameRule = approvedRules.get(entity?.name);
    const aliasResult = normalizeAliasNames(entity?.aliasNames ?? [], approvedRules);
    if (aliasResult.changed && entities[sourceSlug]) {
      entities[sourceSlug] = { ...entities[sourceSlug], aliasNames: aliasResult.aliasNames };
      changed = true;
    }

    if (!nameRule) continue;
    if (nameRule.normalized.length > 1) continue;

    const targetName = nameRule.normalized[0];
    const targetSlug = slugify(targetName);
    if (!targetSlug) continue;

    const updated = {
      ...entity,
      slug: targetSlug,
      name: targetName,
      mergeMethod: entity.mergeMethod ?? "manual",
      aliasSlugs: uniqueList([...(entity.aliasSlugs ?? []), sourceSlug]).filter((slug) => slug !== targetSlug),
      aliasNames: uniqueList([...(entity.aliasNames ?? []), entity.name]).filter((name) => name !== targetName && !approvedRules.has(name)),
    };
    delete entities[sourceSlug];
    entities[targetSlug] = entities[targetSlug]
      ? {
          ...entities[targetSlug],
          aliasSlugs: uniqueList([...(entities[targetSlug].aliasSlugs ?? []), ...(updated.aliasSlugs ?? [])]),
          aliasNames: uniqueList([...(entities[targetSlug].aliasNames ?? []), ...(updated.aliasNames ?? [])]),
        }
      : updated;
    genreEntities.slugToCanonical[sourceSlug] = targetSlug;
    genreEntities.slugToCanonical[targetSlug] = targetSlug;
    genreEntities.normalizedToCanonical[targetSlug] = targetSlug;
    changed = true;
  }

  if (changed) genreEntities.generatedAt = new Date().toISOString();
  return { changed };
}

function createBackup(files) {
  const relativeBackupPath = path.join("data", "backups", "game-genre-normalization", timestampForPath());
  const absoluteBackupPath = path.join(root, relativeBackupPath);
  mkdirSync(absoluteBackupPath, { recursive: true });
  for (const relativeFile of files) {
    const source = path.join(root, relativeFile);
    if (!existsSync(source)) continue;
    const destination = path.join(absoluteBackupPath, relativeFile.replace(/^data\//, ""));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  return relativeBackupPath;
}

function writeFailureReport(report) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (confirm !== "YES") {
  console.error("GAME_GENRE_NORMALIZATION_APPLY_V1 apply blocked.");
  console.error("Run: CONFIRM_GAME_GENRE_NORMALIZATION=YES npm run normalize:game-genres:apply");
  process.exit(1);
}

const timestamp = new Date().toISOString();
const warnings = [];
const errors = [];
const normalizationMap = readJson("data/game-genre-normalization.json", []);
const approvedRules = new Map();

for (const rule of normalizationMap) {
  if (!rule?.raw || !Array.isArray(rule.normalized) || rule.status !== "approved") continue;
  if (!allowedApprovedRawGenres.has(rule.raw)) {
    warnings.push(`Regla approved ignorada por no estar en allowlist V1: ${rule.raw}`);
    continue;
  }
  approvedRules.set(rule.raw, rule);
}

for (const raw of allowedApprovedRawGenres) {
  if (!approvedRules.has(raw)) errors.push(`Regla requerida no está approved en el mapa: ${raw}`);
}

const baseReport = {
  module: "GAME_GENRE_NORMALIZATION_APPLY_V1",
  timestamp,
  totalGamesScanned: 0,
  totalGamesModified: 0,
  totalGenreEntriesModified: 0,
  rulesApplied: [...approvedRules.values()].map((rule) => ({
    raw: rule.raw,
    normalized: rule.normalized,
    action: rule.action,
    status: rule.status,
  })),
  affectedCountsByRule: [],
  samplesByRule: {},
  filesModified: [],
  backupPath: null,
  warnings,
  errors,
  success: false,
};

if (errors.length) {
  writeFailureReport(baseReport);
  console.error("GAME_GENRE_NORMALIZATION_APPLY_V1 failed before writing.");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const backupPath = createBackup(dataFiles);
baseReport.backupPath = backupPath;

const catalog = readJson("data/catalog.json", []);
const details = readJson("data/game-details.json", {});
const genreIndex = readJson("data/index/genres.json", {});
const genreEntities = readJson("data/index/genre-entities.json", { entities: {} });
const catalogById = catalogMap(catalog);
const ruleStats = new Map();
const samplesByRule = new Map();
let detailsChanged = false;
let genreEntriesModified = 0;
let gamesModified = 0;

for (const [gameId, detail] of Object.entries(details)) {
  if (!Array.isArray(detail?.genres) || detail.genres.length === 0) continue;
  const game = catalogById.get(gameId) ?? { id: gameId, title: gameId, platformSlug: null };
  const result = normalizeGenreArray(detail.genres, approvedRules, ruleStats, game, samplesByRule);
  if (!result.changed) continue;
  detail.genres = result.after;
  details[gameId] = detail;
  detailsChanged = true;
  gamesModified += 1;
  genreEntriesModified += result.modifiedEntries;
}

const indexResult = normalizeGenreIndex(genreIndex, approvedRules, catalogById, warnings);
const entityResult = normalizeGenreEntities(genreEntities, approvedRules);
const filesModified = [];

if (detailsChanged) {
  writeJson("data/game-details.json", details);
  filesModified.push("data/game-details.json");
}
if (indexResult.changed) {
  writeJson("data/index/genres.json", genreIndex);
  filesModified.push("data/index/genres.json");
}
if (entityResult.changed) {
  writeJson("data/index/genre-entities.json", genreEntities);
  filesModified.push("data/index/genre-entities.json");
}

const affectedCountsByRule = [...ruleStats.values()]
  .map((stat) => ({
    raw: stat.raw,
    normalized: stat.normalized,
    action: stat.action,
    affectedGames: stat.affectedGames.size,
    modifiedGenreEntries: stat.modifiedGenreEntries,
  }))
  .sort((a, b) => b.affectedGames - a.affectedGames || a.raw.localeCompare(b.raw, "es"));

const report = {
  ...baseReport,
  totalGamesScanned: catalog.length,
  totalGamesModified: gamesModified,
  totalGenreEntriesModified: genreEntriesModified,
  affectedCountsByRule,
  samplesByRule: Object.fromEntries([...samplesByRule.entries()].map(([raw, samples]) => [raw, samples])),
  filesModified,
  warnings,
  errors,
  success: errors.length === 0,
};

writeFailureReport(report);

console.log("GAME_GENRE_NORMALIZATION_APPLY_V1");
console.log(`Total games scanned: ${report.totalGamesScanned.toLocaleString("es-ES")}`);
console.log(`Total games modified: ${report.totalGamesModified.toLocaleString("es-ES")}`);
console.log(`Total genre entries modified: ${report.totalGenreEntriesModified.toLocaleString("es-ES")}`);
console.log("Affected by rule:");
if (!report.affectedCountsByRule.length) console.log("- none");
for (const item of report.affectedCountsByRule) {
  console.log(
    `- ${item.raw} -> ${item.normalized.join(" + ")}: ${item.affectedGames.toLocaleString("es-ES")} games, ${item.modifiedGenreEntries.toLocaleString("es-ES")} entries`,
  );
}
console.log(`Backup: ${backupPath}`);
console.log("Report: data/game-genre-normalization-apply-report.local.json");
console.log(`Files modified: ${filesModified.length ? filesModified.join(", ") : "none"}`);
console.log(`Success: ${report.success}`);

if (!report.success) process.exit(1);
