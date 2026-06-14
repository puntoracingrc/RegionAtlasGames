import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { draftFromManualInput, REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { findSimilarCatalogGames } from "@/lib/admin-title-similarity";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const platformSlug = searchParams.get("platformSlug")?.trim() ?? "";
  const region = searchParams.get("region")?.trim() ?? "";
  const slug = searchParams.get("slug")?.trim() || undefined;

  if (title.length < 3) {
    return NextResponse.json({ matches: [] });
  }
  if (!platformSlug) {
    return NextResponse.json({ error: "Falta la plataforma." }, { status: 400 });
  }
  if (!region || !REGION_OPTIONS.includes(region as (typeof REGION_OPTIONS)[number])) {
    return NextResponse.json({ error: "Región no válida." }, { status: 400 });
  }

  const draft = draftFromManualInput({
    title,
    platformSlug,
    region,
    slug,
    reference: null,
    pcId: -1,
  });

  const matches = findSimilarCatalogGames({
    title,
    platformSlug,
    region,
    slug,
    excludeCatalogId: draft.catalogId,
  });

  return NextResponse.json({
    matches,
    pending: {
      title,
      platformSlug,
      region,
      catalogId: draft.catalogId,
    },
  });
}
