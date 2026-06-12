"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserPlan } from "@/lib/marketplace-types";
import { canUseMarketplace } from "@/lib/plans";

type Props = {
  collectionItemId: string;
  plan: UserPlan;
  openListingId?: string | null;
};

export function SellListingButton({
  collectionItemId,
  plan,
  openListingId,
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
          router.push(`/venta/${data.existingListingId}`);
          return;
        }
        setError(data.error ?? "Error al crear anuncio.");
        return;
      }
      router.push(`/venta/${data.listing.id}`);
    } finally {
      setLoading(false);
    }
  }

  if (!canUseMarketplace(plan)) {
    return (
      <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm">
        <p className="text-violet-100">
          Vender y comprar requiere el plan <strong>Pro</strong>.
        </p>
        <Link href="/ajustes" className="mt-2 inline-block text-accent hover:underline">
          Ver planes →
        </Link>
      </div>
    );
  }

  if (openListingId) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted">
          Ya tienes un anuncio abierto para este juego (máx. 1 unidad por título).
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted">
        Solo puedes publicar un anuncio por juego en el catálogo.
      </p>
      <button
        type="button"
        onClick={createListing}
        disabled={loading}
        className="btn-primary mt-3 disabled:opacity-50"
      >
        {loading ? "Creando…" : "Poner en venta"}
      </button>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
