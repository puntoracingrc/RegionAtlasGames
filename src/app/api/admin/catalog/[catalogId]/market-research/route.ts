import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { getPublishedGameForAdmin } from "@/lib/admin-catalog-publish";
import { researchCoverCandidates } from "@/lib/cover-research";
import { EbayApiError, EbayAuthError } from "@/lib/ebay/ebay-errors";
import { researchEbayMarket } from "@/lib/ebay/ebay-research";

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
  return { message: "eBay no ha respondido correctamente. No se ha modificado ningún dato.", status: 502 };
}

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) return response({ error: "No autorizado." }, 401);

  const catalogId = decodeURIComponent((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) return response({ error: "Juego no encontrado." }, 404);

  try {
    const ebay = await researchEbayMarket(resolved.game, resolved.details);
    const covers = await researchCoverCandidates(resolved.game, resolved.details, ebay);
    return response({
      ok: true,
      readOnly: true,
      ebay,
      covers,
    });
  } catch (error) {
    if (error instanceof EbayAuthError || error instanceof EbayApiError) {
      const safe = safeEbayError(error);
      return response({ error: safe.message, readOnly: true }, safe.status);
    }
    console.error("[admin-market-research] request failed", {
      catalogId: resolved.game.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return response({ error: "El análisis no ha podido terminar. No se ha modificado ningún dato.", readOnly: true }, 500);
  }
}
