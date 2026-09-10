import { PlatformGrid } from "@/components/platform-card";
import { SiteNav } from "@/components/site-nav";
import { getUserCollectionViews } from "@/lib/collection-store";
import { publicListedCatalog } from "@/lib/catalog";
import { catalogReviewCounts } from "@/lib/catalog-review-policy";
import { listAdminPlatforms } from "@/lib/admin-entity-catalog";
import { getCurrentUser } from "@/lib/users";

export default async function PlatformsPage() {
  const user = await getCurrentUser();
  const ownedItems = user ? await getUserCollectionViews(user.id) : [];
  const platforms = (await listAdminPlatforms()).filter((platform) => platform.active !== false);
  const reviewCounts = catalogReviewCounts(publicListedCatalog);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Plataformas</h1>
          <p className="max-w-2xl text-muted">
            {platforms.length} sistemas activos con catálogo multiregión —{" "}
            {reviewCounts.documented.toLocaleString("es-ES")} fichas catalogadas
            {reviewCounts.pending > 0 ? ` y ${reviewCounts.pending.toLocaleString("es-ES")} pendientes de revisar` : ""}.
          </p>
        </header>
        <PlatformGrid items={platforms} ownedItems={ownedItems} />
      </main>
    </>
  );
}
