import { notFound } from "next/navigation";
import Link from "next/link";
import { EntityBrowser } from "@/components/catalog-browser";
import { EntityRelationshipsPanel } from "@/components/entity-relationships-panel";
import { IndexEntityHeader } from "@/components/index-entity-header";
import { IndexEntityJsonLd } from "@/components/index-entity-json-ld";
import { SagaMascotWelcome } from "@/components/saga-mascot-welcome";
import { SeriesProfilePanel } from "@/components/series-profile-panel";
import { SiteNav } from "@/components/site-nav";
import { getPublicSeriesIndexEntry } from "@/lib/admin-series-manager";
import {
  getPublicFranchiseEntity,
  getPublicFranchiseIndexEntry,
  getPublicFranchiseRelationships,
  getPublicFranchiseSeries,
  getPublicSeriesFranchises,
} from "@/lib/admin-franchise-manager";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import type { IndexKind } from "@/lib/index-entity";
import { summarizeIndexEntry, summarizeIndexSlug } from "@/lib/index-entity";
import { buildSeriesProfile } from "@/lib/series-profile";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

const SERIES_BACKGROUND_IMAGES: Record<string, string> = {
  "final-fantasy": "/saga-backgrounds/final-fantasy.webp",
  "hollow-knight": "/saga-backgrounds/hollow-knight.webp",
  "resident-evil": "/saga-backgrounds/resident-evil.jpg",
};

export async function IndexEntityDetail({ kind, slug }: { kind: IndexKind; slug: string }) {
  const hierarchyKind = kind === "franchise" || kind === "series" ? kind : null;
  const publicSeriesEntry = kind === "series" ? await getPublicSeriesIndexEntry(slug) : null;
  const publicFranchiseEntry = kind === "franchise" ? await getPublicFranchiseIndexEntry(slug) : null;
  const summary = publicSeriesEntry
    ? summarizeIndexEntry(publicSeriesEntry, "series", { withGames: true })
    : publicFranchiseEntry
      ? summarizeIndexEntry(publicFranchiseEntry, "franchise", { withGames: true })
      : hierarchyKind
        ? undefined
        : summarizeIndexSlug(kind, slug);
  if (!summary) notFound();

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const games = summary.games.map(toCatalogListGame);
  const seriesProfile = hierarchyKind
    ? buildSeriesProfile(summary.entry, summary.games, { entityKind: hierarchyKind })
    : null;
  const seriesBackgroundImage =
    hierarchyKind
      ? summary.entry.backgroundImageUrl ?? SERIES_BACKGROUND_IMAGES[summary.entry.slug] ?? null
      : null;
  const seriesBackgroundOpacity =
    hierarchyKind ? summary.entry.backgroundImageOpacity ?? 68 : 68;
  const seriesBackgroundReadability =
    hierarchyKind ? summary.entry.backgroundReadability ?? "normal" : "normal";

  const relatedFranchises = kind === "series" ? await getPublicSeriesFranchises(slug) : [];
  const primaryFranchise = relatedFranchises.find((franchise) => franchise.primary) ?? null;

  const relatedSeries = kind === "franchise" ? await getPublicFranchiseSeries(slug) : [];

  const currentFranchise = kind === "franchise" ? await getPublicFranchiseEntity(slug) : null;
  const relationshipEntity = kind === "franchise"
    ? currentFranchise
      ? { type: "franchise" as const, id: currentFranchise.id }
      : null
    : kind === "series"
      ? { type: "series" as const, id: slug }
      : null;
  const relationships = relationshipEntity
    ? await getPublicFranchiseRelationships(relationshipEntity)
    : [];
  const breadcrumbs = kind === "franchise"
    ? [
        { label: "Franquicias", href: "/franquicia" },
        { label: summary.name },
      ]
    : kind === "series"
      ? primaryFranchise
        ? [
            { label: "Franquicias", href: "/franquicia" },
            { label: primaryFranchise.name, href: `/franquicia/${primaryFranchise.slug}` },
            { label: summary.name },
          ]
        : [
            { label: "Sagas", href: "/saga" },
            { label: summary.name },
          ]
      : undefined;

  const content = (
    <>
      {breadcrumbs && <IndexEntityJsonLd summary={summary} breadcrumbs={breadcrumbs} />}
      <IndexEntityHeader summary={summary} breadcrumbs={breadcrumbs} />
      {seriesProfile && <SagaMascotWelcome profile={seriesProfile} compact />}
      {seriesProfile && (
        <SeriesProfilePanel
          profile={seriesProfile}
          entityKind={hierarchyKind ?? "series"}
          backgroundImage={seriesBackgroundImage}
          backgroundOpacity={seriesBackgroundOpacity}
          backgroundReadability={seriesBackgroundReadability}
        />
      )}
      {kind === "series" && relatedFranchises.length > 0 && (
        <section className="mb-8 border-y border-border py-5">
          <h2 className="text-lg font-semibold text-foreground">Franquicias</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {relatedFranchises.map((franchise) => (
              <Link
                key={franchise.id}
                href={`/franquicia/${franchise.slug}`}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent/45 hover:text-accent"
              >
                {franchise.name}{franchise.primary ? " · Principal" : ""}
              </Link>
            ))}
          </div>
        </section>
      )}
      {kind === "franchise" && relatedSeries.length > 0 && (
        <section className="mb-8 border-y border-border py-5">
          <h2 className="text-lg font-semibold text-foreground">Sagas y subseries</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {relatedSeries.map((entry) => (
              <Link
                key={entry.slug}
                href={`/saga/${entry.slug}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition hover:border-accent/45"
              >
                <span className="font-semibold text-foreground">{entry.name}</span>
                <span className="text-muted">{entry.gameCount.toLocaleString("es-ES")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <EntityRelationshipsPanel relationships={relationships} />
      <div id={kind === "franchise" ? "franchise-games" : "saga-games"} />
      <EntityBrowser
        games={games}
        title={summary.name}
        ownedCatalogIds={ownedCatalogIds}
        isLoggedIn={!!user}
      />
    </>
  );

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        {content}
      </main>
    </>
  );
}
