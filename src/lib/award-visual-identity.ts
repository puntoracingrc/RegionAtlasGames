import identities from "../../data/award-visual-identities.json";

export type AwardVisualIdentity = {
  logoPath: string | null;
  logoDarkPath: string | null;
  sourceUrl: string;
  usageStatus: "official_media_kit" | "official_download" | "permission_verified" | "public_domain_textlogo" | "permission_required" | "unavailable";
  credit: string | null;
  editionYear: number | null;
  editions?: Record<string, AwardVisualIdentity>;
};

export function awardIdentityForYear(identity: AwardVisualIdentity | undefined, year?: number): AwardVisualIdentity | undefined {
  return year === undefined ? identity : identity?.editions?.[String(year)] ?? identity;
}

export function approvedAwardLogo(identity: AwardVisualIdentity | undefined, year?: number): string | null {
  identity = awardIdentityForYear(identity, year);
  if (!identity || !["official_media_kit", "official_download", "permission_verified", "public_domain_textlogo"].includes(identity.usageStatus)) return null;
  if (year !== undefined && identity.editionYear !== null && identity.editionYear !== year) return null;
  return identity.logoPath?.startsWith("/award-logos/") ? identity.logoPath : null;
}

export function getAwardVisualIdentity(slug: string): AwardVisualIdentity | undefined {
  return (identities as Record<string, AwardVisualIdentity>)[slug];
}
