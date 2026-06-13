import Link from "next/link";
import { getPlatform } from "@/lib/catalog";
import type { CollectionView } from "@/lib/types";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  items: CollectionView[];
};

export function CollectionPendingPanel({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <Panel className="mb-8 border-amber-400/25 bg-amber-500/5">
      <PanelTitle>Pendientes de catálogo ({items.length})</PanelTitle>
      <p className="mt-2 text-sm text-muted">
        Estos juegos están en tu importación pero aún no tienen ficha en Region Atlas. Guárdalos
        aquí para no olvidarte de incluirlos más adelante.
      </p>

      <ul className="mt-4 divide-y divide-border/60 rounded-xl border border-border bg-card/40">
        {items.map((item) => {
          const platform = getPlatform(item.platformSlug);
          return (
            <li key={item.id}>
              <Link
                href={`/coleccion/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition hover:bg-card/80"
              >
                <span className="font-medium text-foreground">{item.title}</span>
                <span className="text-muted">
                  {platform?.shortName ?? item.platformSlug}
                  {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
