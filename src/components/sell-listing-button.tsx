"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  collectionItemId: string;
  openListingId?: string | null;
  label?: string;
  compact?: boolean;
  onCreated?: () => void | Promise<void>;
};

export function SellListingButton({
  collectionItemId,
  openListingId,
  label = "Poner en venta",
  compact = false,
  onCreated,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createListing() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/listings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionItemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existingListingId) {
          await onCreated?.();
          router.push(`/venta/${data.existingListingId}`);
          return;
        }
        setError(data.error ?? "Error al crear anuncio.");
        return;
      }
      await onCreated?.();
      router.push(`/venta/${data.listing.id}`);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (openListingId) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted">
          Esta copia ya tiene un anuncio abierto.
        </p>
        <Link
          href={`/venta/${openListingId}`}
          className="btn-primary mt-3 inline-flex"
        >
          Ver tu anuncio
        </Link>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "rounded-xl border border-border bg-card p-4"}>
      {!compact && <p className="text-sm text-muted">
        El anuncio quedará vinculado a esta copia de tu colección.
      </p>}
      <button
        type="button"
        onClick={createListing}
        disabled={loading}
        className={compact ? "btn-secondary w-full disabled:opacity-50" : "btn-primary mt-3 disabled:opacity-50"}
      >
        {loading ? "Creando…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
}
