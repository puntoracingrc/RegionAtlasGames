import type { Metadata } from "next";
import { CompanyExplorer } from "@/components/company-explorer";
import { NewsStrip } from "@/components/news-strip";
import { SiteNav } from "@/components/site-nav";
import { companyListIntro, getCompanyExplorerData, getCompanyExplorerInitialData } from "@/lib/company-index";
import { listNewsForSection } from "@/lib/news-cache";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export function buildCompaniesListMetadata(): Metadata {
  const data = getCompanyExplorerData();
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
  const data = getCompanyExplorerInitialData();
  const companyNews = await listNewsForSection({ section: "company", topic: "developers", limit: 9 });

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
        <NewsStrip eyebrow="Industria" title="Actualidad de compañías y desarrolladoras" items={companyNews} />
        <CompanyExplorer {...data} />
      </main>
    </>
  );
}
