import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { resolveCatalogIdParam } from "@/lib/catalog";
import { EbayApiError, EbayAuthError } from "@/lib/ebay/ebay-errors";
import { collectMarketResearchForCatalog } from "@/lib/market-research-service";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = { params: Promise<{ catalogId: string }> };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function safeEbayError(error: EbayAuthError | EbayApiError): { message: string; status: number } {
  if (error.code === "ebay_disabled") {
    return { message: "La integración de eBay está desactivada en este entorno.", status: 503 };
  }
  if (error.code.startsWith("missing_")) {
    return { message: "Falta completar la configuración privada de eBay.", status: 503 };
  }
  return { message: "eBay no ha respondido correctamente. No se ha guardado este intento.", status: 502 };
}

export async function POST(_request: Request, { params }: RouteParams) {
  const admin = await assertAdminApi();
  if (!admin) return response({ error: "No autorizado." }, 401);
  const catalogId = resolveCatalogIdParam((await params).catalogId);

  try {
    const result = await collectMarketResearchForCatalog(catalogId, admin.email);
    if ("error" in result) return response({ error: result.error }, 404);
    return response({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EbayAuthError || error instanceof EbayApiError) {
      const safe = safeEbayError(error);
      return response({ error: safe.message }, safe.status);
    }
    console.error("[admin-market-collect] request failed", {
      catalogId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return response({ error: "La recolección no ha podido terminar." }, 500);
  }
}
