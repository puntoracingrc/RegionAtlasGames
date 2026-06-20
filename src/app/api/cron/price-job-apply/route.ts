import { NextResponse } from "next/server";
import { applyAdminPriceJobResults } from "@/lib/admin-price-job-apply";
import { cronRequestAuthorized } from "@/lib/cron-auth";

async function handle(request: Request) {
  if (!cronRequestAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "Falta jobId." }, { status: 400 });
  }

  const result = await applyAdminPriceJobResults(jobId);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error, jobId }, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
