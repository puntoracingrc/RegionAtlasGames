import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/lib/cron-auth";
import { ensureScheduledGameReleaseDiscoveryJobs } from "@/lib/local-game-runner-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronRequestAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const result = await ensureScheduledGameReleaseDiscoveryJobs();
  if ("error" in result) {
    console.error("[game-release-discovery-cron]", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  console.info("[game-release-discovery-cron]", JSON.stringify({
    created: result.created.map((job) => ({ id: job.id, platformSlug: job.platformSlug })),
    skipped: result.skipped,
  }));
  return NextResponse.json(result);
}
