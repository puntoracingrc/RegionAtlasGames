import companyLogoAssetsData from "../../data/company-logo-assets.json";

export type CompanyLogoAsset = {
  logoUrl: string;
  logoType:
    | "REGIONATLAS_EXISTENTE"
    | "WIKIMEDIA_DOCUMENTADO"
    | "SITIO_OFICIAL_DOCUMENTADO"
    | "PLACEHOLDER_GENERADO";
  authentic: boolean;
  provisional: boolean;
  requiresManualReview: boolean;
  compositeCredit: boolean;
};

export type ResolvedCompanyLogo = {
  url: string | null;
  provisional: boolean;
  metadata: CompanyLogoAsset | null;
};

const companyLogoAssets = companyLogoAssetsData as Record<string, CompanyLogoAsset>;

export function getCompanyLogoAsset(slug: string): CompanyLogoAsset | undefined {
  return companyLogoAssets[slug];
}

export function resolveCompanyLogo(
  slug: string,
  existingLogoUrl?: string | null,
): ResolvedCompanyLogo {
  const metadata = getCompanyLogoAsset(slug) ?? null;

  // An editorial/admin logo is always stronger evidence than a generated fallback.
  if (existingLogoUrl) {
    return { url: existingLogoUrl, provisional: false, metadata };
  }

  return {
    url: metadata?.logoUrl ?? null,
    provisional: metadata?.provisional ?? false,
    metadata,
  };
}
