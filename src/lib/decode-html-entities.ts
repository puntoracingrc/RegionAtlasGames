const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodifica entidades HTML frecuentes en títulos del catálogo (&amp;, &#39;, …). */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
      const key = body.toLowerCase();
      if (key.startsWith("#x")) {
        const code = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (key.startsWith("#")) {
        const code = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED[key] ?? match;
    })
    .replace(/\u00a0/g, " ");
}
