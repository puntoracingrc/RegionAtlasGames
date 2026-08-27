export type EbayItemLocationRegion = "EUROPEAN_UNION" | "CONTINENTAL_EUROPE";

export type EbayRegionalSearchPolicy = {
  marketplaceId: "EBAY_ES";
  destinationCountry: "ES";
  destinationPostalCode: string;
  itemLocationCountry: string | null;
  itemLocationRegion: EbayItemLocationRegion | null;
  originLabel: string;
  importCostsMayApply: boolean;
  regionRestricted: boolean;
};

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

const COUNTRY_MARKERS: Array<[string, string]> = [
  ["espana", "ES"],
  ["spain", "ES"],
  ["italia", "IT"],
  ["italy", "IT"],
  ["francia", "FR"],
  ["france", "FR"],
  ["reino unido", "GB"],
  ["uk", "GB"],
  ["eng", "GB"],
  ["alemania", "DE"],
  ["germany", "DE"],
];

function normalizeRegion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function postalCode(value = process.env.EBAY_CONTEXTUAL_ZIP): string {
  const clean = value?.trim().replace(/[^0-9A-Za-z -]/g, "");
  return clean || "28001";
}

function isMultiRegion(region: string): boolean {
  if (["multi region", "multiregion", "multi pal", "pal europa", "pal europe"].some((marker) => region.includes(marker))) {
    return true;
  }
  return new Set(COUNTRY_MARKERS.filter(([marker]) => region.includes(marker)).map(([, country]) => country)).size >= 2;
}

export function ebayContextualLocation(policy: EbayRegionalSearchPolicy): string {
  return `country=${policy.destinationCountry},zip=${policy.destinationPostalCode}`;
}

export function ebayRegionalSearchPolicy(
  catalogRegion: string,
  destinationPostalCode?: string,
): EbayRegionalSearchPolicy {
  const region = normalizeRegion(catalogRegion);
  const base = {
    marketplaceId: "EBAY_ES" as const,
    destinationCountry: "ES" as const,
    destinationPostalCode: postalCode(destinationPostalCode),
  };

  if (isMultiRegion(region) || region === "europa" || region === "europe") {
    return {
      ...base,
      itemLocationCountry: null,
      itemLocationRegion: "CONTINENTAL_EUROPE",
      originLabel: "Europa multirregion",
      importCostsMayApply: true,
      regionRestricted: true,
    };
  }

  if (region.includes("espana")) {
    return {
      ...base,
      itemLocationCountry: "ES",
      itemLocationRegion: null,
      originLabel: "Espana",
      importCostsMayApply: false,
      regionRestricted: true,
    };
  }
  if (region.includes("uk") || region.includes("eng") || region.includes("reino unido")) {
    return {
      ...base,
      itemLocationCountry: "GB",
      itemLocationRegion: null,
      originLabel: "Reino Unido",
      importCostsMayApply: true,
      regionRestricted: true,
    };
  }
  if (region.includes("usa") || region.includes("ntsc u") || region.includes("estados unidos")) {
    return {
      ...base,
      itemLocationCountry: "US",
      itemLocationRegion: null,
      originLabel: "Estados Unidos",
      importCostsMayApply: true,
      regionRestricted: true,
    };
  }
  if (region.includes("japon") || region.includes("japan") || region.includes("ntsc j")) {
    return {
      ...base,
      itemLocationCountry: "JP",
      itemLocationRegion: null,
      originLabel: "Japon",
      importCostsMayApply: true,
      regionRestricted: true,
    };
  }
  if (region.includes("alemania") || region.includes("germany") || region.includes("usk")) {
    return {
      ...base,
      itemLocationCountry: "DE",
      itemLocationRegion: null,
      originLabel: "Alemania",
      importCostsMayApply: false,
      regionRestricted: true,
    };
  }
  if (region.includes("francia") || region.includes("france")) {
    return {
      ...base,
      itemLocationCountry: "FR",
      itemLocationRegion: null,
      originLabel: "Francia",
      importCostsMayApply: false,
      regionRestricted: true,
    };
  }
  if (region.includes("italia") || region.includes("italy")) {
    return {
      ...base,
      itemLocationCountry: "IT",
      itemLocationRegion: null,
      originLabel: "Italia",
      importCostsMayApply: false,
      regionRestricted: true,
    };
  }
  if (region.includes("australia")) {
    return {
      ...base,
      itemLocationCountry: "AU",
      itemLocationRegion: null,
      originLabel: "Australia",
      importCostsMayApply: true,
      regionRestricted: true,
    };
  }
  if (region.includes("pal") || region.includes("europa") || region.includes("europe")) {
    return {
      ...base,
      itemLocationCountry: null,
      itemLocationRegion: "EUROPEAN_UNION",
      originLabel: "Union Europea",
      importCostsMayApply: false,
      regionRestricted: true,
    };
  }

  return {
    ...base,
    itemLocationCountry: null,
    itemLocationRegion: null,
    originLabel: catalogRegion.trim() || "Origen sin clasificar",
    importCostsMayApply: true,
    regionRestricted: false,
  };
}

export function ebayRegionalSearchFilters(policy: EbayRegionalSearchPolicy): string[] {
  const filters = [
    "buyingOptions:{FIXED_PRICE}",
    `deliveryCountry:${policy.destinationCountry}`,
    `deliveryPostalCode:${policy.destinationPostalCode}`,
  ];
  if (policy.itemLocationCountry) filters.push(`itemLocationCountry:${policy.itemLocationCountry}`);
  if (policy.itemLocationRegion) filters.push(`itemLocationRegion:${policy.itemLocationRegion}`);
  return filters;
}

export function ebayImportCostsMayApply(
  policy: EbayRegionalSearchPolicy,
  sellerCountry: string | null | undefined,
): boolean {
  const country = sellerCountry?.trim().toUpperCase();
  if (country) return !EU_COUNTRIES.has(country);
  return policy.importCostsMayApply;
}
