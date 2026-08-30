import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { decidePriceReviewItem } from "@/lib/admin-price-review";
import { normalizeOriginalGameContents } from "@/lib/original-game-contents";

type RouteParams = { params: Promise<{ reviewId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const reviewId = decodeURIComponent((await params).reviewId);
  const body = (await request.json().catch(() => null)) as {
    action?: "accept" | "reject";
    catalogId?: string;
    region?: string;
    condition?: "loose" | "game_manual" | "complete" | "sealed" | "unknown";
    note?: string;
    originalContents?: unknown;
  } | null;
  if (!body?.action || !["accept", "reject"].includes(body.action)) {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }
  if (body.originalContents !== undefined && !Array.isArray(body.originalContents)) {
    return NextResponse.json({ error: "Contenido original no válido." }, { status: 400 });
  }
  const result = await decidePriceReviewItem(reviewId, {
    action: body.action,
    catalogId: body.catalogId,
    region: body.region,
    condition: body.condition,
    note: body.note,
    ...(body.originalContents === undefined
      ? {}
      : { originalContents: normalizeOriginalGameContents(body.originalContents) }),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
