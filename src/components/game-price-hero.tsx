import type { CatalogGame } from "@/lib/types";
import { formatEur } from "@/lib/catalog";
import { getRegionDisplay } from "@/lib/region-display";
import { esPriceDisplayLabel, hasVerifiedEsPriceRange } from "@/lib/price-display";
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
  const hasRange = hasVerifiedEsPriceRange(game);
  const hasEstimate = game.recommendedPrice != null;

  const updatedLabel = game.updatedAt
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(game.updatedAt))
    : null;

  if (status === "pending" || !hasEstimate) {
    if (hasJapanRetailReference(game)) {
      const retailPrice = bestJapanRetailPrice(game);
      const retailSource = bestJapanRetailSource(game);
      const updatedAt = latestJapanRetailMatchedAt(game);
      const updatedLabel = updatedAt
        ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(updatedAt))
        : null;
      return (
        <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Referencia retail · {regionLabel}
              </p>
              {updatedLabel && (
                <p className="mt-1 text-xs text-muted">Actualizado: {updatedLabel}</p>
              )}
            </div>
            <Badge tone="amber">{retailSource}</Badge>
          </div>
          <p className="mt-5 text-3xl font-bold text-accent sm:text-4xl">
            {formatEur(retailPrice)}
          </p>
          <p className="mt-3 text-sm text-muted">
            Precio «desde» en tienda especializada en importación (Madrid/Barcelona). No sustituye
            ventas P2P verificadas; el estado concreto puede variar.
          </p>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Precio pendiente</p>
        <p className="mt-2 text-sm text-muted">
          Aún no hay ventas verificadas en el mercado español para esta edición ({regionLabel}).
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Valor de mercado · {regionLabel}
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
        {hasRange && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted">Rango verificado</p>
            <p className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
              {formatEur(game.marketMin)} – {formatEur(game.marketMax)}
            </p>
          </div>
        )}
        <div className={hasRange ? "" : "sm:col-span-2"}>
          <p className="text-[10px] uppercase tracking-wider text-muted">Estimación media</p>
          <p className="mt-1 text-3xl font-bold text-accent sm:text-4xl">
            {formatEur(game.recommendedPrice)}
          </p>
        </div>
        {hasRange && (
          <div className="flex items-end">
            <p className="text-sm leading-relaxed text-muted">
              El precio final depende del estado de conservación: suelto, completo (CIB), precintado
              o gradado.
            </p>
          </div>
        )}
      </div>

      {!hasRange && status === "unverified" && (
        <p className="mt-4 text-sm text-muted">
          El rango min–máx se publicará cuando haya anuncios P2P con región verificada para esta
          edición.
        </p>
      )}

      {!hasRange && status !== "unverified" && (
        <p className="mt-4 text-sm text-muted">
          El valor concreto varía según el estado de la copia (suelto, completo, precintado o gradado).
        </p>
      )}

      {game.priceSource && (
        <p className="mt-3 text-xs text-muted/80">Fuente: {game.priceSource}</p>
      )}
    </section>
  );
}
