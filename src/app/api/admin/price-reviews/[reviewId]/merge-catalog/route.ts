import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { mergePriceReviewCatalogGames } from "@/lib/admin-price-review";

type RouteParams = { params: Promise<{ reviewId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const reviewId = decodeURIComponent((await params).reviewId);
  const body = (await request.json().catch(() => null)) as { catalogIds?: string[] } | null;
  const result = await mergePriceReviewCatalogGames(reviewId, { catalogIds: body?.catalogIds });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
