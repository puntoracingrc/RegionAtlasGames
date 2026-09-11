"use client";

import { useWishlistUnreadCount } from "@/lib/wishlist-client-state";

export function WishlistUnreadBadge({ dot = false }: { dot?: boolean }) {
  const count = useWishlistUnreadCount();
  if (!count) return null;
  return <span aria-label={`${count} ${count === 1 ? "deseado con anuncios nuevos" : "deseados con anuncios nuevos"}`} title="Nuevos anuncios en Region Atlas" className={dot ? "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-background" : "inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white"}>{!dot && (count > 99 ? "99+" : count)}</span>;
}
