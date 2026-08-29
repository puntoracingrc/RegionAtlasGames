import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import type { PriceReviewTriageFilter } from "@/lib/admin-price-review";
import { startPriceReviewPcImageJob } from "@/lib/admin-price-review";

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    platformSlug?: string;
    source?: string;
    query?: string;
    mediaLimit?: number;
    triageBucket?: string;
  } | null;
  const result = await startPriceReviewPcImageJob({
    platformSlug: body?.platformSlug,
    source: body?.source,
    query: body?.query,
    mediaLimit: body?.mediaLimit,
    triageBucket: body?.triageBucket as PriceReviewTriageFilter | undefined,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
