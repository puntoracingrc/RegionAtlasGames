import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { recordGameReleaseDiscoveryReview } from "@/lib/local-game-runner-jobs";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (body?.status !== "dismissed") {
    return NextResponse.json({ ok: false, error: "Acción de revisión no válida." }, { status: 400 });
  }
  const result = await recordGameReleaseDiscoveryReview({
    jobId: decodeURIComponent((await params).jobId),
    sourceSku: String(body?.sourceSku ?? ""),
    status: "dismissed",
  });
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
