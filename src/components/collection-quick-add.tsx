"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  catalogId: string;
  owned: boolean;
  isLoggedIn: boolean;
  onChange?: (catalogId: string, owned: boolean, ownedCatalogIds?: string[]) => void;
  className?: string;
};

export function CollectionQuickAdd({
  catalogId,
  owned,
  isLoggedIn,
  onChange,
  className,
}: Props) {
  const [localOwned, setLocalOwned] = useState(owned);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalOwned(owned);
  }, [owned, catalogId]);

  async function handleAdd(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isLoggedIn || localOwned || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user/collection/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ownedCatalogIds?: string[];
      };

      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar");
        return;
      }

      setLocalOwned(true);
      const ids = Array.isArray(data.ownedCatalogIds)
        ? data.ownedCatalogIds.filter((id): id is string => typeof id === "string")
        : undefined;
      onChange?.(catalogId, true, ids);
    } finally {
      setLoading(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/70 text-sm font-bold text-accent shadow-md transition hover:border-accent/40 hover:bg-black/85",
          className,
        )}
        title="Inicia sesión para añadir a tu colección"
        aria-label="Inicia sesión para añadir a tu colección"
      >
        +
      </Link>
    );
  }

  if (localOwned) {
    return (
      <span
        className={cn(
          "pointer-events-none flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-600/90 text-white shadow-md",
          className,
        )}
        title="En tu colección (quitar desde la ficha del juego)"
        aria-label="En tu colección"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleAdd}
        disabled={loading}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 bg-black/75 text-base font-bold leading-none text-accent shadow-md transition hover:border-accent hover:bg-black/90 disabled:opacity-50",
          error && "border-rose-400/60",
        )}
        title={error ?? "Añadir a mi colección"}
        aria-label={error ?? "Añadir a mi colección"}
      >
        {loading ? "…" : "+"}
      </button>
    </span>
  );
}
