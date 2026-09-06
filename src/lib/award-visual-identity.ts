import identities from "../../data/award-visual-identities.json";

export type AwardVisualIdentity = {
  logoPath: string | null;
  logoDarkPath: string | null;
  sourceUrl: string;
  usageStatus: "official_media_kit" | "official_download" | "permission_verified" | "permission_required" | "unavailable";
  credit: string | null;
  editionYear: number | null;
};

export function approvedAwardLogo(identity: AwardVisualIdentity | undefined, year?: number): string | null {
  if (!identity || !["official_media_kit", "official_download", "permission_verified"].includes(identity.usageStatus)) return null;
  if (year !== undefined && identity.editionYear !== null && identity.editionYear !== year) return null;
  return identity.logoPath?.startsWith("/award-logos/") ? identity.logoPath : null;
}

export function getAwardVisualIdentity(slug: string): AwardVisualIdentity | undefined {
  return (identities as Record<string, AwardVisualIdentity>)[slug];
}
