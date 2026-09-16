import identifierPatternData from "../../../data/research-engine/knowledge/identifier-patterns.json";
import { incompatiblePlatformIdentifiers } from "./platform-identifiers";
import type { ResearchCatalogContext, ResearchClaimRecord, ResearchTargetField } from "./v2-types";

export type BarcodeValidation = {
  observed: string;
  digits: string;
  format: "EAN13" | "UPCA" | "UNKNOWN";
  valid: boolean;
  normalizedEan13: string | null;
  error: string | null;
};

function checksumValid(digits: string): boolean {
  const body = digits.slice(0, -1).split("").map(Number);
  const expected = Number(digits.at(-1));
  const sum = body.reduce((total, digit, index) => {
    const positionFromRight = body.length - index;
    return total + digit * (positionFromRight % 2 === 1 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === expected;
}

export function validateBarcode(value: string): BarcodeValidation {
  const digits = value.replace(/[\s-]+/g, "");
  const format = digits.length === 13 ? "EAN13" : digits.length === 12 ? "UPCA" : "UNKNOWN";
  if (!/^\d+$/.test(digits) || format === "UNKNOWN") {
    return { observed: value, digits, format, valid: false, normalizedEan13: null, error: "BARCODE_FORMAT" };
  }
  if (!checksumValid(digits)) {
    return { observed: value, digits, format, valid: false, normalizedEan13: null, error: "BARCODE_CHECKSUM" };
  }
  return {
    observed: value,
    digits,
    format,
    valid: true,
    normalizedEan13: format === "UPCA" ? `0${digits}` : digits,
    error: null,
  };
}

export function equivalentBarcodes(left: string, right: string): boolean {
  const a = validateBarcode(left);
  const b = validateBarcode(right);
  return a.valid && b.valid && a.normalizedEan13 === b.normalizedEan13;
}

type IdentifierPattern = {
  id: string;
  platforms: string[];
  type: string;
  pattern: string;
};

const patterns = identifierPatternData.patterns as IdentifierPattern[];

export function classifyIdentifier(value: string): Array<{ id: string; type: string; platforms: string[] }> {
  const candidate = value.trim().toUpperCase();
  return patterns.flatMap((pattern) => {
    try {
      return new RegExp(pattern.pattern, "i").test(candidate)
        ? [{ id: pattern.id, type: pattern.type, platforms: pattern.platforms }]
        : [];
    } catch {
      return [];
    }
  });
}

export function validateIdentifierForPlatform(platformSlug: string, value: string): string[] {
  const errors: string[] = [];
  if (incompatiblePlatformIdentifiers(platformSlug, [value]).length) errors.push("PLATFORM_IDENTIFIER_CONFLICT");
  const matches = classifyIdentifier(value);
  if (matches.length && !matches.some((match) => match.platforms.includes(platformSlug))) errors.push("PLATFORM_IDENTIFIER_PATTERN_MISMATCH");
  return errors;
}

export function validateClaimDeterministically(
  claim: Pick<ResearchClaimRecord, "field" | "value" | "component">,
  context: ResearchCatalogContext,
): string[] {
  const errors: string[] = [];
  const text = typeof claim.value === "string" ? claim.value.trim() : "";
  if (claim.field === "BARCODE") {
    if (!text || !validateBarcode(text).valid) errors.push("BARCODE_CHECKSUM");
  }
  if (["SERIAL", "PRODUCT_CODE", "MEDIA_ID"].includes(claim.field) && text) {
    errors.push(...validateIdentifierForPlatform(context.platformSlug, text));
  }
  if (claim.field === "MARKET_REGION" && /^\d{3,}/.test(text)) errors.push("BARCODE_PREFIX_NOT_MARKET");
  if (claim.field === "PACKAGING_LANGUAGES" && claim.component === "DISC") errors.push("PACKAGING_LANGUAGE_WRONG_COMPONENT");
  if (claim.field === "SOFTWARE_LANGUAGES" && ["BACK", "BOX_BACK", "BOX_FRONT", "MANUAL"].includes(claim.component ?? "")) {
    errors.push("SOFTWARE_LANGUAGE_FROM_PACKAGING_ONLY");
  }
  if (claim.field === "ROM_REVISION" && /(?:^|-)\d+$/.test(text) && /-[12]$/.test(text)) {
    errors.push("ROM_REVISION_FROM_LABEL_SUFFIX");
  }
  return [...new Set(errors)];
}

export function knownValuesForTarget(context: ResearchCatalogContext, field: ResearchTargetField): unknown[] {
  switch (field) {
    case "BARCODE": return [context.barcode, context.ean].filter(Boolean);
    case "BOX_CODE": return [context.boxCode].filter(Boolean);
    case "SERIAL": return uniqueUnknown([context.serial, ...context.canonicalSerials, ...context.sourceSerials, ...context.resolutionSerials]);
    case "PRODUCT_CODE": return uniqueUnknown([...context.productCodes, ...context.softwareFamilyCodes]);
    case "MARKET_REGION": return uniqueUnknown([context.marketRegion, ...context.marketRegions]);
    case "EVIDENCE_MARKET": return context.evidenceMarkets;
    case "DISTRIBUTION_MARKET": return context.distributionMarkets;
    case "PACKAGING_LANGUAGES": return context.packagingLanguages;
    case "SOFTWARE_LANGUAGES": return context.softwareLanguages;
    case "RATING": return context.ratingSystems;
    case "PHYSICAL_PRODUCT_TYPE": return [context.physicalProductType].filter(Boolean);
    case "RELEASE_STATUS": return [context.releaseStatus].filter(Boolean);
    case "BUNDLE_CONTENTS":
    case "COLLECTOR_CONTENTS": return context.physicalContents;
    case "CANONICAL_IDENTITY": return [context.canonicalGameId, context.workId].filter(Boolean);
    default: return [];
  }
}

function uniqueUnknown(values: unknown[]): unknown[] {
  return [...new Map(values.filter((value) => value !== null && value !== undefined && value !== "").map((value) => [JSON.stringify(value), value])).values()];
}
