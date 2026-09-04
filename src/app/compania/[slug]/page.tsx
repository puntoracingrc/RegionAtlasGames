import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CompanyProfileDetail } from "@/components/company-profile-detail";
import { resolveCanonicalCompanySlug } from "@/lib/company-canonical";
import { buildCompanyProfileViewWithOverlay } from "@/lib/company-profile";
import { buildCompanyMetadata } from "@/lib/company-seo";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";
import { listPublicSeriesForGames } from "@/lib/admin-series-manager";
import { listPublicFranchisesForGames } from "@/lib/admin-franchise-manager";
import { getLegacySeriesRedirect } from "@/lib/franchise-system";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const view = await buildCompanyProfileViewWithOverlay(resolveCanonicalCompanySlug(slug));
  if (!view) return { title: "Compañía no encontrada" };
  return buildCompanyMetadata(view);
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;
  const canonicalSlug = resolveCanonicalCompanySlug(slug);
  if (canonicalSlug !== slug) {
    redirect(`/compania/${canonicalSlug}`);
  }

  const view = await buildCompanyProfileViewWithOverlay(canonicalSlug);
  if (!view) notFound();

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const gameIds = view.games.map((game) => game.id);
  const franchises = (await listPublicFranchisesForGames(gameIds)).map((item) => ({
    slug: item.slug,
    name: item.name,
    catalogEntryCount: item.gameCount,
    matchedCatalogEntryCount: item.matchedGameCount,
  }));
  const series = (await listPublicSeriesForGames(gameIds)).filter(
    (entry) => !getLegacySeriesRedirect(entry.slug),
  ).map((item) => ({
    slug: item.slug,
    name: item.name,
    catalogEntryCount: item.gameCount,
    matchedCatalogEntryCount: item.matchedGameCount,
  }));

  return (
    <CompanyProfileDetail
      view={view}
      franchises={franchises}
      series={series}
      ownedCatalogIds={ownedCatalogIds}
      isLoggedIn={!!user}
    />
  );
}
