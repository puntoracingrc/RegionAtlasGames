import { IndexGrid } from "@/components/index-grid";
import { SiteNav } from "@/components/site-nav";
import { getCompanies, indexStats } from "@/lib/indexes";

export default function CompaniesPage() {
  const companies = getCompanies();
  const stats = indexStats();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Compañías</h1>
          <p className="max-w-2xl text-muted">
            Desarrolladoras y publicadoras indexadas en Region Atlas. {stats.companies} entidades
            sobre {stats.gamesWithDetails.toLocaleString("es-ES")} fichas con metadatos completos.
          </p>
        </header>
        <IndexGrid items={companies} basePath="/compania" label="compañía" />
      </main>
    </>
  );
}
