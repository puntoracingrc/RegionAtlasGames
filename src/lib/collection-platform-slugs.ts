/** Slugs generados antes de ampliar aliases PriceCharting (importaciones antiguas). */
const LEGACY_PLATFORM_SLUGS: Record<string, string> = {
  "pal-playstation-5": "ps5",
  "jp-playstation-5": "ps5",
  "sony-playstation-5": "ps5",
  "jp-playstation-4": "ps4",
  "jp-playstation-3": "ps3",
  "jp-playstation-2": "ps2",
  "jp-playstation": "ps1",
  "pal-xbox-360": "xbox360",
  "pal-nintendo-switch": "switch",
  "nintendo-switch": "switch",
  "pal-gameboy-color": "gameboycolor",
  "game-boy-color": "gameboycolor",
  "gameboy-color": "gameboycolor",
  "pal-ps-vita": "psvita",
  "ps-vita": "psvita",
  "pal-wii-u": "wiiu",
  "wii-u": "wiiu",
  "xbox-one": "xboxone",
  "xbox-series-x": "xboxseriesx",
  "xbox-series-s": "xboxseriesx",
  "switch-2": "switch2",
  "playstation-portable": "psp",
  "playstation-vita": "psvita",
  "pc-engine": "pcengine",
  "turbografx-16": "pcengine",
};

export function normalizeImportedPlatformSlug(slug: string): string {
  return LEGACY_PLATFORM_SLUGS[slug] ?? slug;
}
