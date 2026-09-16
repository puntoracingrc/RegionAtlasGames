import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyExplorer } from "@/components/company-explorer";
import { NewsStrip } from "@/components/news-strip";
import { SiteNav } from "@/components/site-nav";
import { getCompanyBrowseData, getCompanyBrowseInitialData } from "@/lib/company-browse-index";
import { companyListIntro } from "@/lib/company-explorer-filter";
import { listNewsForSection } from "@/lib/news-cache";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function buildCompaniesListMetadata(): Metadata {
  const data = getCompanyBrowseData();
  const description = `${companyListIntro(data.stats)}. Filtra por función, plataforma, género, tamaño, estado, periodo de actividad y cobertura de precios.`;
  const url = `${getSiteUrl()}/compania`;

  return {
    title: "Compañías — Publicadoras y desarrolladoras",
    description,
    alternates: { canonical: url },
    openGraph: {
      title: "Compañías del catálogo retro | Region Atlas",
      description,
      url,
      type: "website",
      locale: "es_ES",
    },
  };
}

export const metadata = buildCompaniesListMetadata();

export default async function CompaniesPage() {
  const data = getCompanyBrowseInitialData();

  if (data.companies.length === 0) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
          <h1 className="text-3xl font-bold text-foreground">Compañías</h1>
          <p className="mt-2 text-muted">Aún no hay compañías indexadas en el catálogo.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Compañías</h1>
        </header>
        <Suspense fallback={<div className="mb-6 h-28 animate-pulse rounded-lg bg-card-hover" aria-hidden />}>
          <CompanyNews />
        </Suspense>
        <CompanyExplorer {...data} deferInitialLoad />
      </main>
    </>
  );
}

async function CompanyNews() {
  const companyNews = await listNewsForSection({ section: "company", topic: "developers", limit: 9 });
  return <NewsStrip eyebrow="Industria" title="Actualidad de compañías y desarrolladoras" items={companyNews} />;
}
