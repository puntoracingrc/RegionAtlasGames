import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/breadcrumbs";
import {
  CollectionCopiesManager,
  type CollectionCopyListing,
} from "@/components/collection-copies-manager";
import { DetailCoverArt } from "@/components/detail-cover-art";
import { RegionFlag } from "@/components/region-flag";
import { SiteNav } from "@/components/site-nav";
import { getCatalogGame, getPlatform, resolveCatalogIdParam } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-path";
import { collectionCatalogReturnPath } from "@/lib/collection-path";
import { getUserCollectionItemsForCatalog } from "@/lib/collection-store";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { getSellerListings } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ catalogId: string }> };

export default async function CollectionCatalogGamePage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { catalogId: rawCatalogId } = await params;
  const catalogId = resolveCatalogIdParam(rawCatalogId);
  const game = getCatalogGame(catalogId);
  if (!game) notFound();

  const items = await getUserCollectionItemsForCatalog(user.id, catalogId);
  if (items.length === 0) notFound();

  const itemIds = new Set(items.map((item) => item.id));
  const listings: CollectionCopyListing[] = (await getSellerListings(user.id))
    .filter(
      (listing) =>
        itemIds.has(listing.collectionItemId) &&
        (listing.status === "draft" || listing.status === "active"),
    )
    .map((listing) => ({
      id: listing.id,
      collectionItemId: listing.collectionItemId,
      status: listing.status,
    }));
  const platform = getPlatform(game.platformSlug);

  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <BackLink href={collectionCatalogReturnPath(catalogId)}>Mi colección</BackLink>

        <div className="mt-5 grid gap-6 border-b border-border pb-7 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
          <div className="max-w-[150px]">
            <DetailCoverArt
              src={getCoverSrc(game.coverUrl, game.id)}
              alt={decodeHtmlEntities(game.title)}
              platformSlug={game.platformSlug}
              owned
            />
          </div>
          <header className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Mi colección</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              {decodeHtmlEntities(game.title)}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <span>{platform?.shortName ?? game.platformSlug.toUpperCase()}</span>
              <span aria-hidden>·</span>
              <RegionFlag region={game.region} size="sm" showLabel />
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Aquí gestionas tus unidades físicas. La ficha general del juego y sus precios públicos no se modifican.
            </p>
            <Link href={catalogGamePath(game)} className="mt-3 inline-flex text-sm font-medium text-accent hover:underline">
              Ver ficha pública del juego →
            </Link>
          </header>
        </div>

        <CollectionCopiesManager
          catalogId={catalogId}
          initialItems={items}
          initialListings={listings}
        />
      </main>
    </>
  );
}
