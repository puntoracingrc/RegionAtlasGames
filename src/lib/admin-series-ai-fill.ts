import { missingOpenAiMessage, openAiConfigured, openAiJson } from "./admin-ai-fill";
import { getAdminSeries } from "./admin-series-manager";

function clip(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
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

  const system =
    "Eres redactor editorial para Region Atlas, un catálogo de videojuegos. " +
    "Responde solo JSON válido. Escribe en español, con tono informativo y natural. " +
    "Genera una descripción de saga/franquicia para una página pública. " +
    "No inventes datos externos; usa solo el nombre, los juegos y metadatos aportados. " +
    "No hables de precios actuales ni disponibilidad. Evita frases vacías como 'imprescindible' o 'experiencia única'. " +
    'Formato: {"description":"texto"}';
  const user =
    `Saga: ${detail.series.name}\n` +
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
