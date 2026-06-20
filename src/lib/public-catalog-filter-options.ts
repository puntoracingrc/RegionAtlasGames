import { platforms } from "@/lib/catalog";
import { getCompanies } from "@/lib/indexes";
import type { CatalogCompanyFilterOption, CatalogPlatformFilterOption } from "@/lib/catalog-filters";

export function publicPlatformFilterOptions(): CatalogPlatformFilterOption[] {
  return platforms
    .filter((platform) => platform.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((platform) => ({ slug: platform.slug, name: platform.shortName || platform.name }));
}

export function publicCompanyFilterOptions(): CatalogCompanyFilterOption[] {
  return getCompanies().map((company) => ({ value: company.name, name: company.name }));
}
