"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";
import { formatEurCents } from "@/lib/price-format";
import type { ChatMessage, MarketplaceConversation } from "@/lib/marketplace-types";
import type { MarketplaceListingClientView } from "@/lib/marketplace-types";

type Props = { conversationId: string; userId: string };

function formatMessageTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function ChatClient({ conversationId, userId }: Props) {
  const router = useRouter();
  const [conversation, setConversation] = useState<MarketplaceConversation | null>(null);
  const [listing, setListing] = useState<MarketplaceListingClientView | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const pendingMessageRef = useRef<{ body: string; id: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketplace/conversations/${conversationId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setConversation(data.conversation);
        setListing(data.listing);
        setSalePrice((current) => {
          if (current || data.listing?.askingPriceEur == null) return current;
          return String(data.listing.askingPriceEur);
        });
        if (Number(data.unreadCount ?? 0) > 0) {
          await fetch(`/api/marketplace/conversations/${conversationId}/read`, {
            method: "POST",
          }).catch(() => undefined);
          window.dispatchEvent(new Event("region-atlas:communications-changed"));
        }
      } else {
        setError(data.error ?? "No se pudo cargar el chat.");
      }
    } catch {
      setError("No se pudo cargar el chat.");
    }
  }, [conversationId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  async function send() {
    const message = text.trim();
    if (!message || sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    setError(null);
    const pending = pendingMessageRef.current?.body === message
      ? pendingMessageRef.current
      : { body: message, id: crypto.randomUUID() };
    pendingMessageRef.current = pending;
    try {
      const res = await fetch(`/api/marketplace/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          clientMutationId: pending.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar el mensaje.");
        return;
      }
      pendingMessageRef.current = null;
      setText((current) => (current.trim() === message ? "" : current));
      window.dispatchEvent(new Event("region-atlas:communications-changed"));
      void load();
    } catch {
      setError("No se pudo enviar el mensaje.");
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  async function sellerConfirmSale() {
    if (!listing || !conversation) return;
    const price = Number(salePrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Indica un precio final válido (mayor que 0 €).");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/marketplace/listings/${listing.id}/sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "seller-confirm",
        buyerId: conversation.buyerId,
        buyerName: conversation.buyerName,
        priceEur: price,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo registrar la venta.");
      return;
    }
    setSuccess(`Venta marcada a ${formatEurCents(price)}. Espera confirmación del comprador.`);
    void load();
    router.refresh();
  }

  async function buyerConfirmReceipt() {
    if (!listing) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/marketplace/listings/${listing.id}/sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buyer-confirm" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo confirmar la recepción.");
      return;
    }
    setSuccess(
      data.recorded
        ? "Venta cerrada y registrada en precios (privado)."
        : "Recepción ya estaba confirmada.",
    );
    void load();
  }

  async function blockPeer() {
    if (!confirm("¿Bloquear a este usuario? No podrá volver a escribirte en esta conversación.")) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/marketplace/conversations/${conversationId}/block`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo bloquear al usuario.");
      return;
    }
    setSuccess("Usuario bloqueado.");
    void load();
  }

  if (!conversation) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto max-w-2xl px-4 py-10 text-muted">
          {error ?? "Cargando chat…"}
        </main>
      </>
    );
  }

  const isSeller = conversation.sellerId === userId;
  const isBuyer = conversation.buyerId === userId;

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/venta/${conversation.listingId}`} className="text-muted hover:text-accent">
            ← Anuncio
          </Link>
          <Link href="/mensajes" className="text-muted hover:text-accent">
            Todos los mensajes
          </Link>
          <button
            type="button"
            className="text-muted transition hover:text-rose-600 dark:hover:text-rose-300"
            disabled={loading || Boolean(conversation.blockedByUserIds?.length)}
            onClick={blockPeer}
          >
            Bloquear usuario
          </button>
        </div>
        <header className="mt-4 mb-4">
          <h1 className="text-xl font-bold text-foreground">Chat de venta</h1>
          <p className="text-sm text-muted">
            {listing?.title && <span className="text-foreground">{listing.title} · </span>}
            {isSeller ? `Comprador: ${conversation.buyerName}` : `Vendedor: ${conversation.sellerName}`}
            {listing?.status === "active" && listing.askingPriceEur != null
              ? ` · ${formatEurCents(listing.askingPriceEur)}`
              : ""}
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">
            {success}
          </p>
        )}

        <Panel className="mb-4 max-h-[420px] space-y-3 overflow-y-auto">
          {conversation.messages.length === 0 && (
            <p className="text-sm text-muted">Aún no hay mensajes. Negociad el precio con respeto.</p>
          )}
          {conversation.messages.map((m: ChatMessage) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.senderId === userId
                  ? "ml-8 bg-accent/15 text-foreground"
                  : "mr-8 bg-card-hover text-foreground/85"
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-[10px] text-muted">
                <span className="uppercase">{m.senderName}</span>
                <span>
                  {formatMessageTime(m.createdAt)}
                  {m.senderId === userId && m.status
                    ? ` · ${m.status === "read" ? "Leído" : "Entregado"}`
                    : ""}
                </span>
              </div>
              <p>{m.body}</p>
            </div>
          ))}
        </Panel>

        {conversation.blockedByUserIds?.length ? (
          <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
            Esta conversación está bloqueada. Ya no se pueden enviar mensajes.
          </p>
        ) : (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribe un mensaje…"
            className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none"
          />
          <button type="button" className="btn-primary" disabled={loading} onClick={send}>
            Enviar
          </button>
        </div>
        )}

        {listing?.status === "active" && isSeller && (
          <Panel className="mt-6">
            <PanelTitle>Marcar como vendido</PanelTitle>
            <p className="mb-2 text-xs text-muted">
              El precio final es privado. Se incorporará de forma anónima a las estimaciones si el
              comprador confirma la recepción.
            </p>
            <input
              type="number"
              min={1}
              step={0.01}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="Precio acordado (€)"
              className="mb-2 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm"
            />
            <button type="button" className="btn-secondary" disabled={loading} onClick={sellerConfirmSale}>
              Vendido a {conversation.buyerName}
            </button>
          </Panel>
        )}

        {listing?.status === "sold" && !listing.buyerConfirmedAt && (
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Venta acordada
            {listing.recordedSalePriceEur != null &&
              ` · ${formatEurCents(listing.recordedSalePriceEur)}`}
            {isSeller
              ? " · Pendiente de confirmación del comprador."
              : " · Confirma cuando hayas recibido el juego."}
          </p>
        )}

        {listing?.status === "sold" && isBuyer && !listing.buyerConfirmedAt && (
          <Panel className="mt-6">
            <PanelTitle>Confirmar recepción</PanelTitle>
            <p className="mb-2 text-sm text-muted">
              Al confirmar, registramos el precio de forma anónima para mejorar las estimaciones del
              catálogo.
            </p>
            <button type="button" className="btn-primary" disabled={loading} onClick={buyerConfirmReceipt}>
              He recibido el juego
            </button>
          </Panel>
        )}

        {listing?.buyerConfirmedAt && (
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
            Venta cerrada
            {listing.recordedSalePriceEur != null &&
              ` · ${formatEurCents(listing.recordedSalePriceEur)}`}
          </p>
        )}
      </main>
    </>
  );
}
