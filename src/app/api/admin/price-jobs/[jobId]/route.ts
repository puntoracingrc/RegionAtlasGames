import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readAdminPriceJob } from "@/lib/admin-price-collect";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const jobId = (await params).jobId;
  const job = await readAdminPriceJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
}
