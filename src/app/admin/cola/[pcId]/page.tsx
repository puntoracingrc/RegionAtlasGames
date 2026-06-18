import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGameEditor } from "@/components/admin/admin-game-editor";
import {
  draftFromStaging,
  readAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { listCatalogStagingGames, readCatalogStagingGame } from "@/lib/catalog-staging-storage";
import { companies } from "@/lib/indexes";
import { getAdminGameEditorTaxonomyOptions } from "@/lib/admin-game-editor-options";

type Props = {
  params: Promise<{ pcId: string }>;
  searchParams: Promise<{ ai?: string }>;
};

export default async function AdminQueueGamePage({ params, searchParams }: Props) {
  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) notFound();

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) notFound();

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);
  const sp = await searchParams;
  const autoAi = sp.ai === "1";

  const companyList = Object.values(companies)
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"))
    .slice(0, 400)
    .map((c) => ({ name: c.name, slug: c.slug }));
  const taxonomyOptions = getAdminGameEditorTaxonomyOptions();
  const queueGames = (await listCatalogStagingGames())
    .filter((game) => game.status !== "promoted")
    .sort(
      (a, b) =>
        b.unitCount - a.unitCount ||
        b.userCount - a.userCount ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    );
  const currentIndex = queueGames.findIndex((game) => game.pcId === pcId);
  const previousGame = currentIndex > 0 ? queueGames[currentIndex - 1] : null;
  const nextGame =
    currentIndex >= 0 && currentIndex < queueGames.length - 1
      ? queueGames[currentIndex + 1]
      : null;

  return (
    <div>
      <Link href="/admin/cola" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Volver a revisión
      </Link>
      <AdminGameEditor
        pcId={pcId}
        initialDraft={draft}
        staging={staging}
        companies={companyList}
        taxonomyOptions={taxonomyOptions}
        autoAi={autoAi}
        reviewNav={
          currentIndex >= 0
            ? {
                previous: previousGame
                  ? { pcId: previousGame.pcId, title: previousGame.title }
                  : null,
                next: nextGame ? { pcId: nextGame.pcId, title: nextGame.title } : null,
                position: currentIndex + 1,
                total: queueGames.length,
              }
            : undefined
        }
      />
    </div>
  );
}
