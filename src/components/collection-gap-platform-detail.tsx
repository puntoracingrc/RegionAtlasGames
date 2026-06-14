import { BackLink } from "@/components/breadcrumbs";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { CollectionGapGameCard } from "@/components/collection-gap-game-card";
import {
  groupCollectionByPlatform,
  MANUFACTURER_PANEL_STYLE,
} from "@/lib/collection-platform-groups";
import { countLinkableGapItems } from "@/lib/collection-gap";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import type { CollectionView } from "@/lib/types";
import { cn } from "@/lib/cn";

type Variant = "pending" | "outOfScope";

const COPY: Record<
  Variant,
  { backLabel: string; listHref: string; badge: string; badgeClass: string }
> = {
  pending: {
    backLabel: "Volver a mi colección",
    listHref: "/coleccion",
    badge: "Pendiente de ficha",
    badgeClass: "text-amber-400",
  },
  outOfScope: {
    backLabel: "Volver a mi colección",
    listHref: "/coleccion",
    badge: "Sin catálogo oficial",
    badgeClass: "text-blue-300",
  },
};

type Props = {
  variant: Variant;
  platformSlug: string;
  items: CollectionView[];
};

export function CollectionGapPlatformDetail({ variant, platformSlug, items }: Props) {
  const groups = groupCollectionByPlatform(items);
  const group = groups.find((g) => g.slug === platformSlug) ?? groups[0];

  if (!group) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        No hay juegos en esta plataforma.
      </p>
    );
  }

  const copy = COPY[variant];
  const style = MANUFACTURER_PANEL_STYLE[group.manufacturer];
  const linkable = countLinkableGapItems(group.items);

  return (
    <div className="space-y-6">
      <BackLink href={copy.listHref}>{copy.backLabel}</BackLink>

      <section className={cn("overflow-hidden rounded-2xl border bg-gradient-to-br", style)}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 md:px-5">
          <div>
            <ManufacturerLogo manufacturer={group.manufacturer} />
            <h1 className="text-2xl font-bold text-foreground">{group.shortName}</h1>
            <p className={cn("mt-1 text-sm font-medium", copy.badgeClass)}>{copy.badge}</p>
            {linkable > 0 && (
              <p className="mt-1 text-xs text-emerald-300/95">
                {linkable} {linkable === 1 ? "ficha disponible" : "fichas disponibles"} · pulsa +
              </p>
            )}
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-muted">
            {group.items.length} {group.items.length === 1 ? "juego" : "juegos"}
            {group.units > group.items.length ? ` · ${group.units} uds.` : ""}
          </span>
        </header>

        <div className={cn("p-3 md:p-4", CATALOG_GRID_CLASS)}>
          {group.items.map((item) => (
            <CollectionGapGameCard key={item.id} game={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
