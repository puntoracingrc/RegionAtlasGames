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
  isLoggedIn,
}: Props) {
  const [owned, setOwned] = useState(initialOwned);
  const [loading, setLoading] = useState(false);

  const buttonClass = cn(
    "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50",
    owned
      ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
      : "bg-accent text-accent-fg hover:opacity-90",
  );

  if (!isLoggedIn) {
    return (
      <Link href="/login" className={cn(buttonClass, "bg-accent text-accent-fg hover:opacity-90")}>
        Añadir a mi colección
      </Link>
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
      } else {
        const res = await fetch("/api/user/collection/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalogId }),
        });
        if (!res.ok) return;
        setOwned(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={loading} className={buttonClass}>
      {loading ? "…" : owned ? "Quitar de mi colección" : "Añadir a mi colección"}
    </button>
  );
}
