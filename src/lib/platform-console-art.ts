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

/** Siluetas de consola por slug — fondo negro del asset conservado tal cual. */
const PLATFORM_CONSOLE_ASSETS: Partial<Record<string, ConsoleAsset>> = {
  gameboy: {
    src: "/platform-consoles/gameboy.png",
    width: 682,
    height: 1024,
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
