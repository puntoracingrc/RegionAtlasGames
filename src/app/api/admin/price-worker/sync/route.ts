import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { syncPriceWorkerCode } from "@/lib/price-worker-sync";

export async function POST() {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const result = await syncPriceWorkerCode();
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
