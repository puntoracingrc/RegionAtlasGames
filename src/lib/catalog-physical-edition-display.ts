import {
  catalogMarketRegionToLegacyRegion,
  catalogPhysicalEditionTypeLabel,
  type CatalogPhysicalEdition,
} from "@/lib/catalog-edition-guide-types";
import { getRegionDisplay } from "@/lib/region-display";

type PhysicalEditionHeadingSource = Pick<
  CatalogPhysicalEdition,
  "editionType" | "label" | "marketRegions" | "packagingLanguages" | "ratingSystems"
>;

function normalizeHeadingPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function marketAliases(marketRegions: string[]): Set<string> {
  const aliases = new Set<string>();
  for (const marketRegion of marketRegions) {
    const legacyRegion = catalogMarketRegionToLegacyRegion(marketRegion);
    const display = getRegionDisplay(legacyRegion);
    const values = [
      marketRegion,
      legacyRegion,
      legacyRegion.replace(/^(PAL|NTSC(?:-J|-U\/C)?)\s+/i, ""),
      display.label,
      display.label.replace(/^(PAL|NTSC(?:-J|-U\/C)?)\s+/i, ""),
      display.shortLabel,
    ];
    for (const value of values) aliases.add(normalizeHeadingPart(value));
  }
  return aliases;
}

/**
 * Keeps the physical edition identity while moving structured market, language,
 * and rating data out of the legacy free-text label.
 */
export function catalogPhysicalEditionHeadingLabel(
  edition: PhysicalEditionHeadingSource,
): string {
  const languages = new Set(edition.packagingLanguages.map(normalizeHeadingPart));
  const ratings = new Set(edition.ratingSystems.map(normalizeHeadingPart));
  const markets = marketAliases(edition.marketRegions);
  const isStructuredToken = (value: string) => {
    const normalized = normalizeHeadingPart(value);
    return languages.has(normalized) || ratings.has(normalized) || markets.has(normalized);
  };
  const isStructuredPart = (part: string) => {
    if (isStructuredToken(part)) return true;
    const tokens = part.split("/").map((value) => value.trim()).filter(Boolean);
    return tokens.length > 1 && tokens.every(isStructuredToken);
  };
  const identityParts = edition.label
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isStructuredPart(part));

  return identityParts.join(" · ") || catalogPhysicalEditionTypeLabel(edition.editionType);
}
