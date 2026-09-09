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
  try {
    return NextResponse.json({ ok: true, ...(await getPriceReviewTriageView(limit, filter, {
      platformSlug: searchParams.get("platform") || undefined,
      source: searchParams.get("source") || undefined,
      query: searchParams.get("q") || undefined,
      offset: Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0),
      revision: searchParams.get("revision") || undefined,
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer la cola." }, { status: 503 });
  }
}
