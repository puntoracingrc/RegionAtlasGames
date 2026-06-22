import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  deleteAdminPlatform,
  setAdminEntityActive,
  setAdminPlatformNewsEnabled,
  updateAdminPlatform,
} from "@/lib/admin-entity-catalog";

type RouteParams = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const body = (await request.json()) as {
    name?: string;
    shortName?: string;
    manufacturer?: "nintendo" | "sony" | "sega" | "snk" | "microsoft";
    status?: "closed" | "semi-closed" | "open";
    description?: string;
    sortOrder?: number;
    newSlug?: string;
    active?: boolean;
    newsEnabled?: boolean;
  };

  if (typeof body.active === "boolean" && Object.keys(body).length === 1) {
    const result = await setAdminEntityActive("platforms", slug, body.active);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, slug, active: body.active });
  }

  if (typeof body.newsEnabled === "boolean" && Object.keys(body).length === 1) {
    const result = await setAdminPlatformNewsEnabled(slug, body.newsEnabled);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, slug, newsEnabled: body.newsEnabled });
  }

  const result = await updateAdminPlatform(slug, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, platform: result.platform, slug: result.slug });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const result = await deleteAdminPlatform(slug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
