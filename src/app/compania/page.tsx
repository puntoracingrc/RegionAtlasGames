import type { Metadata } from "next";
import { CompanyExplorer } from "@/components/company-explorer";
import { SiteNav } from "@/components/site-nav";
import { companyListIntro, getCompanyExplorerData } from "@/lib/company-index";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export function buildCompaniesListMetadata(): Metadata {
  const data = getCompanyExplorerData();
  const description = `${companyListIntro(data.stats)}. Filtra por publicadora, desarrolladora, plataforma, género y relevancia en el mercado español.`;
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

export default function CompaniesPage() {
  const data = getCompanyExplorerData();

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
          <p className="max-w-3xl text-muted">{companyListIntro(data.stats)}</p>
          <p className="max-w-3xl text-sm text-foreground/75">
            Explora publicadoras y desarrolladoras del catálogo retro. Cruza plataformas, géneros y
            señales de mercado para encontrar estudios relevantes en España.
          </p>
        </header>
        <CompanyExplorer {...data} />
      </main>
    </>
  );
}
