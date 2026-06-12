"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";
import { formatEur } from "@/lib/catalog";
import type { ChatMessage, MarketplaceConversation } from "@/lib/marketplace-types";
import type { MarketplaceListing } from "@/lib/marketplace-types";

type Props = { conversationId: string; userId: string };

export function ChatClient({ conversationId, userId }: Props) {
  const router = useRouter();
  const [conversation, setConversation] = useState<MarketplaceConversation | null>(null);
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/marketplace/conversations/${conversationId}`);
    const data = await res.json();
    if (res.ok) {
      setConversation(data.conversation);
      setListing(data.listing);
    } else {
      setError(data.error ?? "No se pudo cargar el chat.");
    }
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  async function send() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/marketplace/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar el mensaje.");
      return;
    }
    setText("");
    load();
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
    setSuccess(`Venta marcada a ${formatEur(price)}. Espera confirmación del comprador.`);
    load();
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
    load();
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
        </div>
        <header className="mt-4 mb-4">
          <h1 className="text-xl font-bold text-foreground">Chat de venta</h1>
          <p className="text-sm text-muted">
            {listing?.title && <span className="text-foreground">{listing.title} · </span>}
            {isSeller ? `Comprador: ${conversation.buyerName}` : `Vendedor: ${conversation.sellerName}`}
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
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
                  : "mr-8 bg-card-hover text-muted"
              }`}
            >
              <p className="text-[10px] uppercase text-muted">{m.senderName}</p>
              <p>{m.body}</p>
            </div>
          ))}
        </Panel>

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
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

        {listing?.status === "active" && isSeller && (
          <Panel className="mt-6">
            <PanelTitle>Marcar como vendido</PanelTitle>
            <p className="mb-2 text-xs text-muted">
              Precio final privado — mejora las estimaciones del catálogo si el comprador confirma
              recepción (Fase 6).
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
          <p className="mt-4 text-sm text-emerald-300">
            Venta cerrada
            {listing.recordedSalePriceEur != null && ` · ${formatEur(listing.recordedSalePriceEur)}`}
          </p>
        )}
      </main>
    </>
  );
}
