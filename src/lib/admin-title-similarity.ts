import { catalogGamePath } from "./catalog-url";
import { listedCatalog } from "./catalog";
import { slugify } from "./slug";
import type { CatalogGame } from "./types";

const SIMILARITY_THRESHOLD = 0.78;

const EDITION_SUFFIXES =
  /\b(pal|usa|ntsc|jp|japan|japon|uk|eu|europa|espana|españa|eng|english|limited|edition|edición|standard|goty|complete|collection|remastered|definitive|director.?s cut)\b/gi;

export type SimilarCatalogMatch = {
  catalogId: string;
  title: string;
  region: string;
  slug: string;
  similarity: number;
  catalogUrl: string;
};

function normalizeTitleForMatch(text: string): string {
  return slugify(text.replace(EDITION_SUFFIXES, " "))
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;

  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size && tb.size) {
    let inter = 0;
    for (const token of ta) {
      if (tb.has(token)) inter += 1;
    }
    const jaccard = inter / new Set([...ta, ...tb]).size;
    if (jaccard >= 0.75) return jaccard;
  }

  const compactA = a.replace(/\s/g, "");
  const compactB = b.replace(/\s/g, "");
  const dist = levenshtein(compactA, compactB);
  return 1 - dist / Math.max(compactA.length, compactB.length);
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitleForMatch(a);
  const nb = normalizeTitleForMatch(b);
  return stringSimilarity(na, nb);
}

function scoreGameMatch(
  input: { title: string; slug: string; region: string },
  game: CatalogGame,
): number {
  const titleScores = [
    titleSimilarity(input.title, game.title),
    game.titlePc ? titleSimilarity(input.title, game.titlePc) : 0,
  ];
  const slugScores = [
    stringSimilarity(input.slug, game.slug),
    stringSimilarity(slugify(input.title), game.slug),
  ];
  let score = Math.max(...titleScores, ...slugScores);
  if (game.region === input.region) score += 0.04;
  return Math.min(score, 1);
}

export function findSimilarCatalogGames(input: {
  title: string;
  platformSlug: string;
  region: string;
  slug?: string;
  excludeCatalogId?: string;
  limit?: number;
}): SimilarCatalogMatch[] {
  const slug = input.slug?.trim() || slugify(input.title);
  const candidates = listedCatalog.filter(
    (g) =>
      g.platformSlug === input.platformSlug &&
      g.id !== input.excludeCatalogId &&
      g.listingStatus !== "excluded",
  );

  const scored = candidates
    .map((game) => ({
      game,
      similarity: scoreGameMatch(
        { title: input.title.trim(), slug, region: input.region },
        game,
      ),
    }))
    .filter((entry) => entry.similarity >= SIMILARITY_THRESHOLD)
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.game.title.localeCompare(b.game.title, "es"),
    )
    .slice(0, input.limit ?? 5);

  return scored.map(({ game, similarity }) => ({
    catalogId: game.id,
    title: game.title,
    region: game.region,
    slug: game.slug,
    similarity: Math.round(similarity * 1000) / 1000,
    catalogUrl: catalogGamePath(game),
  }));
}
