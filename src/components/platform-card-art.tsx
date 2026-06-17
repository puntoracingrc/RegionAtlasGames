import type { Platform } from "@/lib/types";
import { cn } from "@/lib/cn";

export const PLATFORM_IMAGE_SLUGS = new Set([
  "nes",
  "snes",
  "n64",
  "gameboy",
  "gamecube",
  "wii",
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
  "neogeocd",
  "neogeopocket",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
]);

const PLATFORM_ART_CLASS: Partial<Record<string, string>> = {
  ds: "bottom-4 right-6 h-[92px] w-[138px] sm:h-[98px] sm:w-[148px]",
  "3ds": "bottom-4 right-6 h-[92px] w-[138px] sm:h-[98px] sm:w-[148px]",
  gamecube: "bottom-5 right-5 h-[88px] w-[132px] sm:h-[96px] sm:w-[142px]",
  megacd: "bottom-3 right-5 h-[84px] w-[136px] sm:h-[92px] sm:w-[148px]",
};

export function PlatformCardArt({ platform }: { platform: Platform }) {
  if (!PLATFORM_IMAGE_SLUGS.has(platform.slug)) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 right-4 z-0 flex h-[86px] w-[132px] items-end justify-end opacity-95 transition duration-200 group-hover:-translate-y-1 group-hover:opacity-100 sm:h-[94px] sm:w-[148px]",
        PLATFORM_ART_CLASS[platform.slug],
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/platform-consoles/${platform.slug}.png`}
        alt=""
        width={320}
        height={240}
        className="max-h-full max-w-full object-contain object-bottom-right"
        loading="lazy"
        decoding="async"
        aria-hidden
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
        src={`/platform-consoles/${platform.slug}.png`}
        alt=""
        width={420}
        height={300}
        className="max-h-full max-w-full object-contain object-bottom-right"
        loading="eager"
        decoding="async"
        aria-hidden
      />
    </div>
  );
}
