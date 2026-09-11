"use client";

import { useSyncExternalStore } from "react";

let unread = 0;
const subscribers = new Set<() => void>();
const subscribe = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; };
export function publishWishlistUnreadCount(count: number) {
  const next = Math.max(0, Number(count) || 0);
  if (next === unread) return;
  unread = next;
  subscribers.forEach((listener) => listener());
}
export const useWishlistUnreadCount = () => useSyncExternalStore(subscribe, () => unread, () => 0);
