import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { autoReviewRetroplayzonePrices } from "@/lib/admin-price-review";

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { apply?: boolean } | null;
  const result = await autoReviewRetroplayzonePrices({ apply: Boolean(body?.apply) });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
