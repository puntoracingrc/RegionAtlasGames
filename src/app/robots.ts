import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/catalog-seo";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/chat/", "/venta/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
