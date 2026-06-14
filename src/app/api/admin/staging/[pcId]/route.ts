import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromStaging,
  readAdminGameDraft,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return NextResponse.json({ error: "Juego no encontrado en cola." }, { status: 404 });
  }

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);

  return NextResponse.json({ ok: true, staging, draft });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return NextResponse.json({ error: "Juego no encontrado en cola." }, { status: 404 });
  }

  const body = (await request.json()) as Partial<Record<string, unknown>>;
  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);

  const assignString = (key: keyof typeof draft, value: unknown) => {
    if (typeof value === "string") (draft[key] as string | null) = value.trim() || null;
  };
  const assignNumber = (key: "year" | "players", value: unknown) => {
    if (value === null || value === "") draft[key] = null;
    else if (typeof value === "number") draft[key] = value;
    else if (typeof value === "string") {
      const n = Number.parseInt(value, 10);
      draft[key] = Number.isFinite(n) ? n : null;
    }
  };

  if (typeof body.title === "string") draft.title = body.title.trim();
  if (typeof body.slug === "string") draft.slug = body.slug.trim();
  if (typeof body.catalogId === "string") draft.catalogId = body.catalogId.trim();
  if (typeof body.platformSlug === "string") draft.platformSlug = body.platformSlug;
  if (typeof body.region === "string") draft.region = body.region;
  if (typeof body.edition === "string") draft.edition = body.edition;
  assignString("reference", body.reference);
  assignString("coverUrl", body.coverUrl);
  assignString("releaseDate", body.releaseDate);
  assignString("support", body.support);
  assignString("developerName", body.developerName);
  assignString("developerSlug", body.developerSlug);
  assignString("publisherName", body.publisherName);
  assignString("publisherSlug", body.publisherSlug);
  assignNumber("year", body.year);
  assignNumber("players", body.players);
  if (typeof body.description === "string") draft.description = body.description.trim() || null;
  if (Array.isArray(body.genreNames)) {
    draft.genreNames = body.genreNames.filter((g): g is string => typeof g === "string");
  }

  const saved = await writeAdminGameDraft(draft);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draft });
}
