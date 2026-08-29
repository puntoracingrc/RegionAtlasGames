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
  const [ownedOverride, setOwnedOverride] = useState<{
    catalogId: string;
    owned: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const localOwned = ownedOverride?.catalogId === catalogId ? ownedOverride.owned : owned;

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function handleAdd(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isLoggedIn || loading) return;

    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/user/collection/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        linkedExisting?: boolean;
        ownedCatalogIds?: string[];
      };

      if (!res.ok) {
        const message = data.error ?? "No se pudo guardar";
        setError(message);
        setFeedback("No se pudo añadir");
        return;
      }

      setOwnedOverride({ catalogId, owned: true });
      const ids = Array.isArray(data.ownedCatalogIds)
        ? data.ownedCatalogIds.filter((id): id is string => typeof id === "string")
        : undefined;
      onChange?.(catalogId, true, ids);
      setFeedback(data.linkedExisting ? "Ficha enlazada" : "Añadido");
    } catch {
      const message = "No se pudo conectar. Inténtalo de nuevo.";
      setError(message);
      setFeedback("Sin conexión");
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

  return (
    <span className={className ?? "relative"}>
      <button
        type="button"
        onClick={handleAdd}
        disabled={loading}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border bg-black/75 text-base font-bold leading-none shadow-md transition hover:bg-black/90 disabled:opacity-50",
          localOwned
            ? "border-emerald-400/60 text-emerald-300 hover:border-emerald-300"
            : "border-accent/40 text-accent hover:border-accent",
          error && "border-rose-400/60",
        )}
        title={error ?? (localOwned ? "Añadir otra copia" : "Añadir a mi colección")}
        aria-label={error ?? (localOwned ? "Añadir otra copia" : "Añadir a mi colección")}
      >
        {loading ? "…" : localOwned ? "+1" : "+"}
      </button>
      {feedback && (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "absolute right-0 top-9 z-20 w-max max-w-44 rounded-md border bg-black/90 px-2 py-1 text-xs font-medium shadow-lg",
            error ? "border-rose-400/60 text-rose-200" : "border-emerald-400/60 text-emerald-200",
          )}
        >
          {feedback}
        </span>
      )}
    </span>
  );
}
