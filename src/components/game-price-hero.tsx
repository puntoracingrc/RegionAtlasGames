import type { CatalogGame } from "@/lib/types";
import { formatEur } from "@/lib/price-format";
import { getRegionDisplay } from "@/lib/region-display";
import {
  CONDITION_PRICE_DESCRIPTIONS,
  conditionPriceEntries,
  hasAnyConditionEstimate,
  primaryConditionPriceEntry,
} from "@/lib/condition-prices";
import { catalogPriceDisplayLabel, hasVerifiedEsPrice } from "@/lib/price-display";
import { ebayRegionalSearchPolicy } from "@/lib/ebay/ebay-regional-policy";
import {
  bestJapanRetailPrice,
  hasJapanRetailReference,
  latestJapanRetailMatchedAt,
} from "@/lib/import-retail-prices";
import { Badge } from "@/components/ui";

type Props = { game: CatalogGame };

export function GamePriceHero({ game }: Props) {
  const status = catalogPriceDisplayLabel(game);
  const regionLabel = getRegionDisplay(game.region).label;
  const conditionPrices = conditionPriceEntries(game);
  const primaryCondition = primaryConditionPriceEntry(game);
  const hasEstimate = hasAnyConditionEstimate(game) || hasVerifiedEsPrice(game);
  const regionalPolicy = ebayRegionalSearchPolicy(game.region);
  const hasDeliveryEstimate = conditionPrices.some((entry) => entry.totalToSpain != null);

  const updatedLabel = game.updatedAt
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(game.updatedAt))
    : null;

  if (!hasEstimate) {
    if (hasJapanRetailReference(game)) {
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
      <section className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Precio pendiente</p>
        <p className="mt-2 text-sm text-muted">
          Aún no hay datos de reventa verificados para esta edición ({regionLabel}).
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Valor de reventa · {regionLabel}
          </p>
          <p className="mt-1 text-xs text-muted">
            Importe convertido a EUR · precios por estado
          </p>
          <p className="mt-1 text-xs text-muted">
            Artículo en {regionalPolicy.originLabel} · entrega calculada para España
          </p>
        </div>
        <Badge tone={status === "verified" ? "amber" : "rose"}>
          {status === "verified" ? "Precio verificado" : "Precio orientativo"}
        </Badge>
      </div>

      {primaryCondition && (
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
          {conditionPrices.map((entry) => {
            const isPrimary = entry.bucket === primaryCondition.bucket;
            return (
              <div
                key={entry.bucket}
                className={[
                  "rounded-2xl border p-4 transition",
                  isPrimary
                    ? "border-accent/35 bg-accent/10 shadow-sm"
                    : "border-border/70 bg-background/45",
                ].join(" ")}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {entry.label}
                    </p>
                    <p className="mt-1 text-xs leading-snug text-muted/80">
                      {CONDITION_PRICE_DESCRIPTIONS[entry.bucket]}
                    </p>
                  </div>
                  {isPrimary && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Principal
                    </span>
                  )}
                </div>
                <p className="mt-5 break-words text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  {formatEur(entry.price)}
                </p>
                {entry.totalToSpain != null && (
                  <div className="mt-4 border-t border-border/70 pt-3 text-xs text-muted">
                    <div className="flex items-center justify-between gap-3">
                      <span>Transporte estimado</span>
                      <span className="font-semibold text-foreground">
                        {entry.shippingToSpain != null ? `+ ${formatEur(entry.shippingToSpain)}` : "Incluido"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span>Artículo + transporte</span>
                      <span className="font-bold text-foreground">{formatEur(entry.totalToSpain)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {conditionPrices.length === 0 && game.recommendedPrice != null && (
        <p className="mt-5 text-3xl font-bold text-accent sm:text-4xl">
          {formatEur(game.recommendedPrice)}
        </p>
      )}

      {hasDeliveryEstimate && regionalPolicy.importCostsMayApply && (
        <p className="mt-3 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-xs leading-5 text-amber-900 dark:text-amber-100">
          El total mostrado suma artículo y transporte estimado. IVA de importación, gestión o
          aduanas pueden añadirse si eBay no los anticipa en el anuncio; el checkout es el importe
          definitivo.
        </p>
      )}

      {updatedLabel && (
        <p className="mt-3 text-xs text-muted/80">Última actualización de precio: {updatedLabel}</p>
      )}
    </section>
  );
}
