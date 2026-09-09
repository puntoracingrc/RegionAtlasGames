import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { clonePriceReviewCatalogRegion } from "@/lib/admin-price-review";

type RouteParams = { params: Promise<{ reviewId: string }> };
export const maxDuration = 300;

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const reviewId = decodeURIComponent((await params).reviewId);
  const body = (await request.json().catch(() => null)) as {
    sourceCatalogId?: string;
    expectedUpdatedAt?: string | null;
    region?: string;
  } | null;
  const result = await clonePriceReviewCatalogRegion(reviewId, {
    sourceCatalogId: body?.sourceCatalogId,
    expectedUpdatedAt: body?.expectedUpdatedAt,
    region: body?.region,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
