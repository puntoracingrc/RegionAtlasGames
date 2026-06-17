import { NextResponse } from "next/server";
import {
  assertContributorApi,
  loadContributorStagingEntry,
} from "@/lib/contributor-access";
import { listCatalogStagingGames } from "@/lib/catalog-staging-storage";

export async function GET() {
  const contributor = await assertContributorApi();
  if (!contributor) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const email = contributor.email.trim().toLowerCase();
  const games = (await listCatalogStagingGames())
    .filter((g) => g.contributorEmail?.trim().toLowerCase() === email)
    .sort((a, b) => (b.submittedAt ?? b.lastSeenAt).localeCompare(a.submittedAt ?? a.lastSeenAt));

  return NextResponse.json({ ok: true, games });
}
