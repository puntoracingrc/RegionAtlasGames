import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CATALOG_FILE = path.join(ROOT, "data", "catalog.json");
const DETAILS_FILE = path.join(ROOT, "data", "game-details.json");

const DEFAULT_OFFICIAL_HANDLES = ["@playstation"];
const GENERIC_TITLE_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "edition",
  "edicion",
  "complete",
  "collection",
  "deluxe",
  "standard",
  "ps4",
  "playstation",
  "pal",
  "espana",
  "españa",
]);

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const options = {
    platform: "ps4",
    region: null,
    limit: 25,
    maxVideos: 3,
    dryRun: false,
    force: false,
    noCache: false,
    officialHandles: DEFAULT_OFFICIAL_HANDLES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--platform" && next) {
      options.platform = next;
      index += 1;
    } else if (arg === "--region" && next) {
      options.region = next;
      index += 1;
    } else if (arg === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
    } else if (arg === "--max-videos" && next) {
      options.maxVideos = Number(next);
      index += 1;
    } else if (arg === "--channel" && next) {
      options.officialHandles = [normalizeHandle(next)];
      index += 1;
    } else if (arg === "--extra-channel" && next) {
      options.officialHandles.push(normalizeHandle(next));
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--no-cache") {
      options.noCache = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  options.limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 25;
  options.maxVideos =
    Number.isFinite(options.maxVideos) && options.maxVideos > 0 ? Math.min(Math.floor(options.maxVideos), 6) : 3;
  options.officialHandles = [...new Set(options.officialHandles.map(normalizeHandle).filter(Boolean))];
  return options;
}

function printHelp() {
  console.log(`Uso:
  node scripts/enrich-youtube-videos.mjs --platform ps4 --limit 20 --dry-run
  node scripts/enrich-youtube-videos.mjs --platform ps4 --limit 200

Opciones:
  --platform ps4              Plataforma del catálogo a procesar.
  --region "PAL España"       Región opcional.
  --limit 25                  Máximo de juegos a procesar.
  --max-videos 3              Vídeos guardados por ficha.
  --channel @PlayStation      Canal oficial principal.
  --extra-channel @...        Canal oficial adicional.
  --force                     Rehacer fichas que ya tienen vídeos.
  --dry-run                   Previsualizar sin escribir data/game-details.json.
  --no-cache                  Forzar búsqueda fresca en SerpAPI.`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeHandle(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const handle = raw.includes("/@") ? raw.slice(raw.lastIndexOf("/@") + 1) : raw;
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&amp;/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function titleTokens(title) {
  return normalizeText(title)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !GENERIC_TITLE_TOKENS.has(token));
}

function tokenMatchScore(gameTitle, videoTitle) {
  const tokens = titleTokens(gameTitle);
  if (tokens.length === 0) return 0;
  const normalizedVideoTitle = normalizeText(videoTitle);
  const matched = tokens.filter((token) => normalizedVideoTitle.includes(token));
  return matched.length / tokens.length;
}

function channelHandle(candidate) {
  const link = candidate?.channel?.link ?? "";
  const handleMatch = link.match(/youtube\.com\/(@[^/?#]+)/i);
  if (handleMatch) return normalizeHandle(handleMatch[1]);
  return normalizeHandle(candidate?.channel?.name ?? "");
}

function isOfficialPlayStation(candidate, officialHandles) {
  const handle = channelHandle(candidate);
  if (officialHandles.includes(handle)) return true;
  const channelName = normalizeText(candidate?.channel?.name ?? "");
  return channelName === "playstation" && officialHandles.includes("@playstation");
}

function classifyVideo(title) {
  const normalized = normalizeText(title);
  if (normalized.includes("gameplay")) return "official-gameplay";
  if (normalized.includes("trailer") || normalized.includes("teaser")) return "official-trailer";
  return "official-video";
}

function candidateScore(game, candidate, options) {
  if (!candidate?.video_id || !candidate?.title) return 0;
  if (!isOfficialPlayStation(candidate, options.officialHandles)) return 0;

  const primaryTitleScore = tokenMatchScore(game.title, candidate.title);
  const altTitleScore = game.titlePc ? tokenMatchScore(game.titlePc, candidate.title) : 0;
  const titleScore = Math.max(primaryTitleScore, altTitleScore);
  if (titleScore < 0.66) return 0;

  const normalizedTitle = normalizeText(candidate.title);
  let score = 50 + Math.round(titleScore * 30);
  if (normalizedTitle.includes("ps4") || normalizedTitle.includes("playstation 4")) score += 10;
  if (normalizedTitle.includes("trailer")) score += 8;
  if (normalizedTitle.includes("gameplay")) score += 5;
  if (normalizedTitle.includes("launch")) score += 3;
  if (candidate.channel?.verified) score += 2;
  score -= Math.max(0, (candidate.position_on_page ?? 1) - 1);
  return score;
}

function toGameVideo(candidate, fetchedAt) {
  return {
    provider: "youtube",
    source: "youtube-serpapi",
    videoId: candidate.video_id,
    url: candidate.link ?? `https://www.youtube.com/watch?v=${candidate.video_id}`,
    title: candidate.title,
    channelTitle: candidate.channel?.name ?? null,
    channelUrl: candidate.channel?.link ?? null,
    thumbnailUrl:
      typeof candidate.thumbnail === "string"
        ? candidate.thumbnail
        : candidate.thumbnail?.static ?? candidate.thumbnail?.rich ?? null,
    publishedAt: candidate.published_date ?? null,
    duration: candidate.length ?? null,
    kind: classifyVideo(candidate.title),
    fetchedAt,
  };
}

async function searchYoutube(query, options) {
  const apiKey = process.env.SERPAPI_API_KEY;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "youtube");
  url.searchParams.set("search_query", query);
  url.searchParams.set("hl", "es");
  url.searchParams.set("gl", "es");
  url.searchParams.set("api_key", apiKey);
  if (options.noCache) url.searchParams.set("no_cache", "true");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SerpAPI YouTube respondió ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.video_results ?? [];
}

function buildQueries(game, platform) {
  const title = game.titlePc && game.titlePc.length < game.title.length + 20 ? game.titlePc : game.title;
  return [
    `${title} ${platform.toUpperCase()} official trailer PlayStation`,
    `${title} ${platform.toUpperCase()} gameplay trailer PlayStation`,
    `${title} PlayStation trailer`,
  ];
}

async function findVideosForGame(game, options) {
  const seenIds = new Set();
  const scored = [];

  for (const query of buildQueries(game, options.platform)) {
    const candidates = await searchYoutube(query, options);
    for (const candidate of candidates) {
      if (seenIds.has(candidate.video_id)) continue;
      seenIds.add(candidate.video_id);
      const score = candidateScore(game, candidate, options);
      if (score <= 0) continue;
      scored.push({ candidate, score });
    }
    if (scored.length >= options.maxVideos) break;
  }

  const fetchedAt = new Date().toISOString();
  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, options.maxVideos)
    .map(({ candidate }) => toGameVideo(candidate, fetchedAt));
}

function emptyDetails() {
  return {
    year: null,
    releaseDate: null,
    reference: null,
    players: null,
    support: null,
    developer: null,
    publisher: null,
    genres: [],
    series: null,
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("Falta SERPAPI_API_KEY en el entorno o en .env.local");
  }

  const catalog = readJson(CATALOG_FILE);
  const detailsById = readJson(DETAILS_FILE);
  const games = catalog.filter((game) => {
    if (game.platformSlug !== options.platform) return false;
    if (options.region && game.region !== options.region) return false;
    if (!options.force && detailsById[game.id]?.videos?.length > 0) return false;
    return true;
  });
  const selected = games.slice(0, options.limit);

  console.log(
    `Buscando vídeos de YouTube para ${selected.length}/${games.length} juegos (${options.platform}). ` +
      `Canales: ${options.officialHandles.join(", ")}${options.dryRun ? " · simulación" : ""}`,
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const game of selected) {
    try {
      const videos = await findVideosForGame(game, options);
      if (videos.length === 0) {
        skipped += 1;
        console.log(`- ${game.id}: sin vídeo oficial claro`);
        continue;
      }
      updated += 1;
      console.log(`- ${game.id}: ${videos.length} vídeo(s)`);
      for (const video of videos) {
        console.log(`  · ${video.title} (${video.channelTitle})`);
      }
      if (!options.dryRun) {
        detailsById[game.id] = {
          ...emptyDetails(),
          ...(detailsById[game.id] ?? {}),
          videos,
        };
      }
    } catch (error) {
      failed += 1;
      console.log(`- ${game.id}: error · ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!options.dryRun && updated > 0) {
    writeJson(DETAILS_FILE, detailsById);
  }

  console.log(`Listo. Actualizados: ${updated}. Sin candidato: ${skipped}. Errores: ${failed}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
