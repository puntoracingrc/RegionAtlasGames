const QUERY_STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "un",
  "una",
  "unos",
  "unas",
  "para",
  "por",
  "con",
  "en",
  "tipo",
  "estilo",
  "similar",
  "similares",
  "parecido",
  "parecidos",
  "buscar",
  "busco",
  "encuentra",
  "encontrar",
  "y",
  "o",
  "and",
  "or",
  "of",
  "the",
  "for",
  "with",
  "juego",
  "juegos",
  "video",
  "game",
  "games",
  "gaming",
  "videogame",
  "videogames",
  "videojuego",
  "videojuegos",
]);

export function normalizeCatalogSearchText(value: string | number | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCatalogSearchSlug(value: string | number | null | undefined): string {
  return normalizeCatalogSearchText(value).replace(/\s+/g, "-");
}

export function normalizeCatalogSearchParts(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => normalizeCatalogSearchText(part))
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
}

export function catalogSearchTokens(rawQuery: string): string[] {
  const normalized = normalizeCatalogSearchText(rawQuery);
  if (!normalized) return [];

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const meaningfulTokens = tokens.filter((token) => !QUERY_STOPWORDS.has(token));
  return meaningfulTokens.length > 0 ? meaningfulTokens : tokens;
}
