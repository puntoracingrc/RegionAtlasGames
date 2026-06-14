import type { Metadata } from "next";
import type { CompanyProfileView } from "./company-profile";
import { companyLifespanLabel, companyStatusLabel } from "./company-profile";
import { getSiteUrl } from "./site-url";

function clipMeta(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function buildCompanyMetadata(view: CompanyProfileView): Metadata {
  const base = getSiteUrl();
  const url = `${base}/compania/${view.slug}`;
  const lifespan = companyLifespanLabel(view.foundedYear, view.closedYear);
  const fallbackDescription = [
    `${view.name}: ${view.gameCount.toLocaleString("es-ES")} juegos en el catálogo retro de Region Atlas.`,
    view.developerCount > 0
      ? `${view.developerCount.toLocaleString("es-ES")} como desarrolladora.`
      : null,
    view.publisherCount > 0
      ? `${view.publisherCount.toLocaleString("es-ES")} como publicadora.`
      : null,
    lifespan,
  ]
    .filter(Boolean)
    .join(" ");

  const title =
    view.seoTitle?.trim() ||
    `${view.name} · juegos retro, plataformas y catálogo | Region Atlas`;
  const description = clipMeta(view.seoDescription?.trim() || fallbackDescription, 160);

  return {
    title: clipMeta(title, 70),
    description,
    alternates: { canonical: url },
    openGraph: {
      title: clipMeta(title, 70),
      description,
      url,
      type: "website",
    },
  };
}

export function buildCompanyIntro(view: CompanyProfileView): string {
  if (view.history) return view.history;
  const parts = [
    `${view.name} aparece en ${view.gameCount.toLocaleString("es-ES")} juegos del catálogo Region Atlas`,
  ];
  if (view.developerCount > 0 && view.publisherCount > 0) {
    parts.push(
      `como desarrolladora (${view.developerCount.toLocaleString("es-ES")}) y publicadora (${view.publisherCount.toLocaleString("es-ES")})`,
    );
  } else if (view.developerCount > 0) {
    parts.push(`principalmente como desarrolladora (${view.developerCount.toLocaleString("es-ES")} títulos)`);
  } else if (view.publisherCount > 0) {
    parts.push(`principalmente como publicadora (${view.publisherCount.toLocaleString("es-ES")} títulos)`);
  }
  const lifespan = companyLifespanLabel(view.foundedYear, view.closedYear);
  if (lifespan) parts.push(`(${lifespan})`);
  parts.push(`Estado: ${companyStatusLabel(view.status).toLowerCase()}.`);
  return `${parts.join(" ")}.`;
}
