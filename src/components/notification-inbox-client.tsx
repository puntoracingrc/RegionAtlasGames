"use client";

import {
  CheckCheck,
  CircleAlert,
  Handshake,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  MarketplaceCommunicationSummary,
  MarketplaceNotification,
  MarketplaceNotificationKind,
} from "@/lib/marketplace-types";

type Props = {
  initialNotifications: MarketplaceNotification[];
  initialSummary: MarketplaceCommunicationSummary;
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
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function NotificationInboxClient({
  initialNotifications,
  initialSummary,
}: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [summary, setSummary] = useState(initialSummary);
  const [saving, setSaving] = useState(false);

  async function markRead(notificationIds?: string[]) {
    setSaving(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationIds ? { notificationIds } : {}),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        summary: MarketplaceCommunicationSummary;
      };
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          !notification.readAt && (!notificationIds || notificationIds.includes(notification.id))
            ? { ...notification, readAt }
            : notification,
        ),
      );
      setSummary(payload.summary);
      window.dispatchEvent(new Event("region-atlas:communications-changed"));
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openNotification(notification: MarketplaceNotification) {
    if (!notification.readAt) await markRead([notification.id]);
    router.push(notification.href);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notificaciones</h1>
          <p className="mt-1 text-sm text-muted">
            {summary.unreadNotifications === 0 && summary.unreadMessages === 0
              ? "Estás al día."
              : summary.unreadNotifications > 0
                ? `${summary.unreadNotifications} aviso${summary.unreadNotifications === 1 ? "" : "s"} sin leer.`
                : `${summary.unreadMessages} mensaje${summary.unreadMessages === 1 ? "" : "s"} pendiente${summary.unreadMessages === 1 ? "" : "s"}.`}
          </p>
        </div>
        {summary.unreadNotifications > 0 ? (
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={saving}
            onClick={() => void markRead()}
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Marcar todo como leído
          </button>
        ) : summary.unreadMessages > 0 ? (
          <Link href="/mensajes" className="btn-secondary inline-flex items-center gap-2">
            <MessageCircle className="h-4 w-4" aria-hidden />
            Ver mensajes pendientes
          </Link>
        ) : null}
      </header>

      {notifications.length === 0 ? (
        <p className="border-y border-border py-10 text-center text-sm text-muted">
          Todavía no tienes notificaciones.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {notifications.map((notification) => {
            const Icon = notificationIcon(notification.kind);
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 px-2 py-4 text-left transition hover:bg-card-hover md:px-3 ${
                    notification.readAt ? "" : "bg-accent/10"
                  }`}
                  onClick={() => void openNotification(notification)}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm text-foreground ${notification.readAt ? "font-medium" : "font-bold"}`}>
                      {notification.title}
                    </span>
                    {notification.body && (
                      <span className="mt-1 block text-sm text-muted">{notification.body}</span>
                    )}
                    <time className="mt-1.5 block text-xs text-muted">
                      {formatWhen(notification.createdAt)}
                    </time>
                  </span>
                  {!notification.readAt && (
                    <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Sin leer" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
