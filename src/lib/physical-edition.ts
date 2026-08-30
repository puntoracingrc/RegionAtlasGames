import { normalizeAffiliateText } from "./affiliate/matching/normalize-title";

export type PhysicalEditionMarker =
  | "collector"
  | "limited"
  | "deluxe"
  | "special"
  | "ultimate"
  | "gold"
  | "complete-edition"
  | "day-one"
  | "launch"
  | "signature"
  | "premium-box"
  | "steelbook";

const EDITION_PATTERNS: ReadonlyArray<[PhysicalEditionMarker, RegExp]> = [
  ["collector", /\b(?:(?:collector(?: s)?|collectors)\s+(?:(?:limited|deluxe|special)\s+)?(?:edition|edicion|ed)|(?:edicion\s+)?coleccionista)\b/],
  ["limited", /\b(?:limited\s+(?:edition|ed)|edicion\s+limitada)\b/],
  ["deluxe", /\b(?:deluxe\s+(?:edition|ed)|edicion\s+deluxe)\b/],
  ["special", /\b(?:special\s+(?:edition|ed)|edicion\s+especial)\b/],
  ["ultimate", /\b(?:ultimate\s+(?:edition|ed)|edicion\s+ultimate)\b/],
  ["gold", /\bgold\s+(?:edition|ed)\b/],
  ["complete-edition", /\bcomplete\s+(?:edition|ed)\b/],
  ["day-one", /\b(?:day\s+one|dia\s+uno)\s+(?:edition|ed)\b/],
  ["launch", /\blaunch\s+(?:edition|ed)\b/],
  ["signature", /\bsignature\s+(?:edition|ed)\b/],
  ["premium-box", /\bpremium\s+box\b/],
  ["steelbook", /\bsteelbook\b/],
];

const EDITION_FIELD_ALIASES: Record<string, PhysicalEditionMarker> = {
  collector: "collector",
  collectors: "collector",
  coleccionista: "collector",
  limited: "limited",
  deluxe: "deluxe",
  special: "special",
  ultimate: "ultimate",
  gold: "gold",
  complete: "complete-edition",
  "day one": "day-one",
  launch: "launch",
  signature: "signature",
  "premium box": "premium-box",
  steelbook: "steelbook",
};

export function physicalEditionMarkers(text: string, edition?: string | null): Set<PhysicalEditionMarker> {
  const normalizedText = normalizeAffiliateText(text);
  const normalizedEdition = normalizeAffiliateText(edition ?? "");
  const markers = new Set<PhysicalEditionMarker>();

  for (const [marker, pattern] of EDITION_PATTERNS) {
    if (pattern.test(normalizedText) || pattern.test(normalizedEdition)) markers.add(marker);
  }

  if (normalizedEdition && normalizedEdition !== "standard") {
    const alias = EDITION_FIELD_ALIASES[normalizedEdition];
    if (alias) markers.add(alias);
  }

  return markers;
}

function sameMarkers(left: Set<PhysicalEditionMarker>, right: Set<PhysicalEditionMarker>): boolean {
  return left.size === right.size && [...left].every((marker) => right.has(marker));
}

/** Standard and special physical editions never share price or affiliate evidence. */
export function physicalEditionsMatch(
  targetText: string,
  candidateText: string,
  targetEdition?: string | null,
): boolean {
  return sameMarkers(
    physicalEditionMarkers(targetText, targetEdition),
    physicalEditionMarkers(candidateText),
  );
}
