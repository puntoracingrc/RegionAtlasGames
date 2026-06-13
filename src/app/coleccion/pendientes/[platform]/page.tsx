import Link from "next/link";
import { CollectionGapPlatformDetail } from "@/components/collection-gap-platform-detail";
import { SiteNav } from "@/components/site-nav";
import { Panel } from "@/components/ui";
import { loadGapPlatformItems } from "@/lib/collection-gap-pages";
import { getCollectionPlatformShortName } from "@/lib/collection-platform-groups";
import { getCurrentUser } from "@/lib/users";

type Props = {
  params: Promise<{ platform: string }>;
};

export default async function CollectionPendingPlatformPage({ params }: Props) {
  const user = await getCurrentUser();
  const { platform } = await params;

  if (!user) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto max-w-lg px-4 py-16 md:px-6">
          <Panel>
            <p className="text-sm text-muted">Inicia sesión para ver tu colección.</p>
            <Link href="/login" className="btn-primary mt-4 inline-block">
              Entrar
            </Link>
          </Panel>
        </main>
      </>
    );
  }

  const { items, normalizedSlug } = await loadGapPlatformItems(user.id, "pending", platform);
  const title = getCollectionPlatformShortName(normalizedSlug);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <CollectionGapPlatformDetail variant="pending" platformSlug={normalizedSlug} items={items} />
        {items.length === 0 && (
          <p className="mt-4 text-center text-sm text-muted">
            No hay pendientes en {title}.{" "}
            <Link href="/coleccion" className="text-accent hover:underline">
              Volver
            </Link>
          </p>
        )}
      </main>
    </>
  );
}
