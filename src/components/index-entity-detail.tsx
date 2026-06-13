import { notFound } from "next/navigation";
import { EntityBrowser } from "@/components/catalog-browser";
import { IndexEntityHeader } from "@/components/index-entity-header";
import { SiteNav } from "@/components/site-nav";
import type { IndexKind } from "@/lib/index-entity";
import { summarizeIndexSlug } from "@/lib/index-entity";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

export async function IndexEntityDetail({ kind, slug }: { kind: IndexKind; slug: string }) {
  const summary = summarizeIndexSlug(kind, slug);
  if (!summary) notFound();

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <IndexEntityHeader summary={summary} />
        <EntityBrowser
          games={summary.games}
          title={summary.name}
          ownedCatalogIds={ownedCatalogIds}
          isLoggedIn={!!user}
        />
      </main>
    </>
  );
}
