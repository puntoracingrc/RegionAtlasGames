import Link from "next/link";
import { BackLink } from "@/components/breadcrumbs";
import { notFound, redirect } from "next/navigation";
import { GameProductReference } from "@/components/game-product-reference";
import { CollectionValueUpsell } from "@/components/collection-value-upsell";
import { SellListingButton } from "@/components/sell-listing-button";
import { DetailCoverArt } from "@/components/detail-cover-art";
import { isGrailGame, isTopInSegment } from "@/lib/game-highlight";
import { RegionFlag } from "@/components/region-flag";
import { SiteNav } from "@/components/site-nav";
import { PriceBox } from "@/components/ui";
import { getSellerOpenListing } from "@/lib/listings";
import { getUserCollectionItem } from "@/lib/collection-store";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { formatEur, getCatalogGame, getPlatform } from "@/lib/catalog";
import { getGameDetails } from "@/lib/indexes";
import { catalogGamePath } from "@/lib/catalog-url";
import { canViewCollectionValue } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ id: string }> };

export default async function CollectionItemPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const item = await getUserCollectionItem(user.id, id);
  if (!item) notFound();

  const platform = getPlatform(item.platformSlug);
  const openListing =
    item.catalogId != null
      ? getSellerOpenListing(user.id, item.catalogId)
      : undefined;
  const grail = isGrailGame(item);
  const topSegment = isTopInSegment(item);
  const catalogGame = item.catalogId ? getCatalogGame(item.catalogId) : undefined;
  const catalogDetails = catalogGame ? getGameDetails(catalogGame.id) : undefined;
  const showCollectionValue = canViewCollectionValue(user.plan);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <BackLink href="/coleccion">Mi colección</BackLink>

        {!item.inRetroCatalog && (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Este juego no está indexado en el catálogo retro ({platform?.shortName ?? item.platformSlug}).
          </div>
        )}

        {item.inRetroCatalog && !item.catalogMatched && (
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Este juego está en tu colección pero aún no tiene ficha en el catálogo de Region Atlas.
            Lo mantendremos en tu lista de pendientes hasta que lo indexemos.
          </div>
        )}

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-10">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <DetailCoverArt
              src={getCoverSrc(item.coverUrl, item.catalogId ?? item.id)}
              alt={decodeHtmlEntities(item.title)}
              platformSlug={item.platformSlug}
              owned
              grail={grail}
              topSegment={topSegment}
            />
          </div>

          <div className="min-w-0 space-y-5">
            <header>
              <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">{item.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <span>{platform?.shortName ?? item.platformSlug}</span>
                <span aria-hidden>·</span>
                <RegionFlag region={item.region} size="sm" showLabel />
                {item.sealed ? " · Precintado" : ""}
              </p>
            </header>

            <section className="grid gap-3 sm:grid-cols-3">
              <PriceBox label="Venta recomendada" value={formatEur(item.recommendedPrice)} main />
              <PriceBox label="Precio compra" value={formatEur(item.buyPrice)} />
              <PriceBox
                label="Valor total"
                value={showCollectionValue ? formatEur(item.totalValue) : "—"}
              />
            </section>
            {!showCollectionValue && (
              <p className="text-sm">
                <CollectionValueUpsell compact />
              </p>
            )}

            {catalogGame && (
              <GameProductReference game={catalogGame} details={catalogDetails} variant="compact" />
            )}

            {item.catalogId && item.inRetroCatalog && (
              <SellListingButton
                collectionItemId={item.id}
                plan={user.plan}
                openListingId={openListing?.id}
              />
            )}

            {item.catalogId && item.inRetroCatalog && (
              <Link
                href={catalogGamePath(item.catalogId)}
                className="inline-flex text-sm text-accent/90 hover:text-accent hover:underline"
              >
                Ver ficha en catálogo →
              </Link>
            )}

            {item.notes && (
              <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
                {item.notes}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
