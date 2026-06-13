import { CollectionGapPlatformGrid } from "@/components/collection-gap-platform-card";
import { groupCollectionByPlatform } from "@/lib/collection-platform-groups";
import { countLinkableGapItems } from "@/lib/collection-gap";
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
      "Elige una plataforma para ver tu listado. Cuando haya ficha en el catálogo, pulsa + para enlazar el juego.",
    panelClass: "border-amber-400/25 bg-amber-500/5",
  },
  outOfScope: {
    title: (count) => `Plataformas sin catálogo oficial (${count})`,
    description:
      "PS5 y otras plataformas aún no indexadas. Entra en cada bloque para ver tus juegos y enlazarlos cuando tengamos ficha.",
    panelClass: "border-blue-400/20 bg-blue-500/5",
  },
};

export function CollectionGroupedPanel({ variant, items }: Props) {
  if (items.length === 0) return null;

  const copy = COPY[variant];
  const groups = groupCollectionByPlatform(items);
  const linkableTotal = countLinkableGapItems(items);

  return (
    <Panel className={`mb-8 ${copy.panelClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelTitle>{copy.title(items.length)}</PanelTitle>
          <p className="mt-2 max-w-3xl text-sm text-muted">{copy.description}</p>
        </div>
        {linkableTotal > 0 && (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
            {linkableTotal} {linkableTotal === 1 ? "listo" : "listos"} para +
          </span>
        )}
      </div>

      <div className="mt-5">
        <CollectionGapPlatformGrid variant={variant} groups={groups} />
      </div>
    </Panel>
  );
}
