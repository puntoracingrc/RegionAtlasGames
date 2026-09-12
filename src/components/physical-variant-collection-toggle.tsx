"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { notifyCollectionChanged } from "@/lib/collection-client-events";

type Props = {
  catalogId: string;
  physicalVariantId: string;
  label: string;
  initialOwnedCount: number;
  isLoggedIn: boolean;
  loginPath: string;
};

export function PhysicalVariantCollectionToggle({
  catalogId,
  physicalVariantId,
  label,
  initialOwnedCount,
  isLoggedIn,
  loginPath,
}: Props) {
  const router = useRouter();
  const [ownedCount, setOwnedCount] = useState(initialOwnedCount);
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy("add");
    setError(null);
    try {
      const response = await fetch("/api/user/collection/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId, physicalVariantId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la variante.");
      setOwnedCount(data.ownedCount);
      notifyCollectionChanged();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la variante.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const params = new URLSearchParams({ catalogId, physicalVariantId, mode: "one" });
      const response = await fetch(`/api/user/collection/items?${params.toString()}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo quitar la variante.");
      setOwnedCount(data.ownedCount);
      notifyCollectionChanged();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo quitar la variante.");
    } finally {
      setBusy(null);
    }
  }

  if (!isLoggedIn) {
    return (
      <Link href={loginPath} className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs">
        <Plus className="h-4 w-4" aria-hidden />
        Añadir esta variante
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={add}
          disabled={Boolean(busy)}
          className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs disabled:opacity-50"
          aria-label={`Añadir ${label} a mi colección`}
        >
          {ownedCount ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {busy === "add" ? "Guardando..." : ownedCount ? `Tengo ${ownedCount}` : "Añadir esta variante"}
        </button>
        {ownedCount ? (
          <button
            type="button"
            onClick={remove}
            disabled={Boolean(busy)}
            className="inline-flex min-h-10 items-center justify-center gap-1 px-2 text-xs font-semibold text-muted hover:text-foreground disabled:opacity-50"
            aria-label={`Quitar una copia de ${label}`}
          >
            <Minus className="h-4 w-4" aria-hidden />
            Quitar una
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
