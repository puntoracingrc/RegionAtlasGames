"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Check, Heart, Trash2 } from "lucide-react";
import { CoverArt } from "@/components/cover-art";
import { RegionFlag } from "@/components/region-flag";
import { notifyCollectionChanged } from "@/lib/collection-client-events";
import { useWishlistSaleViews } from "@/components/use-wishlist-sale-views";

export type WishlistCard = { catalogId: string; title: string; href: string; coverSrc: string | null; platformSlug: string; platformName: string; region: string; addedAt: string; listingCount: number; unseenListingKeys: string[] };

export function WishlistGrid({ games }: { games: WishlistCard[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const visible = games.filter((game) => `${game.title} ${game.platformName} ${game.region}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));

  const pageCount = Math.max(1, Math.ceil(visible.length / 24));
  const safePage = Math.min(page, pageCount);
  const pageGames = visible.slice((safePage - 1) * 24, safePage * 24);
  const seenListingKeys = useWishlistSaleViews(root, pageGames);

  async function change(catalogId: string, acquire: boolean) {
    setBusy(catalogId);
    setError(null);
    try {
      const response = await fetch(acquire ? "/api/user/collection/items" : "/api/user/wishlist", {
        method: acquire ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo actualizar la lista.");
      notifyCollectionChanged();
      startTransition(() => router.refresh());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo conectar. Inténtalo de nuevo."); }
    finally { setBusy(null); }
  }

  if (!games.length) return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <Heart aria-hidden className="mx-auto mb-4 h-9 w-9 text-accent" />
      <h2 className="text-lg font-bold">Tu próxima joya empieza aquí</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Guarda los juegos que quieres conseguir desde su ficha. Cuando los añadas a tu colección, saldrán de esta lista.</p>
      <Link href="/plataformas" className="btn-primary mt-5 inline-flex">Explorar juegos</Link>
    </div>
  );

  return <div className="space-y-5">
    <label className="block max-w-lg text-sm font-medium">Buscar en mis deseados<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Juego, plataforma o región…" className="mt-2 block w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-accent" /></label>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 [.dark_&]:text-rose-300">{error}</p>}
    <div ref={root} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {pageGames.map((game) => <article key={game.catalogId} data-wishlist-catalog-id={game.catalogId} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4">
        {game.unseenListingKeys.some((key) => !seenListingKeys.has(key)) && <span className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800 [.dark_&]:bg-rose-950 [.dark_&]:text-rose-200"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-600" />Nuevo en venta</span>}
        <Link href={game.href} className="block"><CoverArt src={game.coverSrc} alt={game.title} platformSlug={game.platformSlug} className="mx-auto max-w-[180px]" /><h2 className="mt-3 text-base font-bold leading-snug hover:text-accent">{game.title}</h2></Link>
        <p className="mt-2 text-xs text-muted">{game.platformName}</p>
        <div className="mb-4 mt-1 text-xs"><RegionFlag region={game.region} size="sm" showLabel /></div>
        {game.listingCount > 0 && <Link href={`${game.href}#ofertas`} className="mb-4 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs font-semibold leading-5 text-accent hover:bg-accent/10">{game.listingCount === 1 ? "1 anuncio en Region Atlas" : `${game.listingCount} anuncios en Region Atlas`}<span className="block font-normal">Ver en la ficha del juego →</span></Link>}
        <div className="mt-auto flex gap-2">
          <button type="button" onClick={() => change(game.catalogId, true)} disabled={Boolean(busy) || refreshing} className="btn-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2 disabled:opacity-50"><Check aria-hidden className="h-4 w-4" />{busy === game.catalogId ? "Guardando…" : "Ya lo tengo"}</button>
          <button type="button" onClick={() => change(game.catalogId, false)} disabled={Boolean(busy) || refreshing} aria-label={`Quitar ${game.title} de mis deseados`} className="rounded-lg border border-border px-3 text-muted transition hover:bg-card-hover hover:text-foreground disabled:opacity-50"><Trash2 aria-hidden className="h-4 w-4" /></button>
        </div>
      </article>)}
    </div>
    {pageCount > 1 && <nav aria-label="Páginas de deseados" className="flex items-center justify-center gap-3 text-sm"><button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="btn-secondary disabled:opacity-40">Anterior</button><span>Página {safePage} de {pageCount}</span><button type="button" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} className="btn-secondary disabled:opacity-40">Siguiente</button></nav>}
    {!visible.length && <p className="py-8 text-center text-muted">No hay deseados que coincidan con tu búsqueda.</p>}
  </div>;
}
