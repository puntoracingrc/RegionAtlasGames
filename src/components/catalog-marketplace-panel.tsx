import Link from "next/link";
import { formatEur } from "@/lib/catalog";
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
  const listings = getActiveListingsForCatalog(catalogId);
  const user = await getCurrentUser();
  const canContact = user ? canUseMarketplace(user.plan) : false;

  if (listings.length === 0) {
    return (
      <Panel>
        <PanelTitle>En venta entre usuarios</PanelTitle>
        <p className="text-sm text-muted">Nadie lo vende ahora mismo en el mercado Pro.</p>
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-black/20 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{pub.sellerName}</p>
                <p className="text-xs text-muted">
                  {listing.sealed ? "Precintado · " : ""}
                  {pub.aiAnalysis
                    ? `IA: ${pub.aiAnalysis.conditionVerdict} · ~${formatEur(pub.aiAnalysis.estimatedPriceEur)}`
                    : "Sin análisis"}
                </p>
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

export function catalogListingCount(catalogId: string) {
  return countActiveListingsForCatalog(catalogId);
}
