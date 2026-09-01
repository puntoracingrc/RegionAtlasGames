import Link from "next/link";
import { CollectionExplorer } from "@/components/collection-explorer";
import { CollectionImport } from "@/components/collection-import";
import {
  CollectionPurchasesHistory,
  CollectionSalesHistory,
} from "@/components/collection-sales-history";
import {
  CollectionOutOfScopePanel,
  CollectionPendingPanel,
} from "@/components/collection-pending-panel";
import { CollectionValueHero } from "@/components/collection-value-hero";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";
import {
  filterMainCollectionExplorerItems,
  readUserCollection,
  summarizeCollectionForPlan,
} from "@/lib/collection-store";
import { enrichCollectionItem } from "@/lib/catalog";
import { outOfScopeCollectionItems, pendingCatalogItems } from "@/lib/import-collection";
import { enrichCollectionGapItem } from "@/lib/collection-gap";
import { canViewCollectionValue } from "@/lib/plans";
import {
  collectionListingStates,
  completedCollectionPurchases,
  completedCollectionSales,
} from "@/lib/collection-sales";
import { SITE_LOGO } from "@/lib/site-brand";
import { getCurrentUser } from "@/lib/users";
import { getUserMarketplaceActivityListings } from "@/lib/listings";

export default async function CollectionPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto max-w-lg px-4 py-16 md:px-6">
          <Panel>
            <PanelTitle>Mi colección</PanelTitle>
            <p className="mt-2 text-sm text-muted">
              Accede con Google para importar tu inventario desde Excel o CSV y vincularlo al
              catálogo de {SITE_LOGO}.
            </p>
            <Link href="/login?next=%2Fcoleccion" className="btn-primary mt-6">
              Continuar con Google
            </Link>
          </Panel>
        </main>
      </>
    );
  }

  const [file, marketplaceActivity] = await Promise.all([
    readUserCollection(user.id),
    getUserMarketplaceActivityListings(user.id),
  ]);
  const { sellerListings, buyerListings } = marketplaceActivity;
  const items = file.items.map(enrichCollectionItem);
  const listingStateByItemId = collectionListingStates(sellerListings);
  const completedSales = completedCollectionSales(sellerListings);
  const completedPurchases = completedCollectionPurchases(buyerListings, user.id);
  const linkedItems = filterMainCollectionExplorerItems(items);
  const pendingItems = pendingCatalogItems(file.items).map(enrichCollectionGapItem);
  const outOfScopeItems = outOfScopeCollectionItems(file.items).map(enrichCollectionGapItem);
  const summary = summarizeCollectionForPlan(items, user.plan);
  const showCollectionValue = canViewCollectionValue(user.plan);
  const hasItems = items.length > 0;
  const hasLinkedItems = linkedItems.length > 0;
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mi colección</h1>
            <p className="mt-1 text-xs text-muted">
              {hasItems ? (
                <>
                  Actualizada
                  {file.importedAt
                    ? ` el ${new Date(file.importedAt).toLocaleDateString("es-ES")}`
                    : ""}
                  {file.source ? ` desde ${file.source}` : ""}
                </>
              ) : (
                "Importa tu inventario para empezar."
              )}
            </p>
          </div>
          <CollectionImport
            compact
            hasItems={hasItems}
            canViewCollectionValue={showCollectionValue}
          />
        </header>

        {hasItems && (
          <CollectionValueHero summary={summary} canViewCollectionValue={showCollectionValue} />
        )}

        {hasItems && summary.pendingCatalog > 0 && (
          <CollectionPendingPanel items={pendingItems} />
        )}

        {hasItems && summary.outOfScopeItems > 0 && (
          <CollectionOutOfScopePanel items={outOfScopeItems} />
        )}

        {hasLinkedItems && (
          <CollectionExplorer
            items={linkedItems}
            canViewCollectionValue={showCollectionValue}
            listingStateByItemId={listingStateByItemId}
          />
        )}

        <CollectionPurchasesHistory listings={completedPurchases} />
        <CollectionSalesHistory listings={completedSales} />

        {hasItems && !hasLinkedItems && summary.pendingCatalog === 0 && summary.outOfScopeItems === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            Ningún juego enlazado al catálogo todavía. Revisa las secciones de pendientes arriba o
            reimporta tu archivo.
          </p>
        )}
      </main>
    </>
  );
}
