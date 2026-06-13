import Link from "next/link";
import { CollectionExplorer } from "@/components/collection-explorer";
import { CollectionImport } from "@/components/collection-import";
import { CollectionValueHero } from "@/components/collection-value-hero";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";
import {
  getUserCollectionViews,
  readUserCollection,
  summarizeCollectionForPlan,
} from "@/lib/collection-store";
import { canViewCollectionValue } from "@/lib/plans";
import { SITE_LOGO } from "@/lib/site-brand";
import { getCurrentUser } from "@/lib/users";

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
              Crea una cuenta para importar tu inventario desde Excel o CSV y vincularlo al
              catálogo de {SITE_LOGO}.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/registro" className="btn-primary">
                Crear cuenta
              </Link>
              <Link href="/login" className="btn-secondary">
                Iniciar sesión
              </Link>
            </div>
          </Panel>
        </main>
      </>
    );
  }

  const file = readUserCollection(user.id);
  const items = getUserCollectionViews(user.id);
  const summary = summarizeCollectionForPlan(file.items, user.plan);
  const showCollectionValue = canViewCollectionValue(user.plan);
  const hasItems = items.length > 0;

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Mi colección</h1>
          <p className="text-muted">
            {hasItems ? (
              <>
                {summary.totalItems} juegos importados
                {file.source ? ` desde ${file.source}` : ""}
                {file.importedAt
                  ? ` · ${new Date(file.importedAt).toLocaleString("es-ES")}`
                  : ""}
              </>
            ) : (
              "Importa tu Excel para ver tu inventario enlazado al catálogo."
            )}
          </p>
        </header>

        <CollectionImport hasItems={hasItems} canViewCollectionValue={showCollectionValue} />

        {hasItems && (
          <CollectionValueHero summary={summary} canViewCollectionValue={showCollectionValue} />
        )}

        {hasItems && (
          <CollectionExplorer
            items={items}
            summary={summary}
            canViewCollectionValue={showCollectionValue}
          />
        )}
      </main>
    </>
  );
}
