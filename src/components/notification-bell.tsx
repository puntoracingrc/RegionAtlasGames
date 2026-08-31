"use client";

import {
  Bell,
  CheckCheck,
  CircleAlert,
  Handshake,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  MarketplaceCommunicationSummary,
  MarketplaceNotification,
  MarketplaceNotificationKind,
} from "@/lib/marketplace-types";

type NotificationPayload = {
  notifications: MarketplaceNotification[];
  summary: MarketplaceCommunicationSummary;
};

const EMPTY_SUMMARY: MarketplaceCommunicationSummary = {
  unreadNotifications: 0,
  unreadMessages: 0,
};

function notificationIcon(kind: MarketplaceNotificationKind) {
  if (kind === "new_message") return MessageCircle;
  if (kind === "listing_approved") return ShieldCheck;
  if (kind === "listing_rejected") return CircleAlert;
  return Handshake;
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<MarketplaceNotification[]>([]);
  const [summary, setSummary] = useState<MarketplaceCommunicationSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as NotificationPayload;
      setNotifications(payload.notifications ?? []);
      setSummary(payload.summary ?? EMPTY_SUMMARY);
    } catch {
      // La campana no debe interferir con la navegación si la red falla.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const onCommunicationsChanged = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("region-atlas:communications-changed", onCommunicationsChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("region-atlas:communications-changed", onCommunicationsChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  async function markRead(notificationIds?: string[]) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationIds ? { notificationIds } : {}),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as { summary: MarketplaceCommunicationSummary };
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          !notification.readAt && (!notificationIds || notificationIds.includes(notification.id))
            ? { ...notification, readAt }
            : notification,
        ),
      );
      setSummary(payload.summary ?? EMPTY_SUMMARY);
      return true;
    } catch {
      return false;
    }
  }

  async function openNotification(notification: MarketplaceNotification) {
    if (!notification.readAt) await markRead([notification.id]);
    setOpen(false);
    router.push(notification.href);
  }

  const unread = Math.max(summary.unreadNotifications, summary.unreadMessages);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-card-hover"
        aria-label={
          unread > 0
            ? `${unread} ${unread === 1 ? "notificación" : "notificaciones"} sin leer`
            : "Notificaciones"
        }
        aria-expanded={open}
        title="Notificaciones"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void refresh();
        }}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Cerrar notificaciones"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">Notificaciones</p>
                {summary.unreadMessages > 0 && (
                  <p className="text-[11px] text-muted">
                    {summary.unreadMessages} mensaje{summary.unreadMessages === 1 ? "" : "s"} pendiente{summary.unreadMessages === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              {summary.unreadNotifications > 0 && (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-card-hover hover:text-foreground"
                  title="Marcar todo como leído"
                  aria-label="Marcar todo como leído"
                  onClick={() => void markRead()}
                >
                  <CheckCheck className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Cargando...</p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No tienes avisos.</p>
              ) : (
                notifications.map((notification) => {
                  const Icon = notificationIcon(notification.kind);
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      className={`flex w-full items-start gap-3 border-b border-border/70 px-3 py-3 text-left transition last:border-b-0 hover:bg-card-hover ${
                        notification.readAt ? "" : "bg-accent/10"
                      }`}
                      onClick={() => void openNotification(notification)}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-accent">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm text-foreground ${notification.readAt ? "font-medium" : "font-bold"}`}>
                          {notification.title}
                        </span>
                        {notification.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {notification.body}
                          </span>
                        )}
                        <time className="mt-1 block text-[10px] text-muted">
                          {formatWhen(notification.createdAt)}
                        </time>
                      </span>
                      {!notification.readAt && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Sin leer" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <Link
              href="/notificaciones"
              className="block border-t border-border px-3 py-2.5 text-center text-xs font-medium text-accent transition hover:bg-card-hover"
              onClick={() => setOpen(false)}
            >
              Ver todas
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
