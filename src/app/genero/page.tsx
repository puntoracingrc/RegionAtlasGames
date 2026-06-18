import { GameTaxonomyGroupBrowser } from "@/components/game-taxonomy-group-browser";
import { SiteNav } from "@/components/site-nav";
import { getPublicTaxonomyGroups } from "@/lib/game-taxonomy-groups";

export const dynamic = "force-dynamic";

export default async function GenresPage() {
  const groups = await getPublicTaxonomyGroups({ includeFacetCounts: false });

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            Taxonomía jugable
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-5xl">
            Géneros, subgéneros y etiquetas
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">
            Hemos separado los cajones grandes de los rasgos finos: géneros principales,
            subgéneros, estilo visual, temas, modos de juego, regiones de portada y otras
            facetas. Cada término enlaza a su ficha con juegos filtrables por plataforma,
            región, precio y búsqueda.
          </p>
        </header>

        <GameTaxonomyGroupBrowser groups={groups} />
      </main>
    </>
  );
}
