import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { resolveCatalogIdParam } from "@/lib/catalog";
import { decideStoredCoverCandidate } from "@/lib/market-research-service";
import { readJsonBody } from "@/lib/request-security";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = { params: Promise<{ catalogId: string; candidateId: string }> };
type CoverBody = { action?: "approve" | "reject"; confirmMismatch?: boolean };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const admin = await assertAdminApi();
  if (!admin) return response({ error: "No autorizado." }, 401);
  const parsed = await readJsonBody<CoverBody>(request, 2_048);
  if (!parsed.ok) return response({ error: parsed.error }, parsed.status);
  if (!parsed.data.action || !["approve", "reject"].includes(parsed.data.action)) {
    return response({ error: "Acción no válida." }, 400);
  }
  const routeParams = await params;
  try {
    const result = await decideStoredCoverCandidate({
      catalogId: resolveCatalogIdParam(routeParams.catalogId),
      candidateId: decodeURIComponent(routeParams.candidateId),
      action: parsed.data.action,
      confirmMismatch: parsed.data.confirmMismatch === true,
      reviewedBy: admin.email,
    });
    return "error" in result ? response(result, 400) : response(result);
  } catch (error) {
    console.error("[admin-market-cover] decision failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return response({ error: "No se pudo aplicar la decisión de portada." }, 500);
  }
}
