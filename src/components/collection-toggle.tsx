"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MascotToast } from "@/components/mascot-toast";
import { cn } from "@/lib/cn";
import { getConsoleMascot } from "@/lib/console-mascots";

type Props = {
  catalogId: string;
  gameTitle?: string;
  initialOwned: boolean;
  ownedCount?: number;
  isLoggedIn: boolean;
  platformName?: string;
  platformSlug: string;
};

export function CollectionToggle({
  catalogId,
  gameTitle,
  initialOwned,
  ownedCount = initialOwned ? 1 : 0,
  isLoggedIn,
  platformName,
  platformSlug,
}: Props) {
  const [owned, setOwned] = useState(initialOwned);
  const [count, setCount] = useState(ownedCount);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    detail?: string;
    tone?: "success" | "info" | "warning";
  } | null>(null);
  const mascot = getConsoleMascot(platformSlug);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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
      const res = await fetch("/api/user/collection/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        ownedCount?: number;
      } | null;
      if (!res.ok) {
        setToast({
          message: "No he podido guardarlo.",
          detail: payload?.error ?? "Prueba otra vez en unos segundos.",
          tone: "warning",
        });
        return;
      }
      const nextCount = typeof payload?.ownedCount === "number" ? payload.ownedCount : count + 1;
      setOwned(true);
      setCount(nextCount);
      setToast({
        message: owned ? "Otra copia añadida." : "¡Juegazo guardado!",
        detail: gameTitle
          ? `${gameTitle}: ${nextCount} ${nextCount === 1 ? "copia" : "copias"} en tu colección.`
          : platformName
            ? `Nueva pieza para tu colección de ${platformName}.`
            : undefined,
        tone: "success",
      });
    } finally {
      setLoading(false);
    }
  }

  async function removeOneCopy() {
    if (!owned) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/user/collection/items?catalogId=${encodeURIComponent(catalogId)}&mode=one`,
        { method: "DELETE" },
      );
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        owned?: boolean;
        ownedCount?: number;
      } | null;
      if (!res.ok) {
        setToast({
          message: "No he podido quitar la copia.",
          detail: payload?.error ?? "Prueba otra vez en unos segundos.",
          tone: "warning",
        });
        return;
      }
      const nextCount = typeof payload?.ownedCount === "number" ? payload.ownedCount : Math.max(0, count - 1);
      setCount(nextCount);
      setOwned(nextCount > 0);
      setToast({
        message: nextCount > 0 ? "He quitado una copia." : "Juego retirado de tu colección.",
        detail:
          nextCount > 0
            ? `${nextCount} ${nextCount === 1 ? "copia queda" : "copias quedan"} en tu colección.`
            : gameTitle
              ? `${gameTitle} ya no figura en tu colección.`
              : undefined,
        tone: nextCount > 0 ? "info" : "warning",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggle} disabled={loading} className={buttonClass}>
          {loading
            ? "…"
            : owned
              ? `Añadir otra copia${count > 1 ? ` · ${count} copias` : ""}`
              : "Añadir a mi colección"}
        </button>
        {owned && (
          <button
            type="button"
            onClick={removeOneCopy}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-card-hover hover:text-foreground disabled:opacity-50"
          >
            {count > 1 ? "Quitar una copia" : "Quitar de mi colección"}
          </button>
        )}
      </div>
      {toast && mascot && (
        <MascotToast
          mascotSrc={mascot.src}
          mascotLabel={mascot.label}
          message={toast.message}
          detail={toast.detail}
          tone={toast.tone}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
