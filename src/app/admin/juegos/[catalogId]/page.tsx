import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGameEditor } from "@/components/admin/admin-game-editor";
import { AdminGamePricesPanel } from "@/components/admin/admin-game-prices-panel";
import { AdminMarketResearchPanel } from "@/components/admin/admin-market-research-panel";
import {
  draftFromCatalogGame,
  getPublishedGameForAdmin,
  priceFieldsFromGame,
} from "@/lib/admin-catalog-publish";
import { companies } from "@/lib/indexes";
import { getAdminGameEditorTaxonomyOptions } from "@/lib/admin-game-editor-options";

type Props = { params: Promise<{ catalogId: string }> };

export default async function AdminEditPublishedGamePage({ params }: Props) {
  const catalogId = decodeURIComponent((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) notFound();

  const draft = draftFromCatalogGame(resolved.game, resolved.details);
  const companyList = Object.values(companies)
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"))
    .slice(0, 400)
    .map((c) => ({ name: c.name, slug: c.slug }));
  const taxonomyOptions = getAdminGameEditorTaxonomyOptions();

  return (
    <div>
      <Link href="/admin/juegos" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Volver a buscar juegos
      </Link>
      <AdminGameEditor
        pcId={resolved.game.pcId ?? 0}
        initialDraft={draft}
        companies={companyList}
        taxonomyOptions={taxonomyOptions}
        mode="published"
        catalogId={catalogId}
      />
      <div className="mt-8">
        <AdminMarketResearchPanel catalogId={catalogId} />
      </div>
      <div className="mt-8">
        <AdminGamePricesPanel
          catalogId={catalogId}
          initialPrices={priceFieldsFromGame(resolved.game)}
          updatedAt={resolved.game.updatedAt}
        />
      </div>
    </div>
  );
}
