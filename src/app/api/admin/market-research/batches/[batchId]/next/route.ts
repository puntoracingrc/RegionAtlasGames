import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { processNextMarketResearchBatch } from "@/lib/market-research-batches";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = { params: Promise<{ batchId: string }> };

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", ...headers },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const admin = await assertAdminApi();
  if (!admin) return response({ error: "No autorizado." }, 401);
  const rate = await checkRequestRateLimit(request, {
    namespace: "admin_market_batch",
    identity: admin.email,
    limit: 80,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return response(
      { error: "Límite de recolección administrativa alcanzado. Reanuda el lote más tarde." },
      429,
      rateLimitHeaders(rate),
    );
  }
  const batchId = decodeURIComponent((await params).batchId);
  try {
    const result = await processNextMarketResearchBatch(batchId, admin.email);
    return "error" in result ? response(result, 400) : response({ ok: true, ...result });
  } catch (error) {
    console.error("[admin-market-batch] processing failed", {
      batchId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return response({ error: "No se pudo procesar el siguiente juego del lote." }, 500);
  }
}
