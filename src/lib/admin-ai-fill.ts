import type { AdminAiFillEvent, AdminGameDraft } from "./admin-draft-types";
import { getPlatform } from "./catalog";
import { slugify } from "./slug";

const PLATFORM_WIKI_HINT: Record<string, string> = {
  nes: "NES",
  snes: "Super Nintendo",
  n64: "Nintendo 64",
  gameboy: "Game Boy",
  gamecube: "GameCube",
  wii: "Wii",
  ds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  megadrive: "Mega Drive",
  sega32x: "Sega 32X",
  megacd: "Mega CD",
  mastersystem: "Master System",
  saturn: "Sega Saturn",
  dreamcast: "Dreamcast",
  gamegear: "Game Gear",
  neogeo: "Neo Geo",
  neogeocd: "Neo Geo CD",
  neogeopocket: "Neo Geo Pocket",
  ps1: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
};

const USER_AGENT = "RegionAtlasGames/1.0 (admin ai fill)";

function descriptionModel(): string {
  return (
    process.env.GAME_DESCRIPTION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

function openAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function searchWikipedia(title: string, platformSlug: string, lang: string) {
  const hint = PLATFORM_WIKI_HINT[platformSlug] ?? platformSlug;
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${title} ${hint} videojuego`,
    srlimit: "3",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { search?: Array<{ title: string }> };
  };
  return data.query?.search?.[0]?.title ?? null;
}

async function fetchWikiExtract(title: string, lang: string) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exintro: "1",
    titles: title,
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { extract?: string }> };
  };
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.extract?.trim() || null;
}

async function openAiJson(system: string, user: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");

  const base = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: descriptionModel(),
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Respuesta vacía de OpenAI");
  return JSON.parse(raw) as Record<string, unknown>;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > max / 2 ? clipped.slice(0, lastSpace) : clipped).replace(/[.,;:]$/, "") + "…";
}

export async function* streamAdminAiFill(
  draft: AdminGameDraft,
): AsyncGenerator<AdminAiFillEvent> {
  const platform = getPlatform(draft.platformSlug);
  const platformName = platform?.name ?? draft.platformSlug;

  yield { type: "log", message: "Buscando referencia en Wikipedia (es)…" };

  let referenceText: string | null = null;
  let referenceUrl: string | null = null;

  for (const lang of ["es", "en"] as const) {
    const wikiTitle = await searchWikipedia(draft.title, draft.platformSlug, lang);
    if (!wikiTitle) continue;
    const extract = await fetchWikiExtract(wikiTitle, lang);
    if (extract && extract.length > 80) {
      referenceText = extract.slice(0, 1400);
      referenceUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`;
      yield {
        type: "log",
        message: `Referencia encontrada: ${wikiTitle} (${lang.toUpperCase()})`,
      };
      break;
    }
  }

  if (!referenceText) {
    yield { type: "log", message: "Sin artículo Wikipedia claro; la IA usará solo metadatos." };
  }

  const facts = {
    title: draft.title,
    platform: platformName,
    region: draft.region,
    reference: draft.reference,
    year: draft.year,
    developer: draft.developerName,
    publisher: draft.publisherName,
    genres: draft.genreNames,
  };

  if (!openAiConfigured()) {
    yield {
      type: "error",
      message: "OPENAI_API_KEY no configurada. No se puede rellenar con IA.",
    };
    return;
  }

  yield { type: "log", message: "Extrayendo metadatos con IA…" };

  const metadataSystem =
    "Eres asistente de catálogo de videojuegos. Responde JSON con hechos verificables. " +
    "No inventes referencias SKU/CUSA si no las conoces con certeza. " +
    'Campos: {"year":number|null,"developer":"...","publisher":"...","genres":["..."],"players":number|null,"support":"..."}';
  const metadataUser =
    `Juego: ${draft.title}\nPlataforma: ${platformName}\nRegión: ${draft.region}\n` +
    `Referencia producto conocida: ${draft.reference ?? "ninguna"}\n\n` +
    `Contexto Wikipedia:\n${referenceText ?? "(sin contexto)"}`;

  try {
    const meta = await openAiJson(metadataSystem, metadataUser);
    if (typeof meta.year === "number") {
      draft.year = meta.year;
      yield { type: "field", field: "year", value: meta.year };
    }
    if (typeof meta.developer === "string" && meta.developer.trim()) {
      draft.developerName = meta.developer.trim();
      draft.developerSlug = slugify(draft.developerName);
      yield { type: "field", field: "developerName", value: draft.developerName };
      yield { type: "field", field: "developerSlug", value: draft.developerSlug };
    }
    if (typeof meta.publisher === "string" && meta.publisher.trim()) {
      draft.publisherName = meta.publisher.trim();
      draft.publisherSlug = slugify(draft.publisherName);
      yield { type: "field", field: "publisherName", value: draft.publisherName };
      yield { type: "field", field: "publisherSlug", value: draft.publisherSlug };
    }
    if (Array.isArray(meta.genres)) {
      draft.genreNames = meta.genres
        .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
        .slice(0, 4);
      yield { type: "field", field: "genres", value: draft.genreNames };
    }
    if (typeof meta.players === "number") {
      draft.players = meta.players;
      yield { type: "field", field: "players", value: meta.players };
    }
    if (typeof meta.support === "string" && meta.support.trim()) {
      draft.support = meta.support.trim();
      yield { type: "field", field: "support", value: draft.support };
    }
  } catch (error) {
    yield {
      type: "log",
      message: `Metadatos parciales: ${error instanceof Error ? error.message : "error"}`,
    };
  }

  yield { type: "log", message: "Generando descripción y SEO…" };

  const descSystem =
    "Eres redactor SEO para Region Atlas (catálogo retro España). Textos ORIGINALES en español. " +
    "No copies Wikipedia. Solo hechos de la ficha. JSON: " +
    '{"description":"...","seoTitle":"...","seoDescription":"...","coverAlt":"...","jsonLdDescription":"...","faqs":[{"question":"...","answer":"..."}],"highlights":["..."]}';
  const descUser =
    `HECHOS:\n${JSON.stringify(
      {
        ...facts,
        year: draft.year,
        developer: draft.developerName,
        publisher: draft.publisherName,
        genres: draft.genreNames,
      },
      null,
      2,
    )}\n\nREFERENCIA:\n${referenceText ?? "(ninguna)"}`;

  try {
    const parsed = await openAiJson(descSystem, descUser);
    const description = String(parsed.description ?? "").replace(/\s+/g, " ").trim();
    if (description.length >= 40) {
      draft.description = description.slice(0, 900);
      yield { type: "field", field: "description", value: draft.description };
    }

    draft.seoMeta = {
      seoTitle: clip(String(parsed.seoTitle ?? draft.title), 70),
      seoDescription: clip(String(parsed.seoDescription ?? description), 155),
      coverAlt: clip(
        String(parsed.coverAlt ?? `Portada de ${draft.title} para ${platformName}`),
        120,
      ),
      jsonLdDescription: clip(String(parsed.jsonLdDescription ?? description), 320),
      faqs: Array.isArray(parsed.faqs)
        ? (parsed.faqs as Array<{ question?: string; answer?: string }>)
            .filter((f) => f.question && f.answer)
            .slice(0, 4)
            .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
        : [],
      highlights: Array.isArray(parsed.highlights)
        ? (parsed.highlights as unknown[]).map(String).slice(0, 4)
        : [],
      generatedAt: new Date().toISOString(),
      method: "ai",
      model: descriptionModel(),
    };
    yield { type: "field", field: "seoMeta", value: draft.seoMeta };

    draft.descriptionMeta = {
      generatedAt: new Date().toISOString(),
      method: "ai",
      model: descriptionModel(),
      referenceUsed: Boolean(referenceText),
      referenceUrl,
    };
    yield { type: "field", field: "descriptionMeta", value: draft.descriptionMeta };

    draft.updatedAt = new Date().toISOString();
    yield { type: "done", draft };
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "Error al generar descripción",
    };
  }
}

export function sseEncode(event: AdminAiFillEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
