import Link from "next/link";
import { formatEur } from "@/lib/catalog";
import {
  getActiveListingsForCatalog,
  getPublicSellerListing,
} from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";
import { Panel, PanelTitle } from "@/components/ui";

type Props = { catalogId: string };

export async function ProListingsComparator({ catalogId }: Props) {
  const listings = getActiveListingsForCatalog(catalogId).slice(0, 5);
  const user = await getCurrentUser();
  const canContact = user ? canUseMarketplace(user.plan) : false;

  if (listings.length === 0) {
    return (
      <Panel>
        <PanelTitle>En venta entre usuarios Pro</PanelTitle>
        <p className="text-sm text-muted">
          Nadie lo vende ahora mismo en el mercado Pro. Publica un anuncio con fotos verificadas si
          tienes plan Pro.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelTitle>
        En venta · {listings.length} {listings.length === 1 ? "copia verificada" : "copias verificadas"}
      </PanelTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
              <th className="pb-2 pr-3 font-semibold">Vendedor</th>
              <th className="pb-2 pr-3 font-semibold">Estado</th>
              <th className="pb-2 pr-3 font-semibold">Precio IA</th>
              <th className="pb-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => {
              const pub = getPublicSellerListing(listing);
              const aiPrice = pub.aiAnalysis?.estimatedPriceEur;
              return (
                <tr key={listing.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-foreground">{pub.sellerName}</td>
                  <td className="py-2.5 pr-3 text-muted">
                    {listing.sealed ? "Precintado" : pub.aiAnalysis?.conditionVerdict ?? "Sin analizar"}
                  </td>
                  <td className="py-2.5 pr-3 font-semibold text-accent">
                    {aiPrice != null ? formatEur(aiPrice) : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    {canContact ? (
                      <Link href={`/venta/${listing.id}`} className="text-accent hover:underline">
                        Ver anuncio →
                      </Link>
                    ) : (
                      <Link href="/login" className="text-xs text-muted hover:text-accent">
                        Pro para contactar
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Solo anuncios Pro con fotos obligatorias. La IA estima un precio justo dentro del rango de
        mercado PAL ES.
      </p>
    </Panel>
  );
}
