import type { Platform } from "@/lib/types";
import { cn } from "@/lib/cn";

export const PLATFORM_IMAGE_SLUGS = new Set([
  "gameandwatch",
  "nes",
  "snes",
  "n64",
  "gameboy",
  "gba",
  "virtualboy",
  "gamecube",
  "wii",
  "wiiu",
  "ds",
  "3ds",
  "mastersystem",
  "megadrive",
  "sega32x",
  "megacd",
  "saturn",
  "dreamcast",
  "gamegear",
  "neogeo",
  "neogeo-aes-plus",
  "neogeocd",
  "neogeopocket",
  "hyper-neogeo-64",
  "xbox",
  "xbox360",
  "xboxone",
  "xboxseries",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
  "ps5",
  "psvita",
  "psp",
  "switch",
  "switch2",
]);

const PLATFORM_ART_CLASS: Partial<Record<string, string>> = {
  gameandwatch: "bottom-4 right-4 h-[78px] w-[148px] sm:h-[84px] sm:w-[158px]",
  ds: "bottom-4 right-6 h-[92px] w-[138px] sm:h-[98px] sm:w-[148px]",
  "3ds": "bottom-4 right-6 h-[92px] w-[138px] sm:h-[98px] sm:w-[148px]",
  gba: "bottom-4 right-4 h-[76px] w-[146px] sm:h-[82px] sm:w-[156px]",
  virtualboy: "bottom-2 right-5 h-[112px] w-[110px] sm:h-[120px] sm:w-[118px]",
  gamecube: "bottom-5 right-5 h-[88px] w-[132px] sm:h-[96px] sm:w-[142px]",
  wiiu: "bottom-3 right-4 h-[84px] w-[154px] sm:h-[92px] sm:w-[164px]",
  megacd: "bottom-3 right-5 h-[84px] w-[136px] sm:h-[92px] sm:w-[148px]",
  ps5: "bottom-2 right-4 h-[108px] w-[104px] sm:h-[116px] sm:w-[112px]",
  psvita: "bottom-4 right-4 h-[78px] w-[148px] sm:h-[84px] sm:w-[158px]",
  psp: "bottom-4 right-4 h-[76px] w-[148px] sm:h-[82px] sm:w-[158px]",
  switch: "bottom-3 right-4 h-[86px] w-[146px] sm:h-[90px] sm:w-[154px]",
  switch2: "bottom-3 right-4 h-[86px] w-[146px] sm:h-[90px] sm:w-[154px]",
  "neogeo-aes-plus": "bottom-2 right-3 h-[100px] w-[150px] sm:h-[108px] sm:w-[162px]",
  "hyper-neogeo-64": "bottom-3 right-5 h-[104px] w-[94px] sm:h-[112px] sm:w-[102px]",
  xbox: "bottom-4 right-4 h-[82px] w-[150px] sm:h-[90px] sm:w-[160px]",
  xbox360: "bottom-2 right-5 h-[112px] w-[92px] sm:h-[120px] sm:w-[100px]",
  xboxone: "bottom-4 right-4 h-[80px] w-[150px] sm:h-[88px] sm:w-[160px]",
  xboxseries: "bottom-3 right-4 h-[92px] w-[148px] sm:h-[100px] sm:w-[158px]",
};

const DEFAULT_PLATFORM_ART_CLASS =
  "bottom-3 right-4 h-[86px] w-[132px] sm:h-[94px] sm:w-[148px]";

const PLATFORM_IMAGE_CLASS: Partial<Record<string, string>> = {
  "hyper-neogeo-64": "h-full w-auto max-w-full rounded-md bg-white p-1 object-contain object-bottom-right",
  ps5: "h-full w-auto max-w-full object-contain object-bottom-right",
};

const DEFAULT_PLATFORM_IMAGE_CLASS =
  "max-h-full max-w-full object-contain object-bottom-right";

const PLATFORM_IMAGE_EXTENSION: Partial<Record<string, string>> = {
  gameandwatch: "webp",
  gba: "webp",
  snes: "webp",
  virtualboy: "webp",
  wiiu: "webp",
  "hyper-neogeo-64": "jpg",
  xbox: "webp",
  xbox360: "webp",
  xboxone: "webp",
  xboxseries: "webp",
  ps4: "webp",
  switch: "webp",
  switch2: "webp",
};

function platformImageSrc(slug: string) {
  return `/platform-consoles/${slug}.${PLATFORM_IMAGE_EXTENSION[slug] ?? "png"}`;
}

export function PlatformCardArt({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  if (!PLATFORM_IMAGE_SLUGS.has(platform.slug)) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-0 flex items-end justify-end opacity-95 transition duration-200 group-hover:-translate-y-1 group-hover:opacity-100",
        compact ? "right-4 top-4 h-20 w-24" : PLATFORM_ART_CLASS[platform.slug] ?? DEFAULT_PLATFORM_ART_CLASS,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={platformImageSrc(platform.slug)}
        alt={`Hardware representativo de ${platform.name}`}
        width={320}
        height={240}
        className={PLATFORM_IMAGE_CLASS[platform.slug] ?? DEFAULT_PLATFORM_IMAGE_CLASS}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

export function PlatformHeroArt({ platform }: { platform: Platform }) {
  if (!PLATFORM_IMAGE_SLUGS.has(platform.slug)) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 right-4 z-0 hidden h-[170px] w-[280px] items-end justify-end opacity-95 md:flex lg:h-[210px] lg:w-[340px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={platformImageSrc(platform.slug)}
        alt={`Hardware representativo de ${platform.name}`}
        width={420}
        height={300}
        className={PLATFORM_IMAGE_CLASS[platform.slug] ?? DEFAULT_PLATFORM_IMAGE_CLASS}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
