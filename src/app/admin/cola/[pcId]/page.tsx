import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGameEditor } from "@/components/admin/admin-game-editor";
import {
  draftFromStaging,
  readAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";
import { companies } from "@/lib/indexes";

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

  return (
    <div>
      <Link href="/admin/cola" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Volver a la cola
      </Link>
      <AdminGameEditor
        pcId={pcId}
        initialDraft={draft}
        staging={staging}
        companies={companyList}
        autoAi={autoAi}
      />
    </div>
  );
}
