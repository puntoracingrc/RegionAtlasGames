import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { listCatalogStagingGames } from "@/lib/catalog-staging-storage";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const platform = url.searchParams.get("platform");

  let games = await listCatalogStagingGames();
  games = games.filter((g) => g.status !== "promoted");

  if (status === "pending") {
    games = games.filter((g) => g.status === "pending-catalog");
  } else if (status === "enriched") {
    games = games.filter((g) => g.status === "enriched");
  }

  if (platform) {
    games = games.filter((g) => g.platformSlug === platform);
  }

  games.sort(
    (a, b) =>
      b.unitCount - a.unitCount ||
      b.userCount - a.userCount ||
      b.lastSeenAt.localeCompare(a.lastSeenAt),
  );

  return NextResponse.json({
    ok: true,
    games: games.map((g) => ({
      pcId: g.pcId,
      title: g.title,
      platformSlug: g.platformSlug,
      region: g.region,
      status: g.status,
      coverUrl: g.coverUrl,
      unitCount: g.unitCount,
      userCount: g.userCount,
      catalogId: g.catalogId,
      importCount: g.importCount,
      lastSeenAt: g.lastSeenAt,
    })),
    total: games.length,
  });
}
