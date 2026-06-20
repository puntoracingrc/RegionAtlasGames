import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readAdminPriceJob } from "@/lib/admin-price-collect";
import { applyAdminPriceJobResults } from "@/lib/admin-price-job-apply";

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

  if (job.status === "done" && job.catalogId) {
    const applied = await applyAdminPriceJobResults(jobId);
    if ("error" in applied) {
      return NextResponse.json({
        ok: true,
        job: {
          ...job,
          autoApplied: false,
          autoApplyError: applied.error,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      job: {
        ...job,
        autoApplied: true,
        autoApplySummary: `${applied.updated} actualizados · ${applied.skipped} sin cambios · ${applied.errors.length} errores`,
      },
    });
  }

  return NextResponse.json({ ok: true, job });
}
