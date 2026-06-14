"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  catalogId: string;
  initialOwned: boolean;
  ownedCount?: number;
  isLoggedIn: boolean;
};

export function CollectionToggle({
  catalogId,
  initialOwned,
  ownedCount = 0,
  isLoggedIn,
}: Props) {
  const router = useRouter();
  const [owned, setOwned] = useState(initialOwned);
  const [count, setCount] = useState(ownedCount);
  const [loading, setLoading] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Inicia sesión
          </Link>{" "}
          para añadir este juego a tu colección.
        </p>
      </div>
    );
  }

  async function toggle() {
    setLoading(true);
    try {
      if (owned) {
        const res = await fetch(`/api/user/collection/items?catalogId=${encodeURIComponent(catalogId)}`, {
          method: "DELETE",
        });
        if (!res.ok) return;
        setOwned(false);
        setCount(0);
      } else {
        const res = await fetch("/api/user/collection/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalogId }),
        });
        if (!res.ok) return;
        setOwned(true);
        setCount((c) => c + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition",
        owned
          ? "border-emerald-500/35 bg-emerald-500/10"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition",
            owned
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
              : "border-border bg-black/20 text-muted",
          )}
          aria-hidden
        >
          {owned ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <span className="text-lg leading-none">+</span>
          )}
        </span>
        <div>
          <p className={cn("text-sm font-medium", owned ? "text-emerald-100" : "text-foreground")}>
            {owned ? "En tu colección" : "No está en tu colección"}
          </p>
          {owned && count > 0 && (
            <p className="text-xs text-emerald-200/80">
              {count} entrada{count !== 1 ? "s" : ""} ·{" "}
              <Link href="/coleccion" className="underline underline-offset-2 hover:text-emerald-100">
                Ver colección
              </Link>
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={cn(
          "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50",
          owned
            ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
            : "bg-accent text-accent-fg hover:opacity-90",
        )}
      >
        {loading ? "…" : owned ? "Quitar" : "Añadir a mi colección"}
      </button>
    </div>
  );
}
