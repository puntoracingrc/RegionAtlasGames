import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import type { PriceReviewCondition } from "@/lib/admin-price-review";
import { autoReviewRetroplayzonePrices } from "@/lib/admin-price-review";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      apply?: boolean;
      platformSlug?: string;
      source?: string;
      query?: string;
      assumedRegion?: string;
      assumedCondition?: string;
      useVision?: boolean;
      visionLimit?: number;
    } | null;
    const result = await autoReviewRetroplayzonePrices({
      apply: Boolean(body?.apply),
      platformSlug: body?.platformSlug,
      source: body?.source,
      query: body?.query,
      assumedRegion: body?.assumedRegion,
      assumedCondition: body?.assumedCondition === "none" ? "none" : body?.assumedCondition as PriceReviewCondition | undefined,
      useVision: Boolean(body?.useVision),
      visionLimit: body?.visionLimit,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo revisar automáticamente: ${message}` }, { status: 500 });
  }
}
