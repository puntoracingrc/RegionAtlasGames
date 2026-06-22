import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readCatalogEntityAuditState, startCatalogEntityAuditPcJob } from "@/lib/admin-catalog-hygiene";

export async function GET() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(await readCatalogEntityAuditState());
}

export async function POST() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const result = await startCatalogEntityAuditPcJob();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
