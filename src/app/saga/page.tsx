import { IndexGrid } from "@/components/index-grid";
import { SiteNav } from "@/components/site-nav";
import { getSeriesList, indexStats } from "@/lib/indexes";

export default function SeriesPage() {
  const series = getSeriesList();
  const stats = indexStats();

  if (series.length === 0) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
          <h1 className="text-3xl font-bold text-foreground">Sagas</h1>
          <p className="mt-2 text-muted">
            Aún no hay sagas indexadas en el catálogo.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Sagas</h1>
          <p className="max-w-2xl text-muted">
            {stats.series} sagas indexadas en Region Atlas.
          </p>
        </header>
        <IndexGrid items={series} basePath="/saga" label="saga" />
      </main>
    </>
  );
}
