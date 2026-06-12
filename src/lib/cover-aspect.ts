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
  "box-landscape": "aspect-[4/3]",
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

/** Ancho de portada en ficha — ocupa la columna lateral en desktop. */
export function coverDetailSizeClass(platformSlug?: string | null): string {
  switch (coverAspectKind(platformSlug)) {
    case "box-landscape":
      return "mx-auto w-full max-w-[320px] rounded-xl sm:max-w-[360px] lg:max-w-none";
    case "square":
      return "mx-auto w-full max-w-[280px] rounded-xl sm:max-w-[320px] lg:max-w-none";
    case "handheld-tall":
      return "mx-auto w-full max-w-[240px] rounded-xl sm:max-w-[280px] lg:max-w-none";
    default:
      return "mx-auto w-full max-w-[240px] rounded-xl sm:max-w-[280px] lg:max-w-none";
  }
}

/** Rejilla densa para catálogo/colección — portadas más pequeñas. */
export const CATALOG_GRID_CLASS =
  "grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8";

/** Rejilla fotos de anuncio Pro. */
export const LISTING_PHOTOS_GRID_CLASS =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
