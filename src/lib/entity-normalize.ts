const LEGAL_SUFFIXES =
  /\b(inc\.?|ltd\.?|llc\.?|limited|corporation|corp\.?|co\.?|gmbh|s\.?a\.?s\.?|plc|europe|international|japan|america)\b/gi;

const JOINT_NAME_RE = /(?:,|\s\/\s|\s&\s|\sand\s|\s\+\s|\s\|\s|\+)/i;

export function decodeEntityText(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Clave normalizada para agrupar variantes del mismo nombre corporativo. */
export function normalizeCompanyKey(name: string): string {
  let text = decodeEntityText(name).toLowerCase();
  text = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return text.replace(/\s+/g, " ");
}

/** Nombre con varias compañías (co-desarrollo / co-edición). No auto-fusionar. */
export function isJointCompanyName(name: string): boolean {
  const clean = decodeEntityText(name);
  if (!clean) return false;
  if (JOINT_NAME_RE.test(clean)) return true;
  if (clean.includes("&")) return true;
  return false;
}

export function slugsSharePrefixCluster(slugs: Iterable<string>): boolean {
  const items = [...new Set([...slugs].filter(Boolean))].sort((a, b) => a.length - b.length);
  if (items.length <= 1) return true;
  const root = items[0];
  return items.every((slug) => slug === root || slug.startsWith(`${root}-`));
}

export function pickDisplayName(names: Iterable<string>): string {
  const unique = [...new Set([...names].map(decodeEntityText).filter(Boolean))];
  if (unique.length === 0) return "";

  unique.sort((a, b) => {
    const score = (value: string) => {
      const upper = [...value].filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
      const upperRatio = upper / Math.max(value.length, 1);
      return (value === value.toUpperCase() ? 2 : 0) + (upperRatio > 0.8 ? 1 : 0);
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return b.length - a.length;
  });

  return unique[0];
}
