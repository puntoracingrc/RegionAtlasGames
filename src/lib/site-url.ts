import { SITE_DEFAULT_URL } from "@/lib/site-brand";

function cleanUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function getSiteUrl(): string {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return SITE_DEFAULT_URL;
  }
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) {
    return cleanUrl(configuredUrl);
  }
  if (process.env.VERCEL_URL) {
    return `https://${cleanUrl(process.env.VERCEL_URL)}`;
  }
  return "http://localhost:3000";
}
