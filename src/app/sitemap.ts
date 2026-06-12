import type { MetadataRoute } from "next";
import { platforms } from "@/lib/catalog";
import {
  catalogGamePath,
  getListedGamesWithEsPrice,
} from "@/lib/catalog-url";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/plataformas`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/compania`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/genero`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/saga`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const platformRoutes: MetadataRoute.Sitemap = platforms.map((p) => ({
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

  return [...staticRoutes, ...platformRoutes, ...gameRoutes];
}
