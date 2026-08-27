import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { publishStoredMarketEstimates } from "@/lib/market-research-service";
import { readJsonBody } from "@/lib/request-security";

type RouteParams = { params: Promise<{ catalogId: string }> };
type PublishBody = { condition?: "loose" | "game_manual" | "complete" | "sealed" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const admin = await assertAdminApi();
  if (!admin) return response({ error: "No autorizado." }, 401);
  const parsed = await readJsonBody<PublishBody>(request, 2_048);
  if (!parsed.ok) return response({ error: parsed.error }, parsed.status);
  const condition = parsed.data.condition;
  if (condition && !["loose", "game_manual", "complete", "sealed"].includes(condition)) {
    return response({ error: "Estado físico no válido." }, 400);
  }
  const catalogId = decodeURIComponent((await params).catalogId);
  try {
    const result = await publishStoredMarketEstimates({
      catalogId,
      condition,
      publishedBy: admin.email,
    });
    return "error" in result ? response(result, 400) : response(result);
  } catch (error) {
    console.error("[admin-market-publish] request failed", {
      catalogId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return response({ error: "No se pudo publicar la estimación." }, 500);
  }
}
