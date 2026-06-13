import type { CatalogGame } from "@/lib/types";
import { formatEur } from "@/lib/catalog";
import { getRegionDisplay } from "@/lib/region-display";
import { conditionPriceEntries, hasAnyConditionEstimate } from "@/lib/condition-prices";
import { esPriceDisplayLabel, hasVerifiedEsPrice } from "@/lib/price-display";
import {
  bestJapanRetailPrice,
  bestJapanRetailSource,
  hasJapanRetailReference,
  latestJapanRetailMatchedAt,
} from "@/components/retail-price-references";
import { Badge } from "@/components/ui";

type Props = { game: CatalogGame };

export function GamePriceHero({ game }: Props) {
  const status = esPriceDisplayLabel(game);
  const regionLabel = getRegionDisplay(game.region).label;
  const conditionPrices = conditionPriceEntries(game);
  const hasEstimate = hasAnyConditionEstimate(game) || hasVerifiedEsPrice(game);

  const updatedLabel = game.updatedAt
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(game.updatedAt))
    : null;

  if (status === "pending" || !hasEstimate) {
    if (hasJapanRetailReference(game)) {
      const retailPrice = bestJapanRetailPrice(game);
      const retailSource = bestJapanRetailSource(game);
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
            <Badge tone="amber">{retailSource}</Badge>
          </div>
          <p className="mt-5 text-3xl font-bold text-accent sm:text-4xl">
            {formatEur(retailPrice)}
          </p>
          <p className="mt-3 text-sm text-muted">
            Precio «desde» en tienda especializada. Aún no hay media de reventa por estado para
            esta edición.
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
          {updatedLabel && (
            <p className="mt-1 text-xs text-muted">Actualizado: {updatedLabel}</p>
          )}
        </div>
        <Badge tone={status === "verified" ? "amber" : "rose"}>
          {status === "verified" ? "Precio verificado" : "Precio orientativo"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {conditionPrices.map((entry) => (
          <div key={entry.bucket}>
            <p className="text-[10px] uppercase tracking-wider text-muted">{entry.label}</p>
            <p className="mt-1 text-2xl font-bold text-accent sm:text-3xl">
              {formatEur(entry.price)}
            </p>
          </div>
        ))}
      </div>

      {conditionPrices.length === 0 && game.recommendedPrice != null && (
        <p className="mt-5 text-3xl font-bold text-accent sm:text-4xl">
          {formatEur(game.recommendedPrice)}
        </p>
      )}

      <p className="mt-4 text-sm text-muted">
        Media ponderada de anuncios y tiendas en España (particulares ~55 %, tiendas ES ~30 %,
        import ~15 % cuando hay una observación de cada tipo), separada por estado de la copia.
      </p>

      {game.priceDataSources && (
        <p className="mt-3 text-xs text-muted/80">
          Datos recopilados de: {game.priceDataSources}
        </p>
      )}
    </section>
  );
}
