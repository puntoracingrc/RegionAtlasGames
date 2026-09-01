"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CirclePlus,
  LoaderCircle,
  Pencil,
  Save,
  ShoppingBag,
  Trash2,
  XCircle,
} from "lucide-react";
import type { CollectionCondition, CollectionView } from "@/lib/types";
import type { ListingStatus } from "@/lib/marketplace-types";
import { formatEur } from "@/lib/price-format";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";

export type CollectionCopyListing = {
  id: string;
  collectionItemId: string;
  status: ListingStatus;
};

const CONDITION_OPTIONS: Array<{ value: CollectionCondition; label: string }> = [
  { value: "sealed", label: "Precintado" },
  { value: "complete", label: "Abierto y completo" },
  { value: "game-manual", label: "Juego + manual" },
  { value: "loose", label: "Solo juego" },
  { value: "unknown", label: "Sin indicar" },
];

function dateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function listingLabel(status: ListingStatus): string {
  return status === "active" ? "A la venta" : status === "draft" ? "Borrador" : "Cerrado";
}

export function CollectionCopiesManager({
  catalogId,
  initialItems,
  initialListings,
}: {
  catalogId: string;
  initialItems: CollectionView[];
  initialListings: CollectionCopyListing[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [listings, setListings] = useState(initialListings);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addCopy() {
    setAdding(true);
    setError(null);
    const response = await fetch("/api/user/collection/copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogId }),
    });
    const data = await response.json().catch(() => null) as { item?: CollectionView; error?: string } | null;
    setAdding(false);
    if (!response.ok || !data?.item) {
      setError(data?.error ?? "No se pudo añadir otra copia.");
      return;
    }
    setItems((current) => [...current, data.item!]);
    router.refresh();
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Tus copias</h2>
          <p className="mt-1 text-sm text-muted">
            {items.length} {items.length === 1 ? "copia" : "copias"}. Cada una tiene su propio
            estado, compra, notas y anuncio.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          disabled={adding}
          onClick={addCopy}
        >
          {adding ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CirclePlus className="h-4 w-4" aria-hidden />}
          Añadir otra copia
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="divide-y divide-border">
        {items.map((item, index) => (
          <CollectionCopyRow
            key={item.id}
            item={item}
            position={index + 1}
            listing={listings.find((listing) => listing.collectionItemId === item.id)}
            onSaved={(saved) => setItems((current) => current.map((entry) => entry.id === saved.id ? saved : entry))}
            onRemoved={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            onListingRemoved={(listingId) => setListings((current) => current.filter((entry) => entry.id !== listingId))}
          />
        ))}
      </div>
    </section>
  );
}

function CollectionCopyRow({
  item,
  position,
  listing,
  onSaved,
  onRemoved,
  onListingRemoved,
}: {
  item: CollectionView;
  position: number;
  listing?: CollectionCopyListing;
  onSaved: (item: CollectionView) => void;
  onRemoved: () => void;
  onListingRemoved: (listingId: string) => void;
}) {
  const router = useRouter();
  const [condition, setCondition] = useState<CollectionCondition>(
    item.sealed ? "sealed" : item.collectionCondition ?? "unknown",
  );
  const [buyPrice, setBuyPrice] = useState(item.buyPrice == null ? "" : String(item.buyPrice));
  const [purchasedAt, setPurchasedAt] = useState(dateInputValue(item.purchasedAt));
  const [addedAt, setAddedAt] = useState(dateInputValue(item.addedAt) || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [busy, setBusy] = useState<"save" | "sell" | "cancel" | "remove" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setFeedback(null);
    const response = await fetch("/api/user/collection/copies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        collectionCondition: condition,
        buyPrice,
        purchasedAt,
        addedAt,
        notes,
      }),
    });
    const data = await response.json().catch(() => null) as { item?: CollectionView; error?: string } | null;
    setBusy(null);
    if (!response.ok || !data?.item) {
      setFeedback({ tone: "error", text: data?.error ?? "No se pudieron guardar los cambios." });
      return;
    }
    onSaved(data.item);
    setFeedback({ tone: "success", text: "Juego actualizado." });
    router.refresh();
  }

  async function createListing() {
    if (listing) {
      router.push(`/venta/${listing.id}`);
      return;
    }
    setBusy("sell");
    setFeedback(null);
    const response = await fetch("/api/marketplace/listings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionItemId: item.id }),
    });
    const data = await response.json().catch(() => null) as {
      listing?: { id: string };
      existingListingId?: string;
      error?: string;
    } | null;
    setBusy(null);
    const listingId = data?.listing?.id ?? data?.existingListingId;
    if (listingId) {
      router.push(`/venta/${listingId}`);
      return;
    }
    setFeedback({ tone: "error", text: data?.error ?? "No se pudo crear el anuncio." });
  }

  async function cancel() {
    if (!listing) return;
    const isActive = listing.status === "active";
    const confirmed = confirm(
      isActive ? "¿Retirar este anuncio del mercado?" : "¿Descartar este borrador de venta?",
    );
    if (!confirmed) return;
    setBusy("cancel");
    setFeedback(null);
    const response = await fetch(`/api/marketplace/listings/${listing.id}/cancel`, { method: "POST" });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(null);
    if (!response.ok) {
      setFeedback({ tone: "error", text: data?.error ?? "No se pudo retirar el anuncio." });
      return;
    }
    onListingRemoved(listing.id);
    setFeedback({
      tone: "success",
      text: isActive
        ? "Anuncio retirado. El juego sigue en tu colección."
        : "Borrador descartado. El juego sigue en tu colección.",
    });
    router.refresh();
  }

  async function remove() {
    if (!confirm("¿Eliminar este juego de tu colección?")) return;
    setBusy("remove");
    setFeedback(null);
    const response = await fetch(`/api/user/collection/copies?itemId=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(null);
    if (!response.ok) {
      setFeedback({ tone: "error", text: data?.error ?? "No se pudo eliminar la copia." });
      return;
    }
    onRemoved();
    router.refresh();
  }

  const disabled = busy !== null;
  const activeListing = listing?.status === "active";
  const draftListing = listing?.status === "draft";
  const cover = getCoverSrc(item.coverUrl, item.catalogId ?? item.id);
  const title = decodeHtmlEntities(item.title);

  return (
    <article className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[48px_minmax(0,1fr)]">
      <div className="flex h-[58px] w-10 items-center justify-center overflow-hidden rounded-md border border-border bg-card sm:h-[66px] sm:w-12">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={`Portada de ${title}`}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        ) : (
          <span className="px-1 text-center text-[8px] uppercase text-muted">Sin portada</span>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">Juego {position}</h3>
            {listing ? (
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                activeListing
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}>
                {listingLabel(listing.status)}
              </span>
            ) : null}
            <span className="text-xs text-muted">Valor estimado: {formatEur(item.totalValue)}</span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:border-rose-400/40 hover:text-rose-600 disabled:opacity-50"
            title={listing ? "Cierra el anuncio antes de eliminar" : "Eliminar de mi colección"}
            aria-label={listing ? "Cierra el anuncio antes de eliminar" : "Eliminar de mi colección"}
            disabled={disabled || Boolean(listing)}
            onClick={remove}
          >
            {busy === "remove" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(170px,1.15fr)_minmax(125px,0.8fr)_minmax(145px,0.9fr)_minmax(145px,0.9fr)]">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted">Estado</span>
            <select
              className="input h-10 py-2 text-sm"
              value={condition}
              disabled={disabled || Boolean(listing)}
              title={listing ? "Cierra el anuncio para cambiar el estado" : undefined}
              onChange={(event) => setCondition(event.target.value as CollectionCondition)}
            >
              {CONDITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted">Precio de compra</span>
            <div className="relative">
              <input className="input h-10 pr-8 text-sm" type="number" min="0" max="1000000" step="0.01" value={buyPrice} disabled={disabled} placeholder="Sin indicar" onChange={(event) => setBuyPrice(event.target.value)} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">€</span>
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted">Fecha de compra</span>
            <input className="input h-10 text-sm" type="date" value={purchasedAt} disabled={disabled} onChange={(event) => setPurchasedAt(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted">Añadido a colección</span>
            <input className="input h-10 text-sm" type="date" value={addedAt} disabled={disabled} required onChange={(event) => setAddedAt(event.target.value)} />
          </label>
        </div>

        <label className="mt-2 block space-y-1">
          <span className="text-[11px] font-medium text-muted">Notas personales</span>
          <input className="input h-10 text-sm" value={notes} maxLength={1000} disabled={disabled} placeholder="Ej. Primera tirada, pequeño roce en la caja…" onChange={(event) => setNotes(event.target.value)} />
        </label>

        {feedback ? (
          <p role={feedback.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm ${feedback.tone === "error" ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {feedback.text}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary inline-flex h-9 items-center gap-2 px-3" disabled={disabled} onClick={save}>
            {busy === "save" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Guardar
          </button>
          {activeListing && listing ? (
            <>
              <Link href={`/venta/${listing.id}`} className="btn-primary inline-flex h-9 items-center gap-2 px-3">
                <Pencil className="h-4 w-4" aria-hidden />
                Editar anuncio
              </Link>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-400/30 px-3 text-sm text-rose-700 transition hover:border-rose-500/60 hover:bg-rose-500/5 dark:text-rose-300 disabled:opacity-50" disabled={disabled} onClick={cancel}>
                {busy === "cancel" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                Retirar de la venta
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary inline-flex h-9 items-center gap-2 px-3" disabled={disabled} onClick={createListing}>
                {busy === "sell" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
                Vender
              </button>
              {draftListing ? (
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-400/30 px-3 text-sm text-rose-700 transition hover:border-rose-500/60 hover:bg-rose-500/5 dark:text-rose-300 disabled:opacity-50" disabled={disabled} onClick={cancel}>
                  {busy === "cancel" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                  Descartar borrador
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
