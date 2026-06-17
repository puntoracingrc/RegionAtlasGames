import { NextResponse } from "next/server";
import { getAdminPriceDashboard } from "@/lib/admin-price-dashboard";
import { startAdminPriceCollectJob } from "@/lib/admin-price-collect";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const dashboard = getAdminPriceDashboard();
  const step = dashboard.nextStep.slug;
  if (!step) {
    return NextResponse.json({ ok: false, error: "No hay paso de rotación programado." }, { status: 400 });
  }

  const started = await startAdminPriceCollectJob({
    platformSlug: step,
    advanceRotation: true,
  });

  if ("error" in started) {
    return NextResponse.json({ ok: false, error: started.error, step }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    jobId: started.jobId,
    step,
    label: dashboard.nextStep.label,
    platforms: dashboard.nextStep.platforms,
  });
}
