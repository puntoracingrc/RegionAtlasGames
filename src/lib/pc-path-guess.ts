import { slugify } from "./slug";

const PAL_PC_CONSOLE: Record<string, string> = {
  nes: "pal-nes",
  snes: "pal-super-nintendo",
  n64: "pal-nintendo-64",
  gameboy: "pal-gameboy",
  gamecube: "pal-gamecube",
  wii: "pal-wii",
  ds: "pal-nintendo-ds",
  "3ds": "pal-nintendo-3ds",
  megadrive: "pal-sega-mega-drive",
  sega32x: "pal-mega-drive-32x",
  megacd: "pal-sega-mega-cd",
  mastersystem: "pal-sega-master-system",
  saturn: "pal-sega-saturn",
  dreamcast: "pal-sega-dreamcast",
  gamegear: "pal-sega-game-gear",
  neogeo: "neo-geo-aes",
  neogeocd: "neo-geo-cd",
  neogeopocket: "neo-geo-pocket-color",
  ps1: "pal-playstation",
  ps2: "pal-playstation-2",
  ps3: "pal-playstation-3",
  ps4: "pal-playstation-4",
  ps5: "pal-playstation-5",
  xbox360: "xbox-360",
  xboxone: "xbox-one",
  xboxseriesx: "xbox-series-x",
  switch: "pal-nintendo-switch",
  switch2: "switch-2",
  gameboycolor: "pal-gameboy-color",
  psp: "pal-psp",
  psvita: "pal-ps-vita",
  wiiu: "pal-wii-u",
  pcengine: "pc-engine",
};

const NTSC_PC_CONSOLE: Record<string, string> = {
  nes: "nes",
  snes: "super-nintendo",
  n64: "nintendo-64",
  gameboy: "gameboy",
  gamecube: "gamecube",
  wii: "wii",
  ds: "nintendo-ds",
  "3ds": "nintendo-3ds",
  megadrive: "sega-genesis",
  sega32x: "sega-32x",
  megacd: "sega-cd",
  mastersystem: "sega-master-system",
  saturn: "sega-saturn",
  dreamcast: "sega-dreamcast",
  gamegear: "sega-game-gear",
  neogeo: "neo-geo-aes",
  neogeocd: "neo-geo-cd",
  neogeopocket: "neo-geo-pocket-color",
  ps1: "playstation",
  ps2: "playstation-2",
  ps3: "playstation-3",
  ps4: "playstation-4",
  ps5: "playstation-5",
};

const JP_PC_CONSOLE: Record<string, string> = {
  nes: "jp-nes",
  snes: "jp-super-nintendo",
  n64: "jp-nintendo-64",
  gameboy: "jp-gameboy",
  gamecube: "jp-gamecube",
  wii: "jp-wii",
  ds: "jp-nintendo-ds",
  "3ds": "jp-nintendo-3ds",
  megadrive: "jp-sega-mega-drive",
  megacd: "jp-sega-mega-cd",
  saturn: "jp-sega-saturn",
  dreamcast: "jp-sega-dreamcast",
  gamegear: "jp-sega-game-gear",
  ps1: "jp-playstation",
  ps2: "jp-playstation-2",
  ps3: "jp-playstation-3",
  ps4: "jp-playstation-4",
  ps5: "jp-playstation-5",
};

function regionBucket(region: string): "pal" | "usa" | "japan" | "multi" {
  const r = region.trim().toLowerCase();
  if (r === "usa" || r === "ntsc") return "usa";
  if (r === "japón" || r === "japan" || r === "japon") return "japan";
  if (r.includes("multi")) return "multi";
  return "pal";
}

function resolvePcConsole(platformSlug: string, bucket: ReturnType<typeof regionBucket>): string | null {
  if (bucket === "usa") {
    return NTSC_PC_CONSOLE[platformSlug] ?? PAL_PC_CONSOLE[platformSlug] ?? null;
  }
  if (bucket === "japan") {
    return JP_PC_CONSOLE[platformSlug] ?? NTSC_PC_CONSOLE[platformSlug] ?? PAL_PC_CONSOLE[platformSlug] ?? null;
  }
  return PAL_PC_CONSOLE[platformSlug] ?? NTSC_PC_CONSOLE[platformSlug] ?? null;
}

function pcRegionLabel(bucket: ReturnType<typeof regionBucket>): string {
  if (bucket === "usa") return "NTSC USA (referencia)";
  if (bucket === "japan") return "Japón (referencia)";
  if (bucket === "multi") return "Referencia global (multiregión)";
  return "PAL EU (referencia)";
}

export function guessPcPath(input: {
  platformSlug: string;
  region: string;
  title: string;
  titlePc?: string | null;
}): { pcPath: string | null; pcRegion: string; slug: string } {
  const bucket = regionBucket(input.region);
  const consolePath = resolvePcConsole(input.platformSlug, bucket);
  const slug = slugify(input.titlePc ?? input.title);
  if (!consolePath || !slug) {
    return { pcPath: null, pcRegion: pcRegionLabel(bucket), slug };
  }
  return {
    pcPath: `/game/${consolePath}/${slug}`,
    pcRegion: pcRegionLabel(bucket),
    slug,
  };
}

export function catalogIdFromStaging(input: {
  platformSlug: string;
  slug: string;
  region?: string;
}): string {
  const bucket = input.region ? regionBucket(input.region) : "pal";
  if (bucket === "usa") return `${input.platformSlug}-usa-${input.slug}`;
  if (bucket === "japan") return `${input.platformSlug}-japon-${input.slug}`;
  return `${input.platformSlug}-${input.slug}`;
}
