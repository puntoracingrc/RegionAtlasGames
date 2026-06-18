export type PlatformNewsTopic = {
  topic: string;
  label: string;
  query: string;
};

const PLAYSTATION_SLUGS = new Set(["ps1", "ps2", "ps3", "ps4", "ps5", "psp", "psvita"]);
const NINTENDO_SLUGS = new Set([
  "nes",
  "snes",
  "n64",
  "gameboy",
  "gameboycolor",
  "gameboyadvance",
  "gamecube",
  "wii",
  "wiiu",
  "ds",
  "3ds",
  "switch",
  "switch2",
]);
const SNK_SLUGS = new Set(["neogeo", "neogeocd", "neogeopocket", "neogeopocketcolor"]);

export function platformNewsTopicForSlug(slug: string): PlatformNewsTopic | null {
  const normalized = slug.trim().toLowerCase();
  if (PLAYSTATION_SLUGS.has(normalized)) {
    return {
      topic: "playstation",
      label: "PlayStation",
      query: "videojuegos PlayStation PS5 PS4 España when:7d",
    };
  }
  if (NINTENDO_SLUGS.has(normalized)) {
    return {
      topic: "nintendo",
      label: "Nintendo",
      query: "videojuegos Nintendo Switch España when:7d",
    };
  }
  if (SNK_SLUGS.has(normalized)) {
    return {
      topic: "snk",
      label: "SNK / Neo Geo",
      query: "videojuegos Neo Geo SNK España when:30d",
    };
  }
  return null;
}

export function platformNewsTopics(): PlatformNewsTopic[] {
  return [
    { topic: "playstation", label: "PlayStation", query: "videojuegos PlayStation PS5 PS4 España when:7d" },
    { topic: "nintendo", label: "Nintendo", query: "videojuegos Nintendo Switch España when:7d" },
    { topic: "snk", label: "SNK / Neo Geo", query: "videojuegos Neo Geo SNK España when:30d" },
  ];
}
