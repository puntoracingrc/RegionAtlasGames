import Link from "next/link";
import { formatEur } from "@/lib/price-format";
import { conditionScoreOutOfTen } from "@/lib/marketplace-ui";
import {
  countActiveListingsForCatalog,
  getActiveListingsForCatalog,
  getPublicSellerListing,
} from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";
import { Panel, PanelTitle } from "@/components/ui";

type Props = { catalogId: string };

export async function CatalogMarketplacePanel({ catalogId }: Props) {
  const listings = await getActiveListingsForCatalog(catalogId);
  const user = await getCurrentUser();
  const canContact = user ? canUseMarketplace(user.plan) : false;

  if (listings.length === 0) {
    return (
      <Panel>
        <PanelTitle>En venta entre usuarios</PanelTitle>
        <p className="text-sm text-muted">
          Nadie lo vende ahora mismo. Si lo tienes en tu colección, puedes publicar un anuncio con fotos verificadas.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelTitle>
        En venta · {listings.length} copia{listings.length !== 1 ? "s" : ""}
      </PanelTitle>
      <ul className="mt-3 space-y-2">
        {listings.map((listing) => {
          const pub = getPublicSellerListing(listing);
          return (
            <li
              key={listing.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card-hover/70 px-3 py-2.5 dark:bg-black/20"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                {listing.photos[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.photos[0].url}
                    alt={`Foto real de ${listing.title}`}
                    className="h-16 w-12 rounded-md border border-border bg-black/20 object-cover"
                  />
                )}
                <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {pub.sellerName}
                  {pub.sellerCity ? ` · ${pub.sellerCity}` : ""}
                </p>
                <p className="text-xs text-muted">
                  {listing.sealed ? "Precintado · " : ""}
                  {pub.aiAnalysis
                    ? `IA: ${pub.aiAnalysis.conditionVerdict} · ~${formatEur(pub.aiAnalysis.estimatedPriceEur)}`
                    : "Sin análisis"}
                </p>
                {pub.aiAnalysis?.conditionScore != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${(conditionScoreOutOfTen(pub.aiAnalysis.conditionScore) ?? 1) * 10}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-muted">
                      {conditionScoreOutOfTen(pub.aiAnalysis.conditionScore)}/10
                    </span>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted">
                  {pub.saleOptions.pickup && "Trato en mano"}
                  {pub.saleOptions.pickup && pub.saleOptions.shipping ? " · " : ""}
                  {pub.saleOptions.shipping && "Envío"}
                </p>
                </div>
              </div>
              {canContact ? (
                <Link
                  href={`/venta/${listing.id}`}
                  className="text-sm text-accent hover:underline"
                >
                  Ver fotos y contactar →
                </Link>
              ) : (
                <span className="text-xs text-muted">Plan Pro para contactar</span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export async function catalogListingCount(catalogId: string) {
  return countActiveListingsForCatalog(catalogId);
}
