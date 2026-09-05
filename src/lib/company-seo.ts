import type { Metadata } from "next";
import { formatCatalogEntryCount } from "./catalog-entry-count";
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
    `${view.name}: ${view.uniqueWorkCount.toLocaleString("es-ES")} ${view.uniqueWorkCount === 1 ? "obra" : "obras"} en ${formatCatalogEntryCount(view.catalogEntryCount)} catalogadas, incluidas sus ediciones, en Region Atlas.`,
    view.developerCatalogEntryCount > 0
      ? `${formatCatalogEntryCount(view.developerCatalogEntryCount)} como desarrolladora.`
      : null,
    view.publisherCatalogEntryCount > 0
      ? `${formatCatalogEntryCount(view.publisherCatalogEntryCount)} como publicadora.`
      : null,
    view.digitalPublisherCatalogEntryCount > 0
      ? `${formatCatalogEntryCount(view.digitalPublisherCatalogEntryCount)} como editora digital.`
      : null,
    view.physicalPublisherCatalogEntryCount > 0
      ? `${formatCatalogEntryCount(view.physicalPublisherCatalogEntryCount)} en edición o distribución física.`
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
    `${view.name} aparece vinculada a ${view.uniqueWorkCount.toLocaleString("es-ES")} ${view.uniqueWorkCount === 1 ? "obra" : "obras"} mediante ${formatCatalogEntryCount(view.catalogEntryCount)} catalogadas, incluidas sus ediciones, en Region Atlas`,
  ];
  if (view.developerCatalogEntryCount > 0 && view.publisherCatalogEntryCount > 0) {
    parts.push(
      `como desarrolladora (${formatCatalogEntryCount(view.developerCatalogEntryCount)}) y publicadora (${formatCatalogEntryCount(view.publisherCatalogEntryCount)})`,
    );
  } else if (view.developerCatalogEntryCount > 0) {
    parts.push(`principalmente como desarrolladora (${formatCatalogEntryCount(view.developerCatalogEntryCount)})`);
  } else if (view.publisherCatalogEntryCount > 0) {
    parts.push(`principalmente como publicadora (${formatCatalogEntryCount(view.publisherCatalogEntryCount)})`);
  }
  if (view.digitalPublisherCatalogEntryCount > 0) {
    parts.push(`con ${formatCatalogEntryCount(view.digitalPublisherCatalogEntryCount)} como editora digital`);
  }
  if (view.physicalPublisherCatalogEntryCount > 0) {
    parts.push(
      `con ${formatCatalogEntryCount(view.physicalPublisherCatalogEntryCount)} en edición o distribución física`,
    );
  }
  const lifespan = companyLifespanLabel(view.foundedYear, view.closedYear);
  if (lifespan) parts.push(`(${lifespan})`);
  parts.push(`Estado: ${companyStatusLabel(view.status).toLowerCase()}`);
  return `${parts.join(" ")}.`;
}
