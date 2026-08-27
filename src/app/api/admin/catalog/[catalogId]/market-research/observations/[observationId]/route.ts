import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { setMarketObservationReview } from "@/lib/market-research-service";
import { readJsonBody } from "@/lib/request-security";

type RouteParams = { params: Promise<{ catalogId: string; observationId: string }> };
type ReviewBody = { status?: "accepted" | "pending" | "rejected" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const admin = await assertAdminApi();
  if (!admin) return response({ error: "No autorizado." }, 401);
  const parsed = await readJsonBody<ReviewBody>(request, 2_048);
  if (!parsed.ok) return response({ error: parsed.error }, parsed.status);
  if (!parsed.data.status || !["accepted", "pending", "rejected"].includes(parsed.data.status)) {
    return response({ error: "Decisión no válida." }, 400);
  }
  const routeParams = await params;
  try {
    const result = await setMarketObservationReview({
      catalogId: decodeURIComponent(routeParams.catalogId),
      observationId: decodeURIComponent(routeParams.observationId),
      status: parsed.data.status,
      reviewedBy: admin.email,
    });
    return "error" in result ? response(result, 404) : response({ ok: true, stored: result });
  } catch (error) {
    console.error("[admin-market-observation] review failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return response({ error: "No se pudo guardar la decisión." }, 500);
  }
}
