export type PhysicalVariant = {
  slug: string;
  label: string;
  shortLabel: string;
  marketRegion: "pal" | "usa" | "japan" | "australia" | "global" | "collector";
  ratingMarks: string[];
  skuHints: string[];
  description: string;
};

export const PHYSICAL_VARIANTS = [
  {
    slug: "pal-es",
    label: "PAL España",
    shortLabel: "ES",
    marketRegion: "pal",
    ratingMarks: ["PEGI"],
    skuHints: ["PPSA"],
    description: "Portada y contraportada localizadas al castellano.",
  },
  {
    slug: "multi-pal",
    label: "Multi-PAL / PAL EUR",
    shortLabel: "Multi-PAL",
    marketRegion: "pal",
    ratingMarks: ["PEGI"],
    skuHints: ["PPSA"],
    description: "Portada europea multilingüe con bloques ES, IT, PT, FR u otros idiomas.",
  },
  {
    slug: "pal-uk-ie",
    label: "PAL UK / Irlanda",
    shortLabel: "UK/IE",
    marketRegion: "pal",
    ratingMarks: ["PEGI", "VSC", "IFCO"],
    skuHints: ["PPSA"],
    description: "Textos en inglés con logos PEGI y sellos británicos/irlandeses.",
  },
  {
    slug: "pal-de-usk",
    label: "PAL Alemania / USK",
    shortLabel: "USK",
    marketRegion: "pal",
    ratingMarks: ["USK"],
    skuHints: ["PPSA"],
    description: "Edición alemana con sello USK grande en portada.",
  },
  {
    slug: "global-pegi-acb",
    label: "Multirregión global PEGI + ACB",
    shortLabel: "PEGI+ACB",
    marketRegion: "global",
    ratingMarks: ["PEGI", "ACB"],
    skuHints: ["PPSA", "LA"],
    description: "Portada internacional con doble clasificación europea y australiana.",
  },
  {
    slug: "ntsc-esrb",
    label: "Importación americana / ESRB",
    shortLabel: "ESRB",
    marketRegion: "usa",
    ratingMarks: ["ESRB"],
    skuHints: ["ELUS", "LA-H"],
    description: "Edición USA/Canadá con clasificación ESRB y textos en inglés/francés canadiense.",
  },
  {
    slug: "jp-cero",
    label: "Japonesa / CERO",
    shortLabel: "CERO",
    marketRegion: "japan",
    ratingMarks: ["CERO"],
    skuHints: ["ELJM", "PLJM"],
    description: "Edición japonesa con lomo y contraportada en japonés.",
  },
  {
    slug: "au-acb",
    label: "Australiana / ACB",
    shortLabel: "ACB",
    marketRegion: "australia",
    ratingMarks: ["ACB"],
    skuHints: ["PPSA"],
    description: "Edición australiana con franja de clasificación ACB.",
  },
  {
    slug: "reversible-artwork",
    label: "Portada reversible / artwork limpio",
    shortLabel: "Reversible",
    marketRegion: "collector",
    ratingMarks: [],
    skuHints: [],
    description: "Cara interior artística sin logos, códigos de barras ni textos legales.",
  },
] as const satisfies readonly PhysicalVariant[];

export type PhysicalVariantSlug = (typeof PHYSICAL_VARIANTS)[number]["slug"];

export function getPhysicalVariant(slug: string | null | undefined): PhysicalVariant | null {
  if (!slug) return null;
  return PHYSICAL_VARIANTS.find((variant) => variant.slug === slug) ?? null;
}

export function normalizePhysicalVariantSlug(slug: string | null | undefined): string | null {
  const trimmed = slug?.trim();
  if (!trimmed) return null;
  return getPhysicalVariant(trimmed)?.slug ?? trimmed;
}

export function physicalVariantSearchHints(slug: string | null | undefined): string[] {
  switch (normalizePhysicalVariantSlug(slug)) {
    case "pal-es":
      return ["PAL España", "ESP", "castellano", "contraportada española", "portada española"];
    case "multi-pal":
      return ["Multi-PAL", "PAL EUR", "multi idioma", "multilenguaje", "ES IT PT FR"];
    case "pal-uk-ie":
      return ["PAL UK", "UK", "VSC", "IFCO", "Irish", "Reino Unido"];
    case "pal-de-usk":
      return ["USK", "Alemania", "german", "deutsch"];
    case "global-pegi-acb":
      return ["PEGI ACB", "ACB", "Australia", "global"];
    case "ntsc-esrb":
      return ["ESRB", "NTSC", "USA", "US", "Canada", "ELUS"];
    case "jp-cero":
      return ["CERO", "Japón", "Japan", "japonés", "ELJM", "PLJM"];
    case "au-acb":
      return ["ACB", "Australia", "Australian"];
    case "reversible-artwork":
      return ["portada reversible", "reversible cover", "artwork limpio", "sin logos"];
    default:
      return [];
  }
}
