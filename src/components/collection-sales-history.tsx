import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { RegionFlag } from "@/components/region-flag";
import { getCatalogGame } from "@/lib/catalog";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { MarketplaceListing } from "@/lib/marketplace-types";
import { formatEurCents } from "@/lib/price-format";

type Props = {
  listings: MarketplaceListing[];
};

type HistoryKind = "purchase" | "sale";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const conditionLabels = {
  sealed: "Precintado",
  complete: "Abierto completo",
  "game-manual": "Juego + manual",
  loose: "Solo juego",
  unknown: "Sin indicar",
} as const;

export function CollectionSalesHistory({ listings }: Props) {
  return <CollectionTransactionHistory listings={listings} kind="sale" />;
}

export function CollectionPurchasesHistory({ listings }: Props) {
  return <CollectionTransactionHistory listings={listings} kind="purchase" />;
}

function CollectionTransactionHistory({
  listings,
  kind,
}: Props & { kind: HistoryKind }) {
  const total = listings.reduce(
    (sum, listing) => sum + (listing.recordedSalePriceEur ?? 0),
    0,
  );
  const isPurchase = kind === "purchase";
  const titleId = `${kind}s-history-title`;

  return (
    <section className="mt-10" aria-labelledby={titleId}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={titleId} className="text-xl font-bold text-foreground">
            {isPurchase ? "Historial de juegos comprados" : "Historial de juegos vendidos"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {listings.length}{" "}
            {listings.length === 1
              ? isPurchase
                ? "compra completada"
                : "venta completada"
              : isPurchase
                ? "compras completadas"
                : "ventas completadas"}
          </p>
        </div>
        {listings.length > 0 && (
          <strong className="text-sm text-foreground">Total: {formatEurCents(total)}</strong>
        )}
      </div>

      {listings.length === 0 ? (
        <p className="border-y border-dashed border-border px-2 py-8 text-center text-sm text-muted">
          {isPurchase ? "Aún no hay compras completadas." : "Aún no hay ventas completadas."}
        </p>
      ) : (
        <ol className="divide-y divide-border/70 border-y border-border/70">
          {listings.map((listing) => {
            const game = getCatalogGame(listing.catalogId);
            const cover = getCoverSrc(game?.coverUrl, listing.catalogId);
            const condition = listing.sealed
              ? "sealed"
              : listing.collectionCondition ?? "unknown";

            return (
              <li key={listing.id} className="[content-visibility:auto]">
                <Link
                  href={`/venta/${listing.id}`}
                  className="group grid min-h-[68px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-2 transition hover:bg-card-hover sm:grid-cols-[46px_minmax(0,1fr)_minmax(155px,auto)_auto] sm:px-2"
                >
                  <div className="flex h-14 w-11 items-center justify-center overflow-hidden border border-border bg-card">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="px-1 text-center text-[8px] uppercase text-muted">
                        Sin portada
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
                      {decodeHtmlEntities(listing.title)}
                    </h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                      <span className="uppercase">{listing.platformSlug}</span>
                      <span aria-hidden>·</span>
                      <RegionFlag region={listing.region} size="xs" showLabel labelMode="short" />
                      <span aria-hidden>·</span>
                      <span>{conditionLabels[condition]}</span>
                    </p>
                    {(isPurchase || listing.soldToUserName) && (
                      <p className="mt-0.5 truncate text-[11px] text-muted sm:hidden">
                        {isPurchase
                          ? `Comprado a ${listing.sellerName}`
                          : `Vendido a ${listing.soldToUserName}`}
                      </p>
                    )}
                  </div>
                  <div className="hidden min-w-0 text-right text-[11px] text-muted sm:block">
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {isPurchase ? "Recibida" : "Completada"}
                    </span>
                    <span className="block truncate">
                      {isPurchase
                        ? `Vendedor: ${listing.sellerName} · `
                        : listing.soldToUserName
                          ? `A ${listing.soldToUserName} · `
                          : ""}
                      {dateFormatter.format(new Date(listing.buyerConfirmedAt!))}
                    </span>
                  </div>
                  <div className="text-right">
                    <strong className="block text-sm text-accent">
                      {formatEurCents(listing.recordedSalePriceEur)}
                    </strong>
                    <span className="text-[10px] text-muted sm:hidden">
                      {dateFormatter.format(new Date(listing.buyerConfirmedAt!))}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
