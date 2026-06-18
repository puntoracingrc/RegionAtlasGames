import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityBrowser } from "@/components/catalog-browser";
import { IndexEntityHeader } from "@/components/index-entity-header";
import { SagaMascotWelcome } from "@/components/saga-mascot-welcome";
import { SeriesProfilePanel } from "@/components/series-profile-panel";
import { SiteNav } from "@/components/site-nav";
import { getPublicSeriesIndexEntry } from "@/lib/admin-series-manager";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import type { IndexKind } from "@/lib/index-entity";
import { summarizeIndexEntry, summarizeIndexSlug } from "@/lib/index-entity";
import { buildSeriesProfile } from "@/lib/series-profile";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

export async function IndexEntityDetail({ kind, slug }: { kind: IndexKind; slug: string }) {
  const publicSeriesEntry = kind === "series" ? await getPublicSeriesIndexEntry(slug) : null;
  const summary = publicSeriesEntry
    ? summarizeIndexEntry(publicSeriesEntry, "series", { withGames: true })
    : summarizeIndexSlug(kind, slug);
  if (!summary) notFound();

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const games = summary.games.map(toCatalogListGame);
  const seriesProfile = kind === "series" ? buildSeriesProfile(summary.entry, summary.games) : null;

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        {kind === "series" && (
          <div className="mb-4 flex justify-end">
            <Link href="/admin/entidades?tab=series" className="btn-secondary">
              Editar sagas
            </Link>
          </div>
        )}
        <IndexEntityHeader summary={summary} />
        {seriesProfile && <SagaMascotWelcome profile={seriesProfile} compact />}
        {seriesProfile && <SeriesProfilePanel profile={seriesProfile} />}
        <div id="saga-games" />
        <EntityBrowser
          games={games}
          title={summary.name}
          ownedCatalogIds={ownedCatalogIds}
          isLoggedIn={!!user}
        />
      </main>
    </>
  );
}
