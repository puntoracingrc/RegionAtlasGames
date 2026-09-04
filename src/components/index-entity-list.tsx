import { IndexGrid } from "@/components/index-grid";
import { SiteNav } from "@/components/site-nav";
import { listPublicSeriesIndexEntries } from "@/lib/admin-series-manager";
import { listPublicFranchiseIndexEntries } from "@/lib/admin-franchise-manager";
import type { IndexKind } from "@/lib/index-entity";
import {
  INDEX_KIND_META,
  getIndexList,
  indexListIntro,
  toPublicIndexEntityListItem,
} from "@/lib/index-entity";
import { getLegacySeriesRedirect } from "@/lib/franchise-system";

export async function IndexEntityList({ kind }: { kind: IndexKind }) {
  const meta = INDEX_KIND_META[kind];
  const items = kind === "series"
    ? (await listPublicSeriesIndexEntries()).filter((entry) => !getLegacySeriesRedirect(entry.slug))
    : kind === "franchise"
      ? await listPublicFranchiseIndexEntries()
      : getIndexList(kind);

  if (items.length === 0) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
          <h1 className="text-3xl font-bold text-foreground">{meta.listTitle}</h1>
          <p className="mt-2 text-muted">
            Aún no hay {meta.entityLabelPlural} indexadas en el catálogo.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">{meta.listTitle}</h1>
            <p className="max-w-2xl text-muted">{indexListIntro(kind, items.length)}</p>
          </div>
          {kind === "series" && (
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Sagas y subseries concretas dentro de una franquicia, organizadas sin crear
              niveles artificiales para remakes, spin-offs o crossovers.
            </p>
          )}
          {kind === "franchise" && (
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Agrupaciones de videojuegos conectadas por una misma propiedad, universo,
              marca o continuidad editorial.
            </p>
          )}
          {kind === "tag" && (
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Las etiquetas sirven para clasificar fino: soulslike, mundo abierto,
              cooperativo local, pixel art, terror psicológico, metroidvania o cualquier rasgo
              útil para descubrir juegos sin romper la jerarquía de géneros.
            </p>
          )}
        </header>
        <IndexGrid items={items.map(toPublicIndexEntityListItem)} kind={kind} />
      </main>
    </>
  );
}
