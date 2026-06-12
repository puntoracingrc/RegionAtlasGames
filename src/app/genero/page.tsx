import { IndexGrid } from "@/components/index-grid";
import { SiteNav } from "@/components/site-nav";
import { getGenres, indexStats } from "@/lib/indexes";

export const dynamic = "force-dynamic";

export default function GenresPage() {
  const genres = getGenres();
  const stats = indexStats();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Géneros</h1>
          <p className="max-w-2xl text-muted">
            {stats.genres} géneros indexados en el catálogo. Filtra por plataforma dentro de cada
            género.
          </p>
        </header>
        <IndexGrid items={genres} basePath="/genero" label="género" />
      </main>
    </>
  );
}
