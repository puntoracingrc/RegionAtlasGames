import { formatEur } from "@/lib/price-format";
import type { CollectionSummary } from "@/lib/collection-store";
import { CollectionValueUpsell } from "@/components/collection-value-upsell";

type Props = {
  summary: CollectionSummary;
  canViewCollectionValue: boolean;
};

export function CollectionValueHero({ summary, canViewCollectionValue }: Props) {
  if (!canViewCollectionValue) {
    return <CollectionValueUpsell className="mb-8" itemCount={summary.totalItems} />;
  }

  const pricedPct =
    summary.totalItems > 0
      ? Math.round((summary.withEsPrice / summary.totalItems) * 100)
      : 0;

  const pendingCatalog = summary.pendingCatalog + summary.outOfScopeItems;

  return (
    <section
      className="mb-4 overflow-hidden rounded-xl border border-border bg-card"
      aria-label="Resumen de la colección"
    >
      <div
        className={`grid grid-cols-2 divide-x divide-y divide-border/70 sm:grid-cols-3 lg:divide-y-0 ${
          summary.totalBuyValue > 0 ? "lg:grid-cols-6" : "lg:grid-cols-5"
        }`}
      >
        <CompactStat
          label="Valor estimado"
          value={formatEur(summary.totalRecommendedValue)}
          accent
        />
        <CompactStat label="Juegos" value={String(summary.totalItems)} />
        <CompactStat label="Unidades" value={String(summary.totalUnits)} />
        <CompactStat
          label="Con precio"
          value={`${summary.withEsPrice} · ${pricedPct}%`}
        />
        <CompactStat
          label="Sin ficha"
          value={String(pendingCatalog)}
          className={summary.totalBuyValue > 0 ? undefined : "col-span-2 sm:col-span-1"}
        />
        {summary.totalBuyValue > 0 && (
          <CompactStat label="Inversión" value={formatEur(summary.totalBuyValue)} />
        )}
      </div>
    </section>
  );
}

function CompactStat({
  label,
  value,
  accent = false,
  className = "",
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex min-h-20 flex-col justify-center px-4 py-3 ${className}`}>
      <span className="text-[10px] font-semibold uppercase text-muted">{label}</span>
      <strong
        className={`mt-1 text-xl font-bold tabular-nums ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </strong>
    </div>
  );
}
