/** Proporción del contenedor de portada según formato físico de cada plataforma. */
export type CoverAspectKind = "case" | "box-landscape" | "square" | "handheld-tall";

const PLATFORM_ASPECT: Record<string, CoverAspectKind> = {
  ps1: "case",
  ps2: "case",
  ps3: "case",
  ps4: "case",
  saturn: "case",
  dreamcast: "case",
  gamecube: "case",
  wii: "case",
  megacd: "case",
  neogeocd: "case",
  nes: "box-landscape",
  snes: "box-landscape",
  megadrive: "box-landscape",
  mastersystem: "box-landscape",
  sega32x: "box-landscape",
  neogeo: "box-landscape",
  n64: "square",
  gameboy: "square",
  gamegear: "square",
  neogeopocket: "square",
  ds: "handheld-tall",
  "3ds": "handheld-tall",
};

const ASPECT_CLASS: Record<CoverAspectKind, string> = {
  case: "aspect-[2/3]",
  /** Caja retro PAL/USA en catálogo: JPGs verticales (~3:4), no landscape. */
  "box-landscape": "aspect-[3/4]",
  square: "aspect-square",
  "handheld-tall": "aspect-[3/4]",
};

export function coverAspectKind(platformSlug?: string | null): CoverAspectKind {
  if (!platformSlug) return "case";
  return PLATFORM_ASPECT[platformSlug] ?? "case";
}

export function coverAspectClass(platformSlug?: string | null): string {
  return ASPECT_CLASS[coverAspectKind(platformSlug)];
}

/** Rejilla catálogo/colección: mismo hueco para todas las plataformas (mezcla género, búsqueda…). */
export const COVER_CARD_ASPECT_CLASS = "aspect-[3/4]";

export function coverCardAspectClass(): string {
  return COVER_CARD_ASPECT_CLASS;
}

/** Ancho de portada en ficha — la altura la marca la imagen (carátula completa). */
export function coverDetailSizeClass(_platformSlug?: string | null): string {
  return "mx-auto w-full max-w-[240px] sm:max-w-[280px] lg:max-w-[320px]";
}

/** Rejilla densa para catálogo/colección — portadas más pequeñas. */
export const CATALOG_GRID_CLASS =
  "grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8";

/** Rejilla fotos de anuncio Pro. */
export const LISTING_PHOTOS_GRID_CLASS =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
