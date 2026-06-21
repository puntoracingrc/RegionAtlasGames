import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { listPriceReviewItems } from "@/lib/admin-price-review";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("limit") || "40", 10) || 40));
  return NextResponse.json({ ok: true, items: await listPriceReviewItems(limit) });
}
