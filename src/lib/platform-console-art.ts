export type PlatformConsoleArt = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

type ConsoleAsset = {
  src: string;
  width: number;
  height: number;
};

/** Imágenes de consola por slug — local o hosting propio. */
const PLATFORM_CONSOLE_ASSETS: Partial<Record<string, ConsoleAsset>> = {
  nes: {
    src: "/platform-consoles/nes.png",
    width: 1024,
    height: 682,
  },
};

export function getPlatformConsoleArt(
  slug: string,
  platformName: string,
): PlatformConsoleArt | null {
  const asset = PLATFORM_CONSOLE_ASSETS[slug];
  if (!asset) {
    return null;
  }

  return { ...asset, alt: platformName };
}
