import type { RegionalPackagingVariant } from "./types";

const LANGUAGE_LABELS: Record<string, string> = {
  de: "alemán",
  en: "inglés",
  es: "español",
  fr: "francés",
  it: "italiano",
  ja: "japonés",
  ko: "coreano",
  nl: "neerlandés",
  pt: "portugués",
  zh: "chino",
};

function normalizeLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((language) => typeof language === "string" ? language.trim().toLowerCase() : "")
      .filter((language) => /^[a-z]{2,3}$/.test(language)),
  )];
}

export function normalizeRegionalPackaging(value: unknown): RegionalPackagingVariant[] {
  if (!Array.isArray(value)) return [];
  const variants: RegionalPackagingVariant[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const region = typeof candidate.region === "string" ? candidate.region.trim() : "";
    if (!region || seen.has(region.toLowerCase())) continue;
    const frontCoverLanguages = normalizeLanguages(candidate.frontCoverLanguages);
    const backCoverLanguages = normalizeLanguages(candidate.backCoverLanguages);
    if (frontCoverLanguages.length === 0 && backCoverLanguages.length === 0) continue;
    variants.push({ region, frontCoverLanguages, backCoverLanguages });
    seen.add(region.toLowerCase());
  }

  return variants;
}

function formatLanguageList(languages: string[]): string {
  const labels = languages.map((language) => LANGUAGE_LABELS[language] ?? language.toUpperCase());
  if (labels.length <= 1) return labels[0] ?? "idioma no confirmado";
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}`;
}

export function describeRegionalPackagingVariant(variant: RegionalPackagingVariant): string {
  const front = normalizeLanguages(variant.frontCoverLanguages);
  const back = normalizeLanguages(variant.backCoverLanguages);
  if (front.length > 0 && JSON.stringify(front) === JSON.stringify(back)) {
    return `Portada y contraportada en ${formatLanguageList(front)}.`;
  }

  const parts: string[] = [];
  if (front.length > 0) parts.push(`Portada en ${formatLanguageList(front)}`);
  if (back.length > 0) parts.push(`contraportada en ${formatLanguageList(back)}`);
  return `${parts.join("; ")}.`;
}

export function describeRegionalPackagingComparison(value: unknown): string | null {
  const variants = normalizeRegionalPackaging(value);
  if (variants.length === 0) return null;
  return variants
    .map((variant) => `${variant.region}: ${describeRegionalPackagingVariant(variant)}`)
    .join(" ");
}
