import { NextResponse } from "next/server";
import { resolvePcWorkerDeploymentSha } from "@/lib/price-worker-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "public, no-store, max-age=0" },
  });
}

export async function GET() {
  const environment = process.env.VERCEL_ENV?.trim().toLowerCase();
  const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  const commitSha = resolvePcWorkerDeploymentSha();
  if (environment !== "production" || (branch && branch !== "main") || !commitSha) {
    return response({ ok: false, error: "Release de producción no disponible." }, 503);
  }
  return response({
    schemaVersion: 1,
    repository: "puntoracingrc/RegionAtlasGames",
    branch: "main",
    commitSha,
    checkedAt: new Date().toISOString(),
  });
}
