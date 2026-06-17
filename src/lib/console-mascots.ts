export type ConsoleMascotId =
  | "atlas-buddy-nes"
  | "atlas-buddy-snes"
  | "atlas-buddy-n64"
  | "atlas-buddy-gameboy"
  | "atlas-buddy-gamecube"
  | "atlas-buddy-wii"
  | "atlas-buddy-ds"
  | "atlas-buddy-3ds"
  | "atlas-buddy-mastersystem"
  | "atlas-buddy-megadrive"
  | "atlas-buddy-sega32x"
  | "atlas-buddy-megacd"
  | "atlas-buddy-saturn"
  | "atlas-buddy-dreamcast"
  | "atlas-buddy-gamegear"
  | "atlas-buddy-neogeo"
  | "atlas-buddy-neogeocd"
  | "atlas-buddy-neogeopocket"
  | "atlas-buddy-ps1"
  | "atlas-buddy-ps2"
  | "atlas-buddy-ps3"
  | "atlas-buddy-ps4"
  | "atlas-buddy-ps5"
  | "atlas-buddy-switch"
  | "atlas-buddy-switch2"
  | "atlas-buddy-wiiu"
  | "atlas-buddy-xbox"
  | "atlas-buddy-xboxseriess"
  | "atlas-buddy-xboxseriesx";

export type ConsoleMascot = {
  id: ConsoleMascotId;
  platformSlug: string;
  label: string;
  src: string;
};

export const CONSOLE_MASCOTS: ConsoleMascot[] = [
  { id: "atlas-buddy-nes", platformSlug: "nes", label: "NES Buddy", src: "/mascots/consoles/nes.png" },
  { id: "atlas-buddy-snes", platformSlug: "snes", label: "Super Nintendo Buddy", src: "/mascots/consoles/snes.png" },
  { id: "atlas-buddy-n64", platformSlug: "n64", label: "Nintendo 64 Buddy", src: "/mascots/consoles/n64.png" },
  { id: "atlas-buddy-gameboy", platformSlug: "gameboy", label: "Game Boy Buddy", src: "/mascots/consoles/gameboy.png" },
  { id: "atlas-buddy-gamecube", platformSlug: "gamecube", label: "GameCube Buddy", src: "/mascots/consoles/gamecube.png" },
  { id: "atlas-buddy-wii", platformSlug: "wii", label: "Wii Buddy", src: "/mascots/consoles/wii.png" },
  { id: "atlas-buddy-ds", platformSlug: "ds", label: "Nintendo DS Buddy", src: "/mascots/consoles/ds.png" },
  { id: "atlas-buddy-3ds", platformSlug: "3ds", label: "Nintendo 3DS Buddy", src: "/mascots/consoles/3ds.png" },
  { id: "atlas-buddy-mastersystem", platformSlug: "mastersystem", label: "Master System Buddy", src: "/mascots/consoles/mastersystem.png" },
  { id: "atlas-buddy-megadrive", platformSlug: "megadrive", label: "Mega Drive Buddy", src: "/mascots/consoles/megadrive.png" },
  { id: "atlas-buddy-sega32x", platformSlug: "sega32x", label: "Sega 32X Buddy", src: "/mascots/consoles/sega32x.png" },
  { id: "atlas-buddy-megacd", platformSlug: "megacd", label: "Mega CD Buddy", src: "/mascots/consoles/megacd.png" },
  { id: "atlas-buddy-saturn", platformSlug: "saturn", label: "Saturn Buddy", src: "/mascots/consoles/saturn.png" },
  { id: "atlas-buddy-dreamcast", platformSlug: "dreamcast", label: "Dreamcast Buddy", src: "/mascots/consoles/dreamcast.png" },
  { id: "atlas-buddy-gamegear", platformSlug: "gamegear", label: "Game Gear Buddy", src: "/mascots/consoles/gamegear.png" },
  { id: "atlas-buddy-neogeo", platformSlug: "neogeo", label: "Neo Geo AES Buddy", src: "/mascots/consoles/neogeo.png" },
  { id: "atlas-buddy-neogeocd", platformSlug: "neogeocd", label: "Neo Geo CD Buddy", src: "/mascots/consoles/neogeocd.png" },
  { id: "atlas-buddy-neogeopocket", platformSlug: "neogeopocket", label: "Neo Geo Pocket Buddy", src: "/mascots/consoles/neogeopocket.png" },
  { id: "atlas-buddy-ps1", platformSlug: "ps1", label: "PlayStation Buddy", src: "/mascots/consoles/ps1.png" },
  { id: "atlas-buddy-ps2", platformSlug: "ps2", label: "PlayStation 2 Buddy", src: "/mascots/consoles/ps2.png" },
  { id: "atlas-buddy-ps3", platformSlug: "ps3", label: "PlayStation 3 Buddy", src: "/mascots/consoles/ps3.png" },
  { id: "atlas-buddy-ps4", platformSlug: "ps4", label: "PlayStation 4 Buddy", src: "/mascots/consoles/ps4.png" },
  { id: "atlas-buddy-ps5", platformSlug: "ps5", label: "PlayStation 5 Buddy", src: "/mascots/consoles/ps5.png" },
  { id: "atlas-buddy-switch", platformSlug: "switch", label: "Nintendo Switch Buddy", src: "/mascots/consoles/switch.png" },
  { id: "atlas-buddy-switch2", platformSlug: "switch2", label: "Nintendo Switch 2 Buddy", src: "/mascots/consoles/switch2.png" },
  { id: "atlas-buddy-wiiu", platformSlug: "wiiu", label: "Wii U Buddy", src: "/mascots/consoles/wiiu.png" },
  { id: "atlas-buddy-xbox", platformSlug: "xbox", label: "Xbox Buddy", src: "/mascots/consoles/xbox.png" },
  { id: "atlas-buddy-xboxseriess", platformSlug: "xboxseriess", label: "Xbox Series S Buddy", src: "/mascots/consoles/xboxseriess.png" },
  { id: "atlas-buddy-xboxseriesx", platformSlug: "xboxseriesx", label: "Xbox Series X Buddy", src: "/mascots/consoles/xboxseriesx.png" },
];

export const CONSOLE_MASCOT_BY_PLATFORM = Object.fromEntries(
  CONSOLE_MASCOTS.map((mascot) => [mascot.platformSlug, mascot]),
) as Record<string, ConsoleMascot | undefined>;

export function getConsoleMascot(platformSlug: string): ConsoleMascot | undefined {
  return CONSOLE_MASCOT_BY_PLATFORM[platformSlug];
}
