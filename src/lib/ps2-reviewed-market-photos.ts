import photoData from "../../data/ps2-reviewed-market-photos.json";
import { normalizePs2Serial, type Ps2EditionDetails } from "./ps2-regional";
import type { CatalogGame } from "./types";

type ReviewedPhotoSet = {
  identity: {
    platformSlug: string;
    regionCode: string;
    marketRegion: string;
    edition: string;
    canonicalSeoSlug: string;
    canonicalSerials: string[];
  };
  primaryAssetId: string | null;
  graphics: Ps2EditionDetails["graphics"];
  sources: Ps2EditionDetails["sources"];
  findings: NonNullable<Ps2EditionDetails["findings"]>;
  packagingEvidence: Ps2EditionDetails["fieldProvenance"][string];
};

// A reviewed, fixed batch, separate from temporary marketplace candidates and
// the reproducible historical PSX archive. No listing title can approve a photo.
const reviewed = photoData as { games: Record<string, ReviewedPhotoSet> };
const sameSerials = (left: string[], right: string[]) =>
  JSON.stringify(left.map(normalizePs2Serial).sort()) === JSON.stringify(right.map(normalizePs2Serial).sort());

export function withReviewedPs2Cover(game: CatalogGame): CatalogGame {
  const set = reviewed.games[game.id];
  if (!set || game.coverUrl || game.regionalStatus !== "resolved") return game;
  const expected = set.identity;
  if (game.platformSlug !== expected.platformSlug || game.regionCode !== expected.regionCode ||
      game.marketRegion !== expected.marketRegion || game.edition !== expected.edition ||
      game.canonicalSeoSlug !== expected.canonicalSeoSlug ||
      !sameSerials(game.canonicalSerials ?? [], expected.canonicalSerials)) return game;
  const cover = set.graphics.find(asset => asset.assetId === set.primaryAssetId &&
    asset.stored && asset.layout === "listing_front_photo" && asset.roles.includes("front_cover"));
  return cover?.url ? { ...game, coverUrl: cover.url } : game;
}

export function withReviewedPs2Photos(catalogId: string, profile: Ps2EditionDetails): Ps2EditionDetails {
  const set = reviewed.games[catalogId];
  if (!set || profile.status !== "resolved" ||
      !sameSerials(profile.components.filter(piece => piece.kind === "disc").map(piece => piece.serial), set.identity.canonicalSerials)) return profile;
  const market = profile.fieldProvenance.market;
  if (!(Array.isArray(market) ? market : [market]).some(claim => claim?.value === set.identity.marketRegion)) return profile;
  const assetIds = new Set(profile.graphics.map(asset => asset.assetId));
  const findings = profile.findings ?? [];
  return {
    ...profile,
    graphics: [...profile.graphics, ...set.graphics.filter(asset => !assetIds.has(asset.assetId))],
    sources: [...new Map([...profile.sources, ...set.sources].map(source => [source.url, source])).values()],
    findings: [...findings, ...set.findings.filter(finding => !findings.some(existing => existing.id === finding.id))],
    fieldProvenance: { ...profile.fieldProvenance, reviewedPackaging: set.packagingEvidence },
  };
}
