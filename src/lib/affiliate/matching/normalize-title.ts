const STOP_WORDS = new Set(["the", "a", "an", "of", "de", "la", "el", "los", "las", "and", "y"]);

export function normalizeAffiliateText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(text: string): string[] {
  return normalizeAffiliateText(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}
