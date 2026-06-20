import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { stopAdminPriceJob } from "@/lib/admin-price-collect";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const jobId = (await params).jobId;
  const result = await stopAdminPriceJob(jobId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, job: result });
}
