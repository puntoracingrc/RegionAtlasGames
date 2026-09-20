import { authorizeCatalogConnector, CatalogConnectorError, parseCatalogSubmission } from "@/lib/direct-catalog-connector";
import { publishDirectCatalog } from "@/lib/direct-catalog-publisher";
import { catalogOverlayEnabled } from "@/lib/catalog-runtime-overlay";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

function failure(error: unknown) {
  if (error instanceof CatalogConnectorError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status, headers });
  }
  console.error("[catalog-connector] publication failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json(
    { ok: false, error: "No se pudo confirmar la publicación. Reintenta exactamente el mismo lote." },
    { status: 503, headers },
  );
}

export async function GET(request: Request) {
  try {
    authorizeCatalogConnector(request);
    const persistentStorage = catalogOverlayEnabled();
    return Response.json(
      { ok: persistentStorage, schemaVersion: 1, persistentStorage, regions: ["PAL España"] },
      { status: persistentStorage ? 200 : 503, headers },
    );
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    authorizeCatalogConnector(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      throw new CatalogConnectorError(415, "Se requiere application/json.");
    }
    const limit = 128 * 1024;
    if (Number(request.headers.get("content-length")) > limit) {
      throw new CatalogConnectorError(413, "Lote demasiado grande; enviar una ficha por solicitud.");
    }
    const reader = request.body?.getReader();
    if (!reader) throw new CatalogConnectorError(400, "Falta el documento JSON.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new CatalogConnectorError(413, "Lote demasiado grande.");
        }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new CatalogConnectorError(400, "JSON no válido."); }
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode !== "preview" && mode !== "publish") {
      throw new CatalogConnectorError(400, "Indica mode=preview o mode=publish explícitamente.");
    }
    return Response.json(await publishDirectCatalog(parseCatalogSubmission(body), mode), { headers });
  } catch (error) { return failure(error); }
}
