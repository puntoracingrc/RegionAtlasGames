import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { importLocalGameRunnerJob } from "@/lib/local-game-runner-jobs";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const jobId = decodeURIComponent((await params).jobId);
  const result = await importLocalGameRunnerJob(jobId);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
