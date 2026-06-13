/** Slugs generados antes de ampliar aliases PriceCharting */
const LEGACY_PLATFORM_SLUGS: Record<string, string> = {
  "pal-playstation-5": "ps5",
  "jp-playstation-4": "ps4",
  "pal-xbox-360": "xbox360",
};

export function normalizeImportedPlatformSlug(slug: string): string {
  return LEGACY_PLATFORM_SLUGS[slug] ?? slug;
}
