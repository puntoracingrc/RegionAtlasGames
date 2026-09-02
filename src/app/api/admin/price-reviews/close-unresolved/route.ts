import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  closeUnresolvedPriceReviewItems,
  type PriceReviewCloseUnresolvedInput,
} from "@/lib/admin-price-review";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as PriceReviewCloseUnresolvedInput | null;
  if (!body) {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }
  const result = await closeUnresolvedPriceReviewItems(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
