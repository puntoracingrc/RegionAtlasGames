import { authorizePriceConnector, parsePriceSubmission, PriceConnectorError } from "@/lib/direct-price-connector";
import { publishDirectPrice } from "@/lib/direct-price-publisher";
import { catalogOverlayEnabled } from "@/lib/catalog-runtime-overlay";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

function failure(error: unknown) {
  if (error instanceof PriceConnectorError) return Response.json({ ok: false, error: error.message }, { status: error.status, headers });
  console.error("[price-connector] publication failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ ok: false, error: "No se pudo confirmar la publicación. Reintenta exactamente el mismo lote." }, { status: 503, headers });
}

export async function GET(request: Request) {
  try {
    authorizePriceConnector(request);
    const persistentStorage = catalogOverlayEnabled();
    return Response.json({ ok: persistentStorage, schemaVersion: 1, persistentStorage, currency: "EUR", conditions: ["complete", "sealed"], formula: "missing => mean; existing => (existing + mean) / 2" }, { status: persistentStorage ? 200 : 503, headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    authorizePriceConnector(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new PriceConnectorError(415, "Se requiere application/json.");
    const limit = 256 * 1024;
    if (Number(request.headers.get("content-length")) > limit) throw new PriceConnectorError(413, "Lote demasiado grande; enviar una ficha por solicitud.");
    const reader = request.body?.getReader();
    if (!reader) throw new PriceConnectorError(400, "Falta el documento JSON.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) { await reader.cancel(); throw new PriceConnectorError(413, "Lote demasiado grande."); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new PriceConnectorError(400, "JSON no válido."); }
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode !== "preview" && mode !== "publish") throw new PriceConnectorError(400, "Indica mode=preview o mode=publish explícitamente.");
    const input = parsePriceSubmission(body);
    return Response.json(await publishDirectPrice(input, mode), { headers });
  } catch (error) { return failure(error); }
}
