"use client";

import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";
import { listingStatusLabel } from "@/lib/marketplace-ui";

export type InboxConversation = {
  id: string;
  listingId: string;
  catalogId: string;
  title: string;
  listingStatus: string | null;
  role: "seller" | "buyer";
  peerName: string;
  messageCount: number;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string;
  updatedAt: string;
};

type Props = {
  conversations: InboxConversation[];
};

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function MessagesInboxClient({ conversations }: Props) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Mensajes</h1>
          <p className="text-sm text-muted">
            Conversaciones de compraventa. Negociad el precio y cerrad la venta desde el chat.
          </p>
        </header>

        {conversations.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted">
              No tienes conversaciones aún. Busca un juego en el catálogo con «En venta» y pulsa
              «Ver fotos y contactar».
            </p>
          </Panel>
        ) : (
          <ul className="space-y-2">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/chat/${conv.id}`}
                  className={`block rounded-lg border px-4 py-3 transition hover:border-accent/40 hover:bg-card-hover ${
                    conv.unreadCount > 0
                      ? "border-accent/35 bg-accent/8"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className={`truncate text-foreground ${conv.unreadCount > 0 ? "font-bold" : "font-medium"}`}>
                          {conv.title}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-fg">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {conv.role === "seller" ? "Comprador" : "Vendedor"}: {conv.peerName}
                        {conv.listingStatus
                          ? ` · Anuncio ${listingStatusLabel(conv.listingStatus as "draft" | "active" | "sold" | "cancelled").toLowerCase()}`
                          : ""}
                      </p>
                      {conv.lastMessage && (
                        <p className="mt-2 truncate text-sm text-muted">{conv.lastMessage}</p>
                      )}
                    </div>
                    <time className="shrink-0 text-[10px] text-muted">
                      {formatWhen(conv.lastMessageAt)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Panel className="mt-8">
          <PanelTitle>Vender</PanelTitle>
          <p className="text-sm text-muted">
            ¿Tienes anuncios abiertos?{" "}
            <Link href="/mis-anuncios" className="text-accent hover:underline">
              Ir a mis anuncios →
            </Link>
          </p>
        </Panel>
      </main>
    </>
  );
}
