import type { Metadata } from "next";
import { formatCatalogEntryCount } from "./catalog-entry-count";
import type { GenreProfileView } from "./genre-profile";
import { getSiteUrl } from "./site-url";

function clipMeta(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function buildGenreMetadata(view: GenreProfileView): Metadata {
  const base = getSiteUrl();
  const url = `${base}/genero/${view.slug}`;
  const description = clipMeta(
    `${view.name}: ${formatCatalogEntryCount(view.catalogEntryCount)} ${
      view.catalogEntryCount === 1 ? "clasificada" : "clasificadas"
    } en Region Atlas por plataforma y región.`,
    160,
  );
  const title = `${view.name} · género retro | Region Atlas`;

  return {
    title: clipMeta(title, 70),
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

export function buildGenreIntro(view: GenreProfileView): string {
  const parts = [
    `El género ${view.name} reúne ${formatCatalogEntryCount(view.catalogEntryCount)} del catálogo Region Atlas`,
  ];
  if (view.alsoKnownAs.length > 0) {
    parts.push(` (también indexado como ${view.alsoKnownAs.slice(0, 3).join(", ")})`);
  }
  parts.push(". Consulta el desglose por plataforma y accede a cada ficha del catálogo.");
  return parts.join("");
}
