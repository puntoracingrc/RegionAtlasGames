import { NextResponse } from "next/server";
import { getAdminPriceDashboard } from "@/lib/admin-price-dashboard";
import { startAdminPriceCollectJob } from "@/lib/admin-price-collect";
import { recordAdminPriceCronAttempt } from "@/lib/admin-price-cron-log";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const userAgent = request.headers.get("user-agent");
  if (!authorized(request)) {
    await recordAdminPriceCronAttempt({
      status: "blocked",
      message: "Intento no autorizado. Revisa CRON_SECRET en Vercel si el cron legítimo queda bloqueado.",
      userAgent,
    });
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const dashboard = await getAdminPriceDashboard();
  const step = dashboard.nextStep.slug;
  if (!step) {
    await recordAdminPriceCronAttempt({
      status: "error",
      message: "No hay paso de rotación programado.",
      userAgent,
    });
    return NextResponse.json({ ok: false, error: "No hay paso de rotación programado." }, { status: 400 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  if (dryRun) {
    const attempt = await recordAdminPriceCronAttempt({
      status: "skipped",
      step,
      label: dashboard.nextStep.label,
      message: "Prueba seca: cron verificado sin lanzar recolección.",
      userAgent,
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      attempt,
      step,
      label: dashboard.nextStep.label,
      platforms: dashboard.nextStep.platforms,
    });
  }

  const started = await startAdminPriceCollectJob({
    platformSlug: step,
    advanceRotation: true,
  });

  if ("error" in started) {
    await recordAdminPriceCronAttempt({
      status: "error",
      step,
      label: dashboard.nextStep.label,
      message: started.error,
      userAgent,
    });
    return NextResponse.json({ ok: false, error: started.error, step }, { status: 400 });
  }

  await recordAdminPriceCronAttempt({
    status: "started",
    step,
    label: dashboard.nextStep.label,
    jobId: started.jobId,
    message: "Recolección automática lanzada.",
    userAgent,
  });

  return NextResponse.json({
    ok: true,
    jobId: started.jobId,
    step,
    label: dashboard.nextStep.label,
    platforms: dashboard.nextStep.platforms,
  });
}
