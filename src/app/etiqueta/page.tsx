import { GameTaxonomyGroupBrowser } from "@/components/game-taxonomy-group-browser";
import { SiteNav } from "@/components/site-nav";
import { getPublicTaxonomyGroups } from "@/lib/game-taxonomy-groups";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const groups = (await getPublicTaxonomyGroups())
    .map((group) => ({
      ...group,
      terms: group.terms.filter((term) => term.type !== "genre"),
    }))
    .filter((group) => group.terms.length > 0);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            Etiquetas y facetas
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-5xl">
            Subgéneros, estilos y rasgos jugables
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">
            Explora etiquetas controladas: subgéneros, modos de juego, temas, estilos visuales,
            perspectiva, hardware, deportes y otras facetas enlazadas a juegos del catálogo.
          </p>
        </header>

        <GameTaxonomyGroupBrowser groups={groups} />
      </main>
    </>
  );
}
