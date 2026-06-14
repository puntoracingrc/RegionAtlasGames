import type { Metadata } from "next";
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
    `${view.name}: ${view.gameCount.toLocaleString("es-ES")} juegos retro clasificados en Region Atlas por plataforma y región PAL.`,
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
    `El género ${view.name} reúne ${view.gameCount.toLocaleString("es-ES")} juegos del catálogo Region Atlas`,
  ];
  if (view.alsoKnownAs.length > 0) {
    parts.push(` (también indexado como ${view.alsoKnownAs.slice(0, 3).join(", ")})`);
  }
  parts.push(". Consulta el desglose por plataforma y accede a cada ficha del catálogo.");
  return parts.join("");
}
