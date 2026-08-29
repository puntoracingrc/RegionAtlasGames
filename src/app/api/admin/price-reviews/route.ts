import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  getPriceReviewTriageView,
  normalizePriceReviewTriageFilter,
} from "@/lib/admin-price-review";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(1_000, Number.parseInt(searchParams.get("limit") || "200", 10) || 200));
  const filter = normalizePriceReviewTriageFilter(searchParams.get("bucket"));
  return NextResponse.json({ ok: true, ...(await getPriceReviewTriageView(limit, filter)) });
}
