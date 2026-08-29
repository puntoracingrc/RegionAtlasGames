import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  readCatalogEntityAuditState,
  startCatalogEntityAuditPcJob,
  startCatalogEntityMigrationPlanPcJob,
} from "@/lib/admin-catalog-hygiene";

export async function GET() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(await readCatalogEntityAuditState());
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { action?: string; target?: string } | null;
  const action = body?.action ?? "audit";
  if (action !== "audit" && action !== "migration-plan") {
    return NextResponse.json({ error: "Acción de higiene no válida." }, { status: 400 });
  }
  const result = action === "migration-plan"
    ? await startCatalogEntityMigrationPlanPcJob(
        body?.target === "html_amp" || body?.target === "all" ? body.target : "percent27",
      )
    : await startCatalogEntityAuditPcJob();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
