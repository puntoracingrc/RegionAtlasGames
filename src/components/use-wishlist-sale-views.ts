"use client";

import { useEffect, useState, type RefObject } from "react";
import { notifyCollectionChanged } from "@/lib/collection-client-events";
import { publishWishlistUnreadCount } from "@/lib/wishlist-client-state";
import type { WishlistSaleUpdate } from "@/lib/wishlist-sales";

/** A notice is read only after its card is actually visible, never during SSR or prefetch. */
export function useWishlistSaleViews(root: RefObject<HTMLDivElement | null>, updates: WishlistSaleUpdate[]) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const signature = JSON.stringify(updates.filter((game) => game.unseenListingKeys.length).map((game) => ({ catalogId: game.catalogId, listingKeys: game.unseenListingKeys.slice(0, 500) })));

  useEffect(() => {
    const views = JSON.parse(signature) as { catalogId: string; listingKeys: string[] }[];
    if (!root.current || !views.length) return;
    const byGame = new Map(views.map((view) => [view.catalogId, view]));
    const pending = new Map<string, typeof views[number]>();
    const timers = new Map<Element, number>();
    const controller = new AbortController();
    let flushTimer: number | undefined;

    async function flush() {
      const batch = [...pending.values()];
      pending.clear();
      if (!batch.length) return;
      try {
        const response = await fetch("/api/user/wishlist/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ views: batch }), signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (controller.signal.aborted) return;
        setSeen((previous) => new Set([...previous, ...batch.flatMap((view) => view.listingKeys)]));
        publishWishlistUnreadCount(data.sales.unreadGameCount);
        notifyCollectionChanged();
      } catch { /* Keep the unread marker if the acknowledgement did not arrive. */ }
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (timers.has(target)) window.clearTimeout(timers.get(target));
        timers.delete(target);
        const view = byGame.get(target.dataset.wishlistCatalogId ?? "");
        if (!view || !entry.isIntersecting || entry.intersectionRatio < 0.5 || document.visibilityState !== "visible") continue;
        timers.set(target, window.setTimeout(() => {
          timers.delete(target);
          if (document.visibilityState !== "visible" || !target.isConnected) return;
          pending.set(view.catalogId, view);
          if (flushTimer) window.clearTimeout(flushTimer);
          flushTimer = window.setTimeout(flush, 100);
          observer.unobserve(target);
        }, 1800));
      }
    }, { threshold: 0.5 });

    function observe() {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      if (document.visibilityState === "visible") root.current?.querySelectorAll("[data-wishlist-catalog-id]").forEach((card) => observer.observe(card));
    }
    observe();
    document.addEventListener("visibilitychange", observe);
    window.addEventListener("focus", observe);
    return () => {
      controller.abort(); observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      if (flushTimer) window.clearTimeout(flushTimer);
      document.removeEventListener("visibilitychange", observe);
      window.removeEventListener("focus", observe);
    };
  }, [root, signature]);

  return seen;
}
