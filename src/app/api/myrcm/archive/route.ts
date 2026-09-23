import { appendRaceArchive, listRaceArchives, raceArchiveSummary, raceDaySummary, readRaceArchive, sanitizeRaceArchiveUpdate } from "@/lib/myrcm-race-archive";
import { checkRequestRateLimit, rateLimitHeaders, readJsonBody } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHosts = [request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(), request.headers.get("host"), new URL(request.url).host].filter(Boolean);
    return requestHosts.includes(originHost);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventKey = searchParams.get("event")?.trim() ?? "";
  const raceId = searchParams.get("race")?.trim() ?? "";
  if (!/^\d{1,12}$/.test(eventKey) || (raceId && !/^[a-z0-9-]{3,180}$/.test(raceId))) {
    return Response.json({ error: "Archivo MyRCM no válido." }, { status: 400 });
  }
  if (raceId) {
    const archive = await readRaceArchive(eventKey, raceId);
    if (!archive) return Response.json({ error: "La manga archivada no existe." }, { status: 404 });
    return Response.json({ archive }, { headers: { "Cache-Control": "public, max-age=3, s-maxage=5, stale-while-revalidate=15" } });
  }
  const archives = await listRaceArchives(eventKey);
  return Response.json({ eventKey, jornada: raceDaySummary(eventKey, archives), archives }, { headers: { "Cache-Control": "public, max-age=3, s-maxage=5, stale-while-revalidate=15" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const body = await readJsonBody<Record<string, unknown>>(request, 512 * 1024);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  let update;
  try {
    update = sanitizeRaceArchiveUpdate(body.data);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Archivo de carrera no válido." }, { status: 400 });
  }
  const rate = await checkRequestRateLimit(request, { namespace: "myrcm-archive", identity: update.eventKey, limit: 90, windowMs: 60_000 });
  if (!rate.allowed) return Response.json({ error: "Demasiadas actualizaciones de archivo." }, { status: 429, headers: rateLimitHeaders(rate) });
  try {
    const archive = await appendRaceArchive(update);
    return Response.json({ ok: true, archive: raceArchiveSummary(archive) }, { headers: { ...rateLimitHeaders(rate), "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: "No se pudo guardar la manga.", detail: error instanceof Error ? error.message : "Error desconocido" }, { status: 503, headers: rateLimitHeaders(rate) });
  }
}
