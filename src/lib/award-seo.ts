import type { Metadata } from "next";
import { getSiteUrl } from "./site-url";

export function awardMetadata(title: string, path: string, description: string): Metadata {
  const url = `${getSiteUrl()}${path}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title: `${title} | Region Atlas`, description, url, type: "website" } };
}
