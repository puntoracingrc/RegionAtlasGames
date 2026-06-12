"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { Panel } from "@/components/ui";
import { formatEur } from "@/lib/catalog";
import type { MarketplaceListing } from "@/lib/marketplace-types";
import { LISTING_STATUS_HINTS, listingStatusLabel } from "@/lib/marketplace-ui";

type Props = {
  listings: MarketplaceListing[];
};

export function MyListingsClient({ listings }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(listings);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function cancelListing(id: string) {
    if (!confirm("¿Retirar este anuncio del mercado?")) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/marketplace/listings/${id}/cancel`, { method: "POST" });
    const data = await res.json();
    setLoadingId(null);
    if (!res.ok) {
      setError(data.error ?? "No se pudo cancelar.");
      return;
    }
    setItems((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: "cancelled" as const } : l)),
    );
    router.refresh();
  }

  const open = items.filter((l) => l.status === "draft" || l.status === "active");
  const closed = items.filter((l) => l.status === "sold" || l.status === "cancelled");

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Mis anuncios</h1>
          <p className="text-sm text-muted">
            Gestiona borradores, anuncios publicados y ventas. Máximo 1 anuncio abierto por juego.
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        {open.length === 0 && closed.length === 0 && (
          <Panel>
            <p className="text-sm text-muted">
              Aún no tienes anuncios. Ve a{" "}
              <Link href="/coleccion" className="text-accent hover:underline">
                tu colección
              </Link>{" "}
              y pulsa «Poner en venta» en un juego enlazado al catálogo.
            </p>
          </Panel>
        )}

        {open.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Activos</h2>
            <ul className="space-y-3">
              {open.map((listing) => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  loading={loadingId === listing.id}
                  onCancel={() => cancelListing(listing.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {closed.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Historial</h2>
            <ul className="space-y-3">
              {closed.map((listing) => (
                <ListingRow key={listing.id} listing={listing} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function ListingRow({
  listing,
  loading,
  onCancel,
}: {
  listing: MarketplaceListing;
  loading?: boolean;
  onCancel?: () => void;
}) {
  const canManage = listing.status === "draft" || listing.status === "active";
  const price =
    listing.aiAnalysis?.estimatedPriceEur ??
    listing.recordedSalePriceEur ??
    null;

  return (
    <li className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/venta/${listing.id}`}
            className="font-medium text-foreground hover:text-accent"
          >
            {listing.title}
          </Link>
          <p className="mt-1 text-xs text-muted">
            {listing.region}
            {listing.sealed ? " · Precintado" : ""}
            {price != null ? ` · ~${formatEur(price)}` : ""}
          </p>
          <p className="mt-1 text-xs">
            <span className="font-medium text-accent">{listingStatusLabel(listing.status)}</span>
            <span className="text-muted"> — {LISTING_STATUS_HINTS[listing.status]}</span>
          </p>
          {listing.status === "sold" && listing.soldToUserName && (
            <p className="mt-1 text-xs text-muted">
              Vendido a {listing.soldToUserName}
              {listing.recordedSalePriceEur != null &&
                ` · ${formatEur(listing.recordedSalePriceEur)}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Link href={`/venta/${listing.id}`} className="btn-secondary text-xs">
                Gestionar
              </Link>
              {onCancel && (
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                  disabled={loading}
                  onClick={onCancel}
                >
                  {loading ? "…" : "Retirar"}
                </button>
              )}
            </>
          )}
          {listing.status === "sold" && (
            <Link href={`/mensajes`} className="btn-secondary text-xs">
              Ver chats
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
