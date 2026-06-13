import { IndexGrid } from "@/components/index-grid";
import { SiteNav } from "@/components/site-nav";
import type { IndexKind } from "@/lib/index-entity";
import { INDEX_KIND_META, getIndexList, indexListIntro } from "@/lib/index-entity";

export function IndexEntityList({ kind }: { kind: IndexKind }) {
  const meta = INDEX_KIND_META[kind];
  const items = getIndexList(kind);

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
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">{meta.listTitle}</h1>
          <p className="max-w-2xl text-muted">{indexListIntro(kind)}</p>
        </header>
        <IndexGrid items={items} kind={kind} />
      </main>
    </>
  );
}
