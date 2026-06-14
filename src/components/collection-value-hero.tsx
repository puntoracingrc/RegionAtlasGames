import { formatEur } from "@/lib/catalog";
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

  return (
    <section className="mb-8 rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-violet-500/5 p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Valor estimado de tu colección
      </p>
      <p className="mt-2 text-4xl font-bold text-accent sm:text-5xl">
        {formatEur(summary.totalRecommendedValue)}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>
          <strong className="text-foreground">{summary.totalItems}</strong> juegos
        </span>
        <span>
          <strong className="text-foreground">{summary.withEsPrice}</strong> con precio (
          {pricedPct}%)
        </span>
        {summary.totalBuyValue > 0 && (
          <span>
            Inversión: <strong className="text-foreground">{formatEur(summary.totalBuyValue)}</strong>
          </span>
        )}
      </div>
    </section>
  );
}
