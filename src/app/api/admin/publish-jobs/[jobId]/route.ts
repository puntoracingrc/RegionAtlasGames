import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readAdminPublishJob } from "@/lib/admin-publish-jobs";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const job = await readAdminPublishJob((await params).jobId);
  if (!job) {
    return NextResponse.json({ error: "Publicación no encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
}
