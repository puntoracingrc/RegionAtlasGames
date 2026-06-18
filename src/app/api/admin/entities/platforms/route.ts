import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { createAdminPlatform, listAdminPlatforms } from "@/lib/admin-entity-catalog";

export async function GET() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const platforms = await listAdminPlatforms();
  return NextResponse.json({ ok: true, platforms });
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as {
    slug?: string;
    name?: string;
    shortName?: string;
    manufacturer?: "nintendo" | "sony" | "sega" | "snk";
    status?: "closed" | "semi-closed";
    description?: string;
    sortOrder?: number;
    newsEnabled?: boolean;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }

  const result = await createAdminPlatform({
    name: body.name.trim(),
    slug: body.slug,
    shortName: body.shortName,
    manufacturer: body.manufacturer,
    status: body.status,
    description: body.description,
    sortOrder: body.sortOrder,
    newsEnabled: body.newsEnabled,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, platform: result.platform });
}
