import { missingOpenAiMessage, openAiConfigured, openAiJson } from "./admin-ai-fill";
import { getAdminSeries } from "./admin-series-manager";

type SeriesWikipediaReference = {
  title: string;
  url: string;
  extract: string;
  lang: "es" | "en";
};

type SeriesSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

function clip(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function seriesSearchNames(name: string): string[] {
  return [...new Set(
    name
      .split(/[\/|]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .concat(name.trim()),
  )].slice(0, 3);
}

async function fetchWikipediaSeriesPage(title: string, lang: "es" | "en"): Promise<SeriesWikipediaReference | null> {
  const pageParams = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    titles: title,
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${pageParams}`, {
    headers: { "User-Agent": "RegionAtlasGames/1.0 (admin series ai)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title?: string; extract?: string; fullurl?: string }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  const extract = page?.extract?.trim() ?? "";
  if (!page?.title || extract.length < 80) return null;
  return {
    title: page.title,
    url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    extract,
    lang,
  };
}

async function searchWikipediaSeries(name: string): Promise<SeriesWikipediaReference | null> {
  const languages: Array<"es" | "en"> = ["es", "en"];
  const names = seriesSearchNames(name);
  for (const lang of languages) {
    for (const seriesName of names) {
      const queries = [
        `${seriesName} videojuego saga`,
        `${seriesName} serie de videojuegos`,
        `${seriesName} video game series`,
      ];
      for (const query of queries) {
        const searchParams = new URLSearchParams({
          action: "query",
          list: "search",
          srsearch: query,
          srlimit: "4",
          format: "json",
          origin: "*",
        });
        const searchRes = await fetch(`https://${lang}.wikipedia.org/w/api.php?${searchParams}`, {
          headers: { "User-Agent": "RegionAtlasGames/1.0 (admin series ai)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!searchRes.ok) continue;
        const searchData = (await searchRes.json()) as {
          query?: { search?: Array<{ title?: string; snippet?: string }> };
        };
        const candidates = searchData.query?.search ?? [];
        for (const candidate of candidates) {
          if (!candidate.title) continue;
          const page = await fetchWikipediaSeriesPage(candidate.title, lang).catch(() => null);
          if (page) return page;
        }
      }
    }
  }
  return null;
}

function serpApiKey(): string {
  return process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim() || "";
}

async function searchSeriesWebWithSerpApi(name: string): Promise<SeriesSearchResult[]> {
  const apiKey = serpApiKey();
  if (!apiKey) return [];
  const query = `"${name}" videojuego saga historia evolución`;
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    google_domain: "google.es",
    gl: "es",
    hl: "es",
    num: "6",
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    headers: { "User-Agent": "RegionAtlasGames/1.0 (admin series ai)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string; source?: string }>;
  };
  return (data.organic_results ?? [])
    .filter((result) => result.link && result.title)
    .slice(0, 6)
    .map((result) => ({
      title: result.title?.trim() ?? "",
      url: result.link?.trim() ?? "",
      snippet: result.snippet?.trim() ?? "",
      source: result.source?.trim() ?? "",
    }));
}

export async function fillAdminSeriesDescriptionWithAi(
  slug: string,
  currentDescription?: string | null,
): Promise<{ ok: true; description: string } | { error: string }> {
  if (!openAiConfigured()) return { error: missingOpenAiMessage() };

  const detail = await getAdminSeries(slug);
  if ("error" in detail) return detail;

  const games = detail.games.slice(0, 80).map((game) => ({
    title: game.title,
    platform: game.platformSlug,
    region: game.region,
    year: game.year,
    genres: game.genres.map((genre) => genre.name).slice(0, 4),
    facets: game.facets.map((facet) => facet.name).slice(0, 8),
  }));
  const platforms = [...new Set(detail.games.map((game) => game.platformSlug))].slice(0, 12);
  const years = detail.games.map((game) => game.year).filter((year): year is number => typeof year === "number");
  const [wikipediaReference, webResults] = await Promise.all([
    searchWikipediaSeries(detail.series.name).catch(() => null),
    searchSeriesWebWithSerpApi(detail.series.name).catch(() => []),
  ]);

  const system =
    "Eres redactor editorial para Region Atlas, un catálogo de videojuegos. " +
    "Responde solo JSON válido. Escribe en español, con tono informativo y natural. " +
    "Genera una descripción de saga/franquicia para una página pública. " +
    "Prioriza la historia real de la saga según referencias externas: origen, evolución, cambios de nombre, estudios/editores relevantes, hitos y legado. " +
    "Usa los datos de Region Atlas solo como apoyo contextual para mencionar plataformas, periodo o enfoque del catálogo si aporta valor, nunca como fuente principal. " +
    "Si hay conflicto entre una referencia externa fiable y el catálogo interno, usa la referencia externa para la historia general. " +
    "No inventes datos; si una referencia no lo sustenta, omítelo. " +
    "No hables de precios actuales ni disponibilidad. Evita frases vacías como 'imprescindible' o 'experiencia única'. " +
    "No escribas una descripción del índice de Region Atlas; escribe una descripción editorial de la franquicia real. " +
    'Formato: {"description":"texto"}';
  const user =
    `Saga: ${detail.series.name}\n` +
    `Referencia Wikipedia:\n${JSON.stringify(wikipediaReference, null, 2)}\n\n` +
    `Resultados web de apoyo:\n${JSON.stringify(webResults, null, 2)}\n\n` +
    `Contexto interno de Region Atlas, secundario:\n` +
    `Juegos: ${detail.series.gameCount}\n` +
    `Plataformas: ${platforms.join(", ") || "sin datos"}\n` +
    `Rango años: ${years.length ? `${Math.min(...years)}-${Math.max(...years)}` : "sin datos"}\n` +
    `Descripción actual:\n${currentDescription?.trim() || "(vacía)"}\n\n` +
    `Juegos de la saga:\n${JSON.stringify(games, null, 2)}`;

  const parsed = await openAiJson(system, user);
  const description = typeof parsed.description === "string" ? clip(parsed.description, 1300) : "";
  if (description.length < 80) {
    return { error: "La IA no devolvió una descripción suficientemente útil." };
  }
  return { ok: true, description };
}
