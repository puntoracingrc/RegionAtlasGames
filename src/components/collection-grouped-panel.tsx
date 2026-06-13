import Link from "next/link";
import {
  groupCollectionByPlatform,
  MANUFACTURER_PANEL_STYLE,
  type CollectionPlatformGroup,
} from "@/lib/collection-platform-groups";
import type { CollectionView } from "@/lib/types";
import { Panel, PanelTitle } from "@/components/ui";

type Variant = "pending" | "outOfScope";

type Props = {
  variant: Variant;
  items: CollectionView[];
};

const COPY: Record<
  Variant,
  { title: (count: number) => string; description: string; panelClass: string }
> = {
  pending: {
    title: (count) => `Pendientes de catálogo (${count})`,
    description:
      "Estos juegos están en plataformas retro que indexamos, pero aún no tienen ficha en Region Atlas. Los guardamos aquí para no olvidarte de incluirlos.",
    panelClass: "border-amber-400/25 bg-amber-500/5",
  },
  outOfScope: {
    title: (count) => `PS5 y otras plataformas (${count})`,
    description:
      "Importados correctamente desde PriceCharting. Region Atlas aún no indexa PS5 ni otras plataformas vivas, pero siguen en tu colección.",
    panelClass: "border-blue-400/20 bg-blue-500/5",
  },
};

function PlatformSection({ group }: { group: CollectionPlatformGroup }) {
  const style = MANUFACTURER_PANEL_STYLE[group.manufacturer];

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-gradient-to-br ${style}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 md:px-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{group.manufacturer}</p>
          <h3 className="text-lg font-bold text-foreground">{group.shortName}</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-muted">
          {group.items.length} {group.items.length === 1 ? "juego" : "juegos"}
        </span>
      </header>

      <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:p-4">
        {group.items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/coleccion/${item.id}`}
              className="group block h-full rounded-xl border border-black/20 bg-black/25 px-3 py-3 transition hover:-translate-y-0.5 hover:border-accent/30 hover:bg-black/40 hover:shadow-lg hover:shadow-black/30"
            >
              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-accent">
                {item.title}
              </p>
              <p className="mt-2 text-xs text-muted">
                {item.sealed ? "Precintado" : "Usado"}
                {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
                {item.recommendedPrice != null
                  ? ` · ${new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(item.recommendedPrice)}`
                  : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CollectionGroupedPanel({ variant, items }: Props) {
  if (items.length === 0) return null;

  const copy = COPY[variant];
  const groups = groupCollectionByPlatform(items);

  return (
    <Panel className={`mb-8 ${copy.panelClass}`}>
      <PanelTitle>{copy.title(items.length)}</PanelTitle>
      <p className="mt-2 max-w-3xl text-sm text-muted">{copy.description}</p>

      <div className="mt-5 space-y-4">
        {groups.map((group) => (
          <PlatformSection key={group.slug} group={group} />
        ))}
      </div>
    </Panel>
  );
}
