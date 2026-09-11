import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CollectionTabs } from "@/components/collection-tabs";
import { SiteNav } from "@/components/site-nav";
import { WishlistGrid, type WishlistCard } from "@/components/wishlist-grid";
import { readUserCollection } from "@/lib/collection-store";
import { getCatalogGame, getPlatform, isPublicCatalogGame } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-seo";
import { getCoverSrc } from "@/lib/cover-url";
import { getCurrentUser } from "@/lib/users";
import { readWishlistSales } from "@/lib/wishlist-sales-store";

export const metadata: Metadata = { title: "Mis deseados", robots: { index: false, follow: false } };

export default async function WishlistPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fcoleccion%2Fdeseados");
  const file = await readUserCollection(user.id);
  const sales = await readWishlistSales(user.id, file.wishlist ?? []);
  const saleByGame = new Map(sales.games.map((game) => [game.catalogId, game]));
  const games: WishlistCard[] = [...(file.wishlist ?? [])].reverse().flatMap((entry) => {
    const game = getCatalogGame(entry.catalogId);
    if (!game || !isPublicCatalogGame(game)) return [];
    return [{ catalogId: game.id, title: game.title, href: catalogGamePath(game), coverSrc: getCoverSrc(game.coverUrl, game.id), platformSlug: game.platformSlug, platformName: getPlatform(game.platformSlug)?.shortName ?? game.platformSlug, region: game.region, addedAt: entry.addedAt, listingCount: saleByGame.get(game.id)?.listingCount ?? 0, unseenListingKeys: saleByGame.get(game.id)?.unseenListingKeys ?? [] }];
  });
  return <>
    <SiteNav initialUser={user} />
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5"><h1 className="text-3xl font-bold">Mi colección</h1></header>
      <CollectionTabs active="wishlist" desiredCount={games.length} />
      <div className="mb-6"><h2 className="text-2xl font-bold">Mis deseados</h2><p className="mt-2 text-sm text-muted">{games.length ? `${games.length} ${games.length === 1 ? "juego que quieres" : "juegos que quieres"} conseguir. Cada edición conserva su plataforma y región.` : "Guarda aquí los juegos que te gustaría tener."}</p></div>
      <WishlistGrid games={games} />
    </main>
  </>;
}
