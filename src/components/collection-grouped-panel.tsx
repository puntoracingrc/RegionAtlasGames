import { CollectionGameCard } from "@/components/game-card";
import {
  groupCollectionByPlatform,
  MANUFACTURER_PANEL_STYLE,
  type CollectionPlatformGroup,
} from "@/lib/collection-platform-groups";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
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
    title: (count) => `Plataformas sin catálogo oficial (${count})`,
    description:
      "PS5 y otras plataformas que aún no indexamos. Tus juegos siguen aquí, agrupados por consola, hasta que tengan ficha en Region Atlas.",
    panelClass: "border-blue-400/20 bg-blue-500/5",
  },
};

function PlatformSection({ group }: { group: CollectionPlatformGroup }) {
  const style = MANUFACTURER_PANEL_STYLE[group.manufacturer];
  const sectionId = group.slug === "ps5" ? "ps5" : undefined;

  return (
    <section
      id={sectionId}
      className={`overflow-hidden rounded-2xl border bg-gradient-to-br ${style}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 md:px-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{group.manufacturer}</p>
          <h3 className="text-lg font-bold text-foreground">{group.shortName}</h3>
          {group.slug === "ps5" && (
            <p className="mt-0.5 text-xs text-muted">Sin ficha en catálogo · solo en tu colección</p>
          )}
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-muted">
          {group.items.length} {group.items.length === 1 ? "juego" : "juegos"}
          {group.units > group.items.length ? ` · ${group.units} uds.` : ""}
        </span>
      </header>

      <div className={`p-3 md:p-4 ${CATALOG_GRID_CLASS}`}>
        {group.items.map((item) => (
          <CollectionGameCard key={item.id} game={item} />
        ))}
      </div>
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
