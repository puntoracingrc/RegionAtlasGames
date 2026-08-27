import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  getMarketResearchBatch,
  setMarketResearchBatchStatus,
} from "@/lib/market-research-batches";
import { readJsonBody } from "@/lib/request-security";

type RouteParams = { params: Promise<{ batchId: string }> };
type ActionBody = { action?: "pause" | "resume" | "cancel" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) return response({ error: "No autorizado." }, 401);
  const batchId = decodeURIComponent((await params).batchId);
  try {
    const batch = await getMarketResearchBatch(batchId);
    return batch ? response({ ok: true, batch }) : response({ error: "Lote no encontrado." }, 404);
  } catch (error) {
    console.error("[admin-market-batch] read failed", error);
    return response({ error: "No se pudo leer el lote." }, 500);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) return response({ error: "No autorizado." }, 401);
  const parsed = await readJsonBody<ActionBody>(request, 2_048);
  if (!parsed.ok) return response({ error: parsed.error }, parsed.status);
  if (!parsed.data.action || !["pause", "resume", "cancel"].includes(parsed.data.action)) {
    return response({ error: "Acción no válida." }, 400);
  }
  const batchId = decodeURIComponent((await params).batchId);
  try {
    const batch = await setMarketResearchBatchStatus(batchId, parsed.data.action);
    return "error" in batch ? response(batch, 400) : response({ ok: true, batch });
  } catch (error) {
    console.error("[admin-market-batch] action failed", error);
    return response({ error: "No se pudo actualizar el lote." }, 500);
  }
}
