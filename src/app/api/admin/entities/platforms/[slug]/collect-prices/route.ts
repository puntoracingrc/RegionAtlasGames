import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { startAdminPriceCollectJob } from "@/lib/admin-price-collect";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    if (!(await assertAdminApi())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const platformSlug = decodeURIComponent((await params).slug).trim();
    if (!platformSlug) {
      return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
    }

    let region = "";
    try {
      const body = await request.json();
      region = String(body?.region ?? "").trim();
    } catch {
      region = "";
    }

    const started = await startAdminPriceCollectJob({ platformSlug, region: region || undefined });
    if ("error" in started) {
      return NextResponse.json({ error: started.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, jobId: started.jobId, platformSlug, region: region || null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo iniciar la recolección." },
      { status: 500 },
    );
  }
}
