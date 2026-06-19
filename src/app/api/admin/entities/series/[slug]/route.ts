import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  addGamesToAdminSeries,
  addGameToAdminSeries,
  bulkAssignAdminSeriesFacets,
  getAdminSeries,
  removeGameFromAdminSeries,
  updateAdminSeriesBackground,
  updateAdminSeriesDescription,
} from "@/lib/admin-series-manager";

type Props = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Props) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { slug } = await params;
  const result = await getAdminSeries(slug);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, series: result });
}

export async function PATCH(req: Request, { params }: Props) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "add-game") {
    const result = await addGameToAdminSeries(
      slug,
      typeof body.gameId === "string" ? body.gameId : "",
    );
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, series: result.series });
  }

  if (action === "add-games") {
    const result = await addGamesToAdminSeries(
      slug,
      Array.isArray(body.gameIds)
        ? body.gameIds.filter((gameId: unknown): gameId is string => typeof gameId === "string")
        : [],
    );
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      addedCount: result.addedCount,
      series: result.series,
    });
  }

  if (action === "remove-game") {
    const result = await removeGameFromAdminSeries(
      slug,
      typeof body.gameId === "string" ? body.gameId : "",
    );
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, series: result.series });
  }

  if (action === "bulk-assign") {
    const result = await bulkAssignAdminSeriesFacets({
      slug,
      genreSlug: typeof body.genreSlug === "string" && body.genreSlug ? body.genreSlug : null,
      operation:
        body.operation === "remove" || body.operation === "replace" || body.operation === "add"
          ? body.operation
          : "add",
      gameIds: Array.isArray(body.gameIds)
        ? body.gameIds.filter((gameId: unknown): gameId is string => typeof gameId === "string")
        : [],
      genres: Array.isArray(body.genres)
        ? body.genres.filter((genre: unknown): genre is string => typeof genre === "string")
        : [],
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : [],
      facets: Array.isArray(body.facets)
        ? body.facets.filter((facet: unknown): facet is string => typeof facet === "string")
        : [],
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      affectedCount: result.affectedCount,
      series: result.series,
    });
  }

  if (action === "update-description") {
    const result = await updateAdminSeriesDescription(
      slug,
      typeof body.description === "string" ? body.description : null,
    );
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, series: result.series });
  }

  if (action === "update-background") {
    const result = await updateAdminSeriesBackground(
      slug,
      typeof body.backgroundImageUrl === "string" ? body.backgroundImageUrl : null,
      typeof body.backgroundImageOpacity === "number" ? body.backgroundImageOpacity : undefined,
      body.backgroundReadability === "soft" ||
        body.backgroundReadability === "normal" ||
        body.backgroundReadability === "strong"
        ? body.backgroundReadability
        : undefined,
    );
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, series: result.series });
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
