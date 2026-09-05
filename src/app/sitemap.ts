import type { MetadataRoute } from "next";
import { platforms } from "@/lib/catalog";
import {
  catalogGamePath,
  getListedGamesWithEsPrice,
} from "@/lib/catalog-url";
import { getSiteUrl } from "@/lib/site-url";
import { getPublicPersonProfiles } from "@/lib/person-public-research";
import { listPublicSeriesIndexEntries } from "@/lib/admin-series-manager";
import { listPublicFranchiseIndexEntries } from "@/lib/admin-franchise-manager";
import { getLegacySeriesRedirect } from "@/lib/franchise-system";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/plataformas`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/vitrina`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/compania`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/persona`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/genero`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/franquicia`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/saga`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const platformRoutes: MetadataRoute.Sitemap = platforms
    .filter((p) => p.active !== false)
    .map((p) => ({
      url: `${base}/plataforma/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const gameRoutes: MetadataRoute.Sitemap = getListedGamesWithEsPrice().map((game) => ({
    url: `${base}${catalogGamePath(game)}`,
    lastModified: game.updatedAt ? new Date(game.updatedAt) : now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const personRoutes: MetadataRoute.Sitemap = getPublicPersonProfiles().map((person) => ({
    url: `${base}/persona/${person.slug}`,
    lastModified: new Date(person.lastChecked),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const franchiseRoutes: MetadataRoute.Sitemap = (await listPublicFranchiseIndexEntries()).map((franchise) => ({
    url: `${base}/franquicia/${franchise.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  const seriesRoutes: MetadataRoute.Sitemap = (await listPublicSeriesIndexEntries())
    .filter((series) => !getLegacySeriesRedirect(series.slug))
    .map((series) => ({
      url: `${base}/saga/${series.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.55,
    }));

  return [
    ...staticRoutes,
    ...platformRoutes,
    ...franchiseRoutes,
    ...seriesRoutes,
    ...personRoutes,
    ...gameRoutes,
  ];
}
