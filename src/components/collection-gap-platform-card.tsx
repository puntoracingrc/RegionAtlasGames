import Link from "next/link";
import {
  MANUFACTURER_PANEL_STYLE,
  type CollectionPlatformGroup,
} from "@/lib/collection-platform-groups";
import { countLinkableGapItems } from "@/lib/collection-gap";
import { cn } from "@/lib/cn";

const HOVER_LIFT =
  "transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/45";

type Variant = "pending" | "outOfScope";

function gapPlatformHref(variant: Variant, slug: string): string {
  return variant === "pending" ? `/coleccion/pendientes/${slug}` : `/coleccion/fuera/${slug}`;
}

type Props = {
  variant: Variant;
  group: CollectionPlatformGroup;
};

export function CollectionGapPlatformCard({ variant, group }: Props) {
  const style = MANUFACTURER_PANEL_STYLE[group.manufacturer];
  const linkable = countLinkableGapItems(group.items);
  const unitsLabel =
    group.units > group.items.length ? ` · ${group.units} uds.` : "";

  return (
    <Link
      href={gapPlatformHref(variant, group.slug)}
      className={cn(
        "group relative rounded-xl border bg-gradient-to-br p-4",
        HOVER_LIFT,
        "hover:border-white/25",
        style,
        linkable > 0 && "ring-1 ring-emerald-400/35",
      )}
    >
      {linkable > 0 && (
        <span
          className="absolute right-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-600 px-1.5 text-[11px] font-bold text-white shadow-md"
          title={`${linkable} ${linkable === 1 ? "ficha lista" : "fichas listas"} para enlazar`}
        >
          {linkable > 99 ? "99+" : linkable}
        </span>
      )}

      <div className="pr-10">
        <p className="text-xs uppercase tracking-wider text-muted">{group.manufacturer}</p>
        <h3 className="mt-1 text-xl font-bold text-foreground">{group.shortName}</h3>
      </div>

      <p className="mt-4 text-sm text-muted">
        {group.items.length} {group.items.length === 1 ? "juego" : "juegos"}
        {unitsLabel}
      </p>

      {linkable > 0 ? (
        <p className="mt-2 text-xs font-medium text-emerald-300/95">
          {linkable} {linkable === 1 ? "listo para enlazar" : "listos para enlazar"} · pulsa +
        </p>
      ) : variant === "outOfScope" && group.slug === "ps5" ? (
        <p className="mt-2 text-xs text-muted">Sin ficha en catálogo todavía</p>
      ) : (
        <p className="mt-2 text-xs text-muted">Ver listado completo</p>
      )}
    </Link>
  );
}

export function CollectionGapPlatformGrid({
  variant,
  groups,
}: {
  variant: Variant;
  groups: CollectionPlatformGroup[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {groups.map((group) => (
        <CollectionGapPlatformCard key={group.slug} variant={variant} group={group} />
      ))}
    </div>
  );
}
