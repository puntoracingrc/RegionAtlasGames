export const AMAZON_MARKETPLACE_OPTIONS = [
  { code: "ES", label: "España" },
  { code: "US", label: "Estados Unidos" },
  { code: "GB", label: "Reino Unido" },
  { code: "DE", label: "Alemania" },
  { code: "FR", label: "Francia" },
  { code: "IT", label: "Italia" },
  { code: "JP", label: "Japón" },
  { code: "CA", label: "Canadá" },
  { code: "AU", label: "Australia" },
  { code: "NL", label: "Países Bajos" },
  { code: "PL", label: "Polonia" },
  { code: "SE", label: "Suecia" },
  { code: "BE", label: "Bélgica" },
] as const;

export type AmazonMarketplaceCode = (typeof AMAZON_MARKETPLACE_OPTIONS)[number]["code"];

export type AmazonMarketplace = {
  code: AmazonMarketplaceCode;
  label: string;
  domain: string;
  associateTag: string;
};

const AMAZON_MARKETPLACES: Record<AmazonMarketplaceCode, AmazonMarketplace> = {
  ES: { code: "ES", label: "España", domain: "www.amazon.es", associateTag: "punto04-21" },
  US: { code: "US", label: "Estados Unidos", domain: "www.amazon.com", associateTag: "regionatlas-20" },
  GB: { code: "GB", label: "Reino Unido", domain: "www.amazon.co.uk", associateTag: "regionatlas-21" },
  DE: { code: "DE", label: "Alemania", domain: "www.amazon.de", associateTag: "regionatlas08-21" },
  FR: { code: "FR", label: "Francia", domain: "www.amazon.fr", associateTag: "regionatla073-21" },
  IT: { code: "IT", label: "Italia", domain: "www.amazon.it", associateTag: "regionatla091-21" },
  JP: { code: "JP", label: "Japón", domain: "www.amazon.co.jp", associateTag: "regionatlas-22" },
  CA: { code: "CA", label: "Canadá", domain: "www.amazon.ca", associateTag: "regionatlas0d-20" },
  AU: { code: "AU", label: "Australia", domain: "www.amazon.com.au", associateTag: "regionatlas0a-22" },
  NL: { code: "NL", label: "Países Bajos", domain: "www.amazon.nl", associateTag: "regionatlas01-21" },
  PL: { code: "PL", label: "Polonia", domain: "www.amazon.pl", associateTag: "regionatlas0d-21" },
  SE: { code: "SE", label: "Suecia", domain: "www.amazon.se", associateTag: "regionatlas03-21" },
  BE: { code: "BE", label: "Bélgica", domain: "www.amazon.com.be", associateTag: "regionatla0c3-21" },
};

const COUNTRY_ALIASES: Record<string, AmazonMarketplaceCode> = {
  UK: "GB",
  PT: "ES",
};

export function normalizeAmazonMarketplaceCode(value: string | null | undefined): AmazonMarketplaceCode | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  const code = COUNTRY_ALIASES[normalized] ?? normalized;
  return code in AMAZON_MARKETPLACES ? (code as AmazonMarketplaceCode) : null;
}

export function resolveAmazonMarketplace(value: string | null | undefined): AmazonMarketplace {
  const code = normalizeAmazonMarketplaceCode(value) ?? "ES";
  return AMAZON_MARKETPLACES[code];
}

export function amazonMarketplaceSummary(marketplace: AmazonMarketplace) {
  return {
    code: marketplace.code,
    label: marketplace.label,
    domain: marketplace.domain,
  };
}
