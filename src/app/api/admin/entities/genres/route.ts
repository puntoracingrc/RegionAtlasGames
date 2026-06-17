import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { createAdminGenre, listAdminGenres } from "@/lib/admin-entity-catalog";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const limit = Number.parseInt(searchParams.get("limit") ?? "150", 10);

  const genres = await listAdminGenres({ q, limit });
  return NextResponse.json({ ok: true, genres });
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as { slug?: string; name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }
  const result = await createAdminGenre({ name: body.name.trim(), slug: body.slug });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, genre: result.entry });
}
