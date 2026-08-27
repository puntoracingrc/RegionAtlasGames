import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  createMarketResearchBatch,
  listMarketResearchBatches,
} from "@/lib/market-research-batches";
import type { MarketCollectionMode } from "@/lib/market-research-types";
import { readJsonBody } from "@/lib/request-security";

type CreateBody = {
  platformSlug?: string;
  region?: string | null;
  mode?: MarketCollectionMode;
  limit?: number;
};

const MODES: MarketCollectionMode[] = ["missing_price", "missing_cover", "missing_any", "refresh"];

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET() {
  if (!(await assertAdminApi())) return response({ error: "No autorizado." }, 401);
  try {
    return response({ ok: true, batches: await listMarketResearchBatches(12) });
  } catch (error) {
    console.error("[admin-market-batches] list failed", error);
    return response({ error: "No se pudieron leer los lotes." }, 500);
  }
}

export async function POST(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) return response({ error: "No autorizado." }, 401);
  const parsed = await readJsonBody<CreateBody>(request, 4_096);
  if (!parsed.ok) return response({ error: parsed.error }, parsed.status);
  const platformSlug = parsed.data.platformSlug?.trim();
  const mode = parsed.data.mode;
  if (!platformSlug || !mode || !MODES.includes(mode)) {
    return response({ error: "Plataforma o tipo de lote no válidos." }, 400);
  }
  const limit = Number(parsed.data.limit ?? 10);
  if (!Number.isFinite(limit)) return response({ error: "Tamaño de lote no válido." }, 400);
  try {
    const batch = await createMarketResearchBatch({
      platformSlug,
      region: parsed.data.region,
      mode,
      limit,
      createdBy: admin.email,
    });
    return "error" in batch ? response(batch, 400) : response({ ok: true, batch }, 201);
  } catch (error) {
    console.error("[admin-market-batches] create failed", error);
    return response({ error: "No se pudo crear el lote." }, 500);
  }
}
