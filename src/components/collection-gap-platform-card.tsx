import Link from "next/link";
import {
  MANUFACTURER_PANEL_STYLE,
  type CollectionPlatformGroup,
} from "@/lib/collection-platform-groups";
import { countLinkableGapItems } from "@/lib/collection-gap";
import { cn } from "@/lib/cn";

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

  return (
    <Link
      href={gapPlatformHref(variant, group.slug)}
      className={cn(
        "group flex min-h-11 items-center justify-between gap-3 rounded-md border bg-card/70 px-3 py-2 transition hover:border-accent/40 hover:bg-card-hover",
        style,
        linkable > 0 && "ring-1 ring-emerald-400/35",
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{group.shortName}</h3>
        <p className="text-[11px] text-muted">
          {group.items.length} {group.items.length === 1 ? "juego" : "juegos"}
          {group.units > group.items.length ? ` · ${group.units} uds.` : ""}
        </p>
      </div>
      <span
        className={`shrink-0 text-xs font-semibold ${
          linkable > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-muted"
        }`}
      >
        {linkable > 0 ? `${linkable} para enlazar` : "Ver"}
      </span>
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
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {groups.map((group) => (
        <CollectionGapPlatformCard key={group.slug} variant={variant} group={group} />
      ))}
    </div>
  );
}
