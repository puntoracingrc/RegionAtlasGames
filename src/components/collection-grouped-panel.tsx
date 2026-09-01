import { CollectionGapPlatformGrid } from "@/components/collection-gap-platform-card";
import { groupCollectionByPlatform } from "@/lib/collection-platform-groups";
import { countLinkableGapItems } from "@/lib/collection-gap";
import type { CollectionView } from "@/lib/types";

type Variant = "pending" | "outOfScope";

type Props = {
  variant: Variant;
  items: CollectionView[];
};

const COPY: Record<
  Variant,
  { title: (count: number) => string; panelClass: string }
> = {
  pending: {
    title: (count) => `Pendientes de catálogo (${count})`,
    panelClass: "border-amber-400/25 bg-amber-500/5",
  },
  outOfScope: {
    title: (count) => `Plataformas sin catálogo oficial (${count})`,
    panelClass: "border-blue-400/20 bg-blue-500/5",
  },
};

export function CollectionGroupedPanel({ variant, items }: Props) {
  if (items.length === 0) return null;

  const copy = COPY[variant];
  const groups = groupCollectionByPlatform(items);
  const linkableTotal = countLinkableGapItems(items);

  return (
    <section className={`mb-3 rounded-xl border px-4 py-3 ${copy.panelClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{copy.title(items.length)}</h2>
        {linkableTotal > 0 && (
          <span className="rounded-md border border-emerald-400/40 bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
            {linkableTotal} {linkableTotal === 1 ? "listo" : "listos"} para +
          </span>
        )}
      </div>

      <div className="mt-2">
        <CollectionGapPlatformGrid variant={variant} groups={groups} />
      </div>
    </section>
  );
}
