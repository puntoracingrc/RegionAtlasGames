"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Trophy, X } from "lucide-react";
import { SellListingButton } from "@/components/sell-listing-button";
import { COLLECTION_CHANGED_EVENT } from "@/lib/collection-client-events";
import type { WishlistAchievement } from "@/lib/wishlist-model";
import { publishWishlistUnreadCount } from "@/lib/wishlist-client-state";

export function WishlistAchievementNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const dismissed = useRef(new Set<string>());
  const [achievements, setAchievements] = useState<WishlistAchievement[]>([]);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    let previousSales: string | null = null;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      const requestVersion = ++version;
      try {
        const response = await fetch("/api/user/wishlist", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && requestVersion === version) {
          setAchievements((data.achievements ?? []).filter((entry: WishlistAchievement) => !dismissed.current.has(entry.id)));
          publishWishlistUnreadCount(data.sales?.unreadGameCount ?? 0);
          const sales = JSON.stringify(data.sales?.games ?? []);
          if (previousSales !== null && previousSales !== sales && pathname === "/coleccion/deseados") router.refresh();
          previousSales = sales;
        }
      } catch { /* The saved notice remains available on the next visit. */ }
    }
    void refresh();
    window.addEventListener(COLLECTION_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      window.removeEventListener(COLLECTION_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [pathname, router]);

  useEffect(() => () => publishWishlistUnreadCount(0), []);

  const games = achievements.flatMap((entry) => entry.games);
  if (!games.length) return null;

  async function close() {
    setClosing(true);
    setError(null);
    try {
      const response = await fetch("/api/user/wishlist/acknowledge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: achievements.map((entry) => entry.id) }),
      });
      if (!response.ok) throw new Error("No se pudo cerrar el aviso. Inténtalo de nuevo.");
      const data = await response.json();
      achievements.forEach((entry) => dismissed.current.add(entry.id));
      setAchievements(data.achievements ?? []);
    } catch {
      setError("No se pudo cerrar el aviso. Inténtalo de nuevo.");
    } finally { setClosing(false); }
  }

  return createPortal(
    <aside className="fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-emerald-500/40 bg-white p-5 text-foreground shadow-2xl [.dark_&]:bg-slate-900" aria-label="Juego deseado conseguido">
      <button type="button" onClick={close} disabled={closing} aria-label="Cerrar aviso de juego conseguido" className="absolute right-2 top-2 rounded-md p-2 text-muted hover:bg-card-hover disabled:opacity-50"><X className="h-4 w-4" aria-hidden /></button>
      <div role="status" aria-live="polite" className="pr-5">
        <Trophy className="mb-2 h-6 w-6 text-emerald-600 [.dark_&]:text-emerald-400" aria-hidden />
        <p className="text-base font-bold leading-snug">¡Enhorabuena! {games.length === 1 ? "Has conseguido uno de tus juegos deseados." : `Has conseguido ${games.length} de tus juegos deseados.`}</p>
        <p className="mt-2 text-sm text-muted">{games.length === 1 ? games[0].title : `${games[0].title} y ${games.length - 1} más`} {games.length === 1 ? "ya está en tu colección." : "ya están en tu colección."}</p>
      </div>
      <div className="mt-4"><SellListingButton collectionItemId={games[0].collectionItemId} label="Vender uno como este" compact onCreated={close} /></div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-600 [.dark_&]:text-rose-300">{error}</p>}
    </aside>, document.body
  );
}
