import { decodeHtmlEntities } from "./decode-html-entities";

const REGION_SUFFIX_RE = /\((SP|PS|ES|ESP|EU|UK|JP|FR|US|USA|DE|IT|PL|AS|JAP)\)\s*$/i;
const GAME_KEY_CARD_BEFORE_PLATFORM_RE = /\bKC\b(?=\s+(?:Nintendo\s+)?Switch\s*2\b)/i;
const GAME_KEY_CARD_AFTER_PLATFORM_RE = /(\b(?:Nintendo\s+)?Switch\s*2\b)\s+KC\b/i;

const PLATFORM_LABELS: Record<string, string[]> = {
  ps1: ["playstation 1", "ps1"],
  ps2: ["playstation 2", "ps2"],
  ps3: ["playstation 3", "ps3"],
  ps4: ["playstation 4", "ps4"],
  ps5: ["playstation 5", "ps5"],
  switch: ["nintendo switch", "switch"],
  switch2: ["nintendo switch 2", "switch 2"],
};

const REGION_BY_SUFFIX: Record<string, string> = {
  SP: "PAL España",
  PS: "PAL España",
  ES: "PAL España",
  ESP: "PAL España",
  EU: "PAL Europa",
  UK: "PAL UK/ENG",
  JP: "Japón",
  JAP: "Japón",
  US: "USA",
  USA: "USA",
  FR: "PAL Francia",
  DE: "PAL Alemania",
  IT: "PAL Italia",
  PL: "PAL Portugal",
  AS: "Asia",
};

export type TodoConsolasListingMetadata = {
  displayTitle: string;
  sourceRegionCode: string | null;
  sourceRegionLabel: string | null;
  detectedRegion: string | null;
  gameKeyCard: boolean;
  fullySpanishVersion: boolean;
};

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function todoConsolasListingMetadata(
  value: string,
  platformSlug: string,
): TodoConsolasListingMetadata {
  const rawTitle = decodeHtmlEntities(String(value || ""));
  const suffix = rawTitle.trim().match(REGION_SUFFIX_RE)?.[1]?.toUpperCase() ?? null;
  const isSwitch2 = platformSlug.toLowerCase() === "switch2";
  const gameKeyCard = isSwitch2 && (
    GAME_KEY_CARD_BEFORE_PLATFORM_RE.test(rawTitle)
    || GAME_KEY_CARD_AFTER_PLATFORM_RE.test(rawTitle)
  );
  let displayTitle = rawTitle.replace(REGION_SUFFIX_RE, "");
  if (gameKeyCard) {
    displayTitle = displayTitle
      .replace(GAME_KEY_CARD_BEFORE_PLATFORM_RE, "")
      .replace(GAME_KEY_CARD_AFTER_PLATFORM_RE, "$1");
  }
  for (const label of PLATFORM_LABELS[platformSlug.toLowerCase()] ?? [platformSlug]) {
    displayTitle = displayTitle.replace(new RegExp(`\\b${escapedRegExp(label)}\\b`, "gi"), " ");
  }
  displayTitle = displayTitle.replace(/\s+/g, " ").replace(/^[\s\-_/]+|[\s\-_/]+$/g, "");

  return {
    displayTitle: displayTitle || rawTitle.trim(),
    sourceRegionCode: suffix,
    sourceRegionLabel: suffix ? REGION_BY_SUFFIX[suffix] ?? null : null,
    detectedRegion: suffix ? REGION_BY_SUFFIX[suffix] ?? null : null,
    gameKeyCard,
    fullySpanishVersion: suffix === "SP" || suffix === "PS" || suffix === "ES" || suffix === "ESP",
  };
}
