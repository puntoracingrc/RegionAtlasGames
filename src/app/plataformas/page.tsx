import { PlatformGrid } from "@/components/platform-card";
import { SiteNav } from "@/components/site-nav";
import { getUserCollectionViews } from "@/lib/collection-store";
import { meta, platforms } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/users";

export default async function PlatformsPage() {
  const user = await getCurrentUser();
  const ownedItems = user ? getUserCollectionViews(user.id) : [];

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Plataformas retro</h1>
          <p className="max-w-2xl text-muted">
            {meta.platformCount} sistemas retro con catálogo multiregión —{" "}
            {meta.catalogListed.toLocaleString("es-ES")} títulos indexados.
          </p>
        </header>
        <PlatformGrid items={platforms} ownedItems={ownedItems} />
      </main>
    </>
  );
}
