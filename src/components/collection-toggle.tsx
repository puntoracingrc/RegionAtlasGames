"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShareGameButton } from "@/components/share-game-button";
import { MascotToast } from "@/components/mascot-toast";
import { SITE_DEFAULT_URL } from "@/lib/site-brand";
import { Check, Heart, Plus, Tag } from "lucide-react";
import { cn } from "@/lib/cn";
import { collectionCatalogPath } from "@/lib/collection-path";
import { notifyCollectionChanged } from "@/lib/collection-client-events";
import { getConsoleMascotPhrase } from "@/lib/console-mascots";

type Props = {
  catalogId: string;
  gameTitle?: string;
  initialOwned: boolean;
  ownedCount?: number;
  initialWished?: boolean;
  initialCollectionItemId?: string;
  isLoggedIn: boolean;
  gamePath: string;
  platformSlug: string;
};

type AddResult = { item: { id: string }; ownedCount: number; wishlistAchieved?: boolean };

export function CollectionToggle({ catalogId, gameTitle, initialOwned, ownedCount = initialOwned ? 1 : 0, initialWished = false, initialCollectionItemId, isLoggedIn, gamePath, platformSlug }: Props) {
  const router = useRouter();
  const [count, setCount] = useState(ownedCount);
  const [wished, setWished] = useState(initialWished);
  const [itemId, setItemId] = useState(initialCollectionItemId);
  const [busy, setBusy] = useState<"add" | "remove" | "wish" | "sell" | null>(null);
  const [preparingSale, setPreparingSale] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [mascotMessage, setMascotMessage] = useState<string | null>(null);
  const owned = count > 0;
  const loginPath = `/login?next=${encodeURIComponent(gamePath)}`;
  const actionClass = "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-center text-xs font-semibold leading-5 transition disabled:opacity-50 sm:text-sm";

  useEffect(() => {
    if (!mascotMessage) return;
    const timeout = window.setTimeout(() => setMascotMessage(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [mascotMessage]);

  async function requestAdd(): Promise<AddResult> {
    const response = await fetch("/api/user/collection/items", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogId }),
    });
    const data = await response.json();
    if (!response.ok || !data.item?.id) throw new Error(data.error ?? "No se pudo guardar en tu colección.");
    setCount(data.ownedCount);
    setItemId(data.item.id);
    setWished(false);
    notifyCollectionChanged();
    return data;
  }

  async function add() {
    setBusy("add"); setFeedback(null); setMascotMessage(null);
    try {
      const data = await requestAdd();
      if (!data.wishlistAchieved) {
        setFeedback({ text: `${gameTitle ?? "Juego"} añadido a tu colección.` });
        setMascotMessage(getConsoleMascotPhrase(platformSlug, owned ? "duplicate-game" : "add-game", `${catalogId}:${data.ownedCount}`));
      }
      router.refresh();
    } catch (error) { setFeedback({ text: error instanceof Error ? error.message : "No se pudo conectar. Inténtalo de nuevo.", error: true }); }
    finally { setBusy(null); }
  }

  async function toggleWish() {
    setBusy("wish"); setFeedback(null);
    try {
      const response = await fetch("/api/user/wishlist", {
        method: wished ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar en tus deseados.");
      setWished(data.wished);
      notifyCollectionChanged();
      setFeedback({ text: data.wished ? "Guardado en Mis deseados." : "Quitado de Mis deseados." });
      router.refresh();
    } catch (error) { setFeedback({ text: error instanceof Error ? error.message : "No se pudo conectar. Inténtalo de nuevo.", error: true }); }
    finally { setBusy(null); }
  }

  async function removeOne() {
    setBusy("remove"); setFeedback(null);
    try {
      const response = await fetch(`/api/user/collection/items?catalogId=${encodeURIComponent(catalogId)}&mode=one`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo quitar la copia.");
      setCount(data.ownedCount);
      setItemId(undefined);
      setFeedback({ text: data.ownedCount ? `Te quedan ${data.ownedCount} copias en tu colección.` : "Juego quitado de tu colección." });
      setMascotMessage(getConsoleMascotPhrase(platformSlug, "remove-game", `${catalogId}:${data.ownedCount}`));
      notifyCollectionChanged();
      router.refresh();
    } catch (error) { setFeedback({ text: error instanceof Error ? error.message : "No se pudo conectar. Inténtalo de nuevo.", error: true }); }
    finally { setBusy(null); }
  }

  async function sell() {
    if (!owned && !preparingSale) { setPreparingSale(true); setFeedback(null); return; }
    if (owned && (count > 1 || !itemId)) { router.push(collectionCatalogPath(catalogId)); return; }
    setBusy("sell"); setFeedback(null);
    try {
      const copyId = owned ? itemId : (await requestAdd()).item.id;
      const response = await fetch("/api/marketplace/listings/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionItemId: copyId }),
      });
      const data = await response.json();
      const listingId = data.existingListingId ?? data.listing?.id;
      if (!listingId) throw new Error(data.error ?? "No se pudo preparar el anuncio.");
      router.push(`/venta/${encodeURIComponent(listingId)}`);
    } catch (error) { setFeedback({ text: error instanceof Error ? error.message : "No se pudo conectar. Inténtalo de nuevo.", error: true }); }
    finally { setBusy(null); }
  }

  return <section aria-label={`Acciones de ${gameTitle ?? "este juego"}`} className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      {isLoggedIn ? <>
        <button type="button" onClick={add} disabled={Boolean(busy)} className={cn(actionClass, owned ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 [.dark_&]:text-emerald-100" : "bg-accent text-accent-fg hover:opacity-90")}>
          {owned ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Plus className="h-4 w-4 shrink-0" aria-hidden />}
          {busy === "add" ? "Guardando…" : owned ? "Añadir otra copia" : "Añadir a mi colección"}
        </button>
        <button type="button" onClick={toggleWish} aria-pressed={wished} disabled={Boolean(busy) || owned} title={owned ? "Este juego ya está en tu colección" : undefined} className={cn(actionClass, "border", wished ? "border-rose-400/50 bg-rose-500/10 text-rose-700 [.dark_&]:text-rose-200" : "border-border bg-card text-foreground hover:bg-card-hover")}>
          <Heart aria-hidden className={cn("h-4 w-4 shrink-0", wished && "fill-current")} />
          {busy === "wish" ? "Guardando…" : wished ? "En mis deseados" : "Añadir a deseados"}
        </button>
      </> : <>
        <Link href={loginPath} className={cn(actionClass, "bg-accent text-accent-fg hover:opacity-90")}><Plus aria-hidden className="h-4 w-4 shrink-0" />Añadir a mi colección</Link>
        <Link href={loginPath} className={cn(actionClass, "border border-border bg-card text-foreground hover:bg-card-hover")}><Heart aria-hidden className="h-4 w-4 shrink-0" />Añadir a deseados</Link>
      </>}
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
    {isLoggedIn ? <button type="button" onClick={sell} disabled={Boolean(busy)} className="btn-secondary inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-2 px-3 text-xs sm:text-sm disabled:opacity-50"><Tag aria-hidden className="h-4 w-4" />{busy === "sell" ? "Preparando anuncio…" : "Vender uno como este"}</button> : <Link href={loginPath} className="btn-secondary inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-2 px-3 text-xs sm:text-sm"><Tag aria-hidden className="h-4 w-4" />Vender uno como este</Link>}
      <ShareGameButton title={gameTitle ?? "Juego en Region Atlas"} url={new URL(gamePath, SITE_DEFAULT_URL).toString()} />
    </div>
    {preparingSale && !owned && <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <p className="leading-6 text-muted">Para venderlo guardaremos una copia en tu colección. Después podrás indicar su estado, fotos y precio antes de publicar el anuncio.</p>
      <button type="button" onClick={sell} disabled={Boolean(busy)} className="btn-primary mt-3 w-full disabled:opacity-50">Guardar copia y preparar anuncio</button>
      <button type="button" onClick={() => setPreparingSale(false)} disabled={Boolean(busy)} className="mt-3 w-full text-sm text-muted hover:text-foreground">Cancelar</button>
    </div>}
    {owned && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><Link href={collectionCatalogPath(catalogId)} className="font-medium text-accent hover:underline">Gestionar {count === 1 ? "mi copia" : `mis ${count} copias`}</Link><button type="button" onClick={removeOne} disabled={Boolean(busy)} className="py-1 hover:text-foreground disabled:opacity-50">{count === 1 ? "Quitar de mi colección" : "Quitar una copia"}</button></div>}
    {feedback && <p role={feedback.error ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm", feedback.error ? "bg-rose-500/10 text-rose-700 [.dark_&]:text-rose-300" : "bg-emerald-500/10 text-emerald-800 [.dark_&]:text-emerald-200")}>{feedback.text}</p>}
    {mascotMessage && <MascotToast platformSlug={platformSlug} message={mascotMessage} detail={gameTitle} onClose={() => setMascotMessage(null)} />}
  </section>;
}
