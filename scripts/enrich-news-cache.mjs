import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const NEWS_CACHE_FILE = path.join(ROOT, "data", "news-cache.json");
const PLATFORMS_FILE = path.join(ROOT, "data", "platforms.json");

const DEFAULT_KEYWORDS = [
  "videojuego",
  "videojuegos",
  "juego",
  "juegos",
  "playstation",
  "ps4",
  "ps5",
  "nintendo",
  "switch",
  "xbox",
  "steam",
  "pc",
  "consola",
  "consolas",
  "game",
  "games",
  "indie",
  "trailer",
  "lanzamiento",
  "e3",
  "direct",
];

const STRONG_KEYWORDS = [
  "videojuego",
  "videojuegos",
  "playstation",
  "ps4",
  "ps5",
  "nintendo",
  "switch",
  "xbox",
  "steam",
  "consola",
  "consolas",
  "gta",
  "rockstar",
  "game pass",
  "eshop",
];

const BANNED_NEWS_TERMS = [
  "juegos universitarios",
  "juegos olimpicos",
  "juegos olímpicos",
  "juegos de azar",
  "casino",
  "casinos",
  "mundial",
  "futbol",
  "fútbol",
  "phishing",
];

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
    section: "home",
    topic: "general",
    query: "videojuegos España when:1d",
    limit: 9,
    maxAgeDays: 3,
    dryRun: false,
    noCache: false,
    forcePlatform: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--section" && next) {
      options.section = next;
      index += 1;
    } else if (arg === "--topic" && next) {
      options.topic = next;
      index += 1;
    } else if (arg === "--query" && next) {
      options.query = next;
      index += 1;
    } else if (arg === "--platform" && next) {
      options.section = "platform";
      options.topic = next;
      const platform = readPlatform(next);
      options.query = `videojuegos ${platform?.shortName ?? next} ${next} España when:1d`;
      index += 1;
    } else if (arg === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
    } else if (arg === "--max-age-days" && next) {
      options.maxAgeDays = Number(next);
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-cache") {
      options.noCache = true;
    } else if (arg === "--force-platform") {
      options.forcePlatform = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  options.limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(Math.floor(options.limit), 20) : 9;
  options.maxAgeDays =
    Number.isFinite(options.maxAgeDays) && options.maxAgeDays > 0 ? Math.floor(options.maxAgeDays) : 3;
  return options;
}

function printHelp() {
  console.log(`Uso:
  npm run news:enrich -- --dry-run
  npm run news:enrich -- --query "videojuegos España when:1d" --limit 9
  npm run news:enrich -- --platform ps4 --dry-run

Opciones:
  --section home|platform        Sección donde se mostrará.
  --topic general|ps4|retro      Clave interna de bloque.
  --query "..."                  Búsqueda Google News.
  --platform ps4                 Crea query de plataforma. Respeta newsEnabled.
  --force-platform               Permite buscar aunque newsEnabled esté apagado.
  --limit 9                      Noticias guardadas por sección/topic.
  --max-age-days 3               Descarta noticias antiguas.
  --dry-run                      Previsualiza sin guardar.
  --no-cache                     Fuerza búsqueda fresca en SerpAPI.`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readPlatform(slug) {
  return readJson(PLATFORMS_FILE, []).find((platform) => platform.slug === slug) ?? null;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isRelevantNews(result) {
  const text = normalizeText(`${result.title ?? ""} ${result.snippet ?? ""} ${result.source?.name ?? ""}`);
  if (BANNED_NEWS_TERMS.some((term) => text.includes(normalizeText(term)))) return false;
  if (STRONG_KEYWORDS.some((keyword) => text.includes(keyword))) return true;
  return DEFAULT_KEYWORDS.filter((keyword) => text.includes(keyword)).length >= 2;
}

function isFreshNews(result, maxAgeDays) {
  if (!result.iso_date) return true;
  const publishedTime = Date.parse(result.iso_date);
  if (Number.isNaN(publishedTime)) return true;
  return Date.now() - publishedTime <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function stableNewsId(url) {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function toNewsItem(result, options, fetchedAt) {
  return {
    id: stableNewsId(result.link),
    section: options.section,
    topic: options.topic,
    title: result.title,
    sourceName: result.source?.name ?? "Fuente",
    sourceIconUrl: result.source?.icon ?? null,
    url: result.link,
    imageUrl: result.thumbnail ?? result.thumbnail_small ?? null,
    publishedAt: result.iso_date ?? null,
    snippet: result.snippet ?? null,
    query: options.query,
    fetchedAt,
  };
}

async function fetchGoogleNews(options) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_news");
  url.searchParams.set("q", options.query);
  url.searchParams.set("hl", "es");
  url.searchParams.set("gl", "es");
  url.searchParams.set("api_key", process.env.SERPAPI_API_KEY);
  if (options.noCache) url.searchParams.set("no_cache", "true");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`SerpAPI Google News respondió ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.news_results ?? [];
}

async function main() {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("Falta SERPAPI_API_KEY en el entorno o en .env.local");
  }

  if (options.section === "platform") {
    const platform = readPlatform(options.topic);
    if (!platform) throw new Error(`Plataforma no encontrada: ${options.topic}`);
    if (platform.newsEnabled !== true && !options.forcePlatform) {
      console.log(`Noticias apagadas para ${platform.shortName}. No se hace búsqueda.`);
      return;
    }
  }

  const fetchedAt = new Date().toISOString();
  const results = await fetchGoogleNews(options);
  const items = [];
  const seenUrls = new Set();
  for (const result of results) {
    if (!result.title || !result.link) continue;
    if (seenUrls.has(result.link)) continue;
    seenUrls.add(result.link);
    if (!isFreshNews(result, options.maxAgeDays)) continue;
    if (!isRelevantNews(result)) continue;
    items.push(toNewsItem(result, options, fetchedAt));
    if (items.length >= options.limit) break;
  }

  console.log(
    `Noticias candidatas para ${options.section}:${options.topic}: ${items.length}/${results.length} · ${options.query}`,
  );
  for (const item of items) {
    console.log(`- ${item.title} · ${item.sourceName} · ${item.publishedAt ?? "sin fecha"}`);
  }

  if (options.dryRun) return;

  const cache = readJson(NEWS_CACHE_FILE, { updatedAt: fetchedAt, items: [] });
  const previous = Array.isArray(cache.items) ? cache.items : [];
  const nextItems = [
    ...items,
    ...previous.filter((item) => item.section !== options.section || item.topic !== options.topic),
  ];
  writeJson(NEWS_CACHE_FILE, {
    updatedAt: fetchedAt,
    items: nextItems,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
