import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminGameEditor } from "@/components/admin/admin-game-editor";
import {
  draftFromStaging,
  readAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";
import { companies } from "@/lib/indexes";
import { requireContributorUser } from "@/lib/admin-auth";

type Props = { params: Promise<{ pcId: string }> };

export default async function ContribuirEditPage({ params }: Props) {
  const user = await requireContributorUser();
  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) notFound();

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) notFound();

  const owner = staging.contributorEmail?.trim().toLowerCase();
  if (!owner || owner !== user.email.trim().toLowerCase()) {
    redirect("/contribuir");
  }

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);
  const readOnly = staging.reviewStatus === "pending-review";

  const companyList = Object.values(companies)
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"))
    .slice(0, 400)
    .map((c) => ({ name: c.name, slug: c.slug }));

  return (
    <div className="space-y-4">
      <Link href="/contribuir" className="btn-secondary inline-flex text-xs">
        ← Volver a mis fichas
      </Link>
      <AdminGameEditor
        pcId={pcId}
        initialDraft={draft}
        staging={staging}
        companies={companyList}
        mode="contributor"
        readOnly={readOnly}
      />
    </div>
  );
}
