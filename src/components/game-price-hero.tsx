import type { CatalogGame } from "@/lib/types";
import { CatalogPriceTrendIndicator } from "@/components/catalog-price-trend-indicator";
import { formatEur } from "@/lib/price-format";
import { getPublishedPriceHistory } from "@/lib/price-history";
import { catalogPriceTrends } from "@/lib/price-history-model";
import { getRegionDisplay } from "@/lib/region-display";
import {
  CONDITION_PRICE_DESCRIPTIONS,
  type ConditionBucket,
  conditionPriceEntries,
  hasAnyConditionEstimate,
} from "@/lib/condition-prices";
import { catalogPriceDisplayLabel, hasVerifiedEsPrice } from "@/lib/price-display";
import {
  bestJapanRetailPrice,
  hasJapanRetailReference,
  latestJapanRetailMatchedAt,
} from "@/lib/import-retail-prices";
import { Badge } from "@/components/ui";

type Props = {
  game: CatalogGame;
  regionLabelOverride?: string;
  pendingMessage?: string;
  allowedBuckets?: readonly ConditionBucket[];
  forcePending?: boolean;
};

export function GamePriceHero({
  game,
  regionLabelOverride,
  pendingMessage,
  allowedBuckets,
  forcePending = false,
}: Props) {
  const status = catalogPriceDisplayLabel(game);
  const regionLabel = regionLabelOverride ?? getRegionDisplay(game.region).label;
  const conditionPrices = forcePending
    ? []
    : conditionPriceEntries(game, allowedBuckets);
  const hasEstimate = forcePending
    ? false
    : allowedBuckets
      ? conditionPrices.length > 0
      : hasAnyConditionEstimate(game) || hasVerifiedEsPrice(game);
  const priceTrends = catalogPriceTrends(getPublishedPriceHistory(game));
  const trendForBucket = (bucket: ConditionBucket) => {
    if (bucket === "loose" || bucket === "gameManual") return priceTrends.loose;
    if (bucket === "complete" || bucket === "sealed") return priceTrends[bucket];
    return undefined;
  };

  const updatedLabel = game.updatedAt
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(game.updatedAt))
    : null;

  if (!hasEstimate) {
    if (
      !forcePending &&
      (!allowedBuckets || allowedBuckets.includes("newRetail")) &&
      hasJapanRetailReference(game)
    ) {
      const retailPrice = bestJapanRetailPrice(game);
      const updatedAt = latestJapanRetailMatchedAt(game);
      const retailUpdatedLabel = updatedAt
        ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(updatedAt))
        : null;
      return (
        <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Referencia retail · {regionLabel}
              </p>
              {retailUpdatedLabel && (
                <p className="mt-1 text-xs text-muted">Actualizado: {retailUpdatedLabel}</p>
              )}
            </div>
            <Badge tone="amber">Referencia verificada</Badge>
          </div>
          <p className="mt-5 text-3xl font-bold text-accent sm:text-4xl">
            {formatEur(retailPrice)}
          </p>
          <p className="mt-3 text-sm text-muted">
            Referencia agregada de mercado. Aún no hay media de reventa por estado para esta edición.
          </p>
        </section>
      );
    }

    return (
      <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Precio pendiente</p>
        <p className="mt-2 text-sm text-muted">
          {pendingMessage ?? `Aún no hay datos de reventa verificados para esta edición (${regionLabel}).`}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Valor de reventa · {regionLabel}
        </p>
        {status === "verified" ? <Badge tone="amber">Precio verificado</Badge> : null}
      </div>

      {conditionPrices.length > 0 && (
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
          {conditionPrices.map((entry) => (
            <div
              key={entry.bucket}
              className="flex flex-col rounded-2xl border border-border/70 bg-background/45 p-4 transition"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {entry.label}
                </p>
                <p className="mt-1 text-xs leading-snug text-muted/80">
                  {CONDITION_PRICE_DESCRIPTIONS[entry.bucket]}
                </p>
              </div>
              <p className="mt-auto flex items-center gap-2 break-words pt-5 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                <span>{formatEur(entry.price)}</span>
                <CatalogPriceTrendIndicator trend={trendForBucket(entry.bucket)} />
              </p>
            </div>
          ))}
        </div>
      )}

      {conditionPrices.length === 0 && game.recommendedPrice != null && (
        <p className="mt-5 text-3xl font-bold text-accent sm:text-4xl">
          {formatEur(game.recommendedPrice)}
        </p>
      )}

      {updatedLabel && (
        <p className="mt-3 text-xs text-muted/80">Última actualización de precio: {updatedLabel}</p>
      )}
    </section>
  );
}
