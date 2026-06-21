import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { createLocalGameRunnerJob, listLocalGameRunnerJobs } from "@/lib/local-game-runner-jobs";

export async function GET() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, jobs: await listLocalGameRunnerJobs(30) });
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const result = await createLocalGameRunnerJob({
    platformSlug: body?.platformSlug,
    offerType: body?.offerType,
    limit: Number(body?.limit ?? 20),
    maxPages: Number(body?.maxPages ?? 1),
  });
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
