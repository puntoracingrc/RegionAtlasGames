export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function seconds(value: string) {
  const raw = value.replace(/^\(\d+\)\s*/, "").trim();
  const parts = raw.split(":").map(Number);
  if (!raw || parts.some(Number.isNaN) || parts.length > 3) return null;
  const result = parts.at(-1)! + (parts.length > 1 ? parts.at(-2)! * 60 : 0) + (parts.length > 2 ? parts.at(-3)! * 3600 : 0);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function parseLapTable(html: string) {
  const table = html.match(/<table class="[^"]*run-lap-table[^"]*">([\s\S]*?)<\/table>/)?.[1] ?? "";
  const header = table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
  const names = [...header.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].slice(1).map((match) => decodeHtml(match[1]));
  const drivers = names.map((name) => ({ name, laps: [] as Array<{ lap: number; seconds: number }> }));
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? table;
  for (const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => decodeHtml(match[1]));
    const lap = Number(cells[0]);
    if (!Number.isInteger(lap) || lap <= 0) continue;
    for (let index = 0; index < drivers.length; index += 1) {
      const value = seconds(cells[index + 1] ?? "");
      if (value) drivers[index].laps.push({ lap, seconds: value });
    }
  }
  return drivers;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventKey = searchParams.get("event")?.trim() ?? "";
  const sectionKey = searchParams.get("section")?.trim() ?? "";
  const reportKey = searchParams.get("report")?.trim() ?? "";
  const reportType = searchParams.get("type")?.trim() ?? "";
  if (![eventKey, sectionKey, reportKey].every((value) => /^\d{1,12}$/.test(value)) || !/^(final|qualy|timedPractice|controlledPractice)$/.test(reportType)) {
    return Response.json({ error: "Parámetros de informe MyRCM inválidos." }, { status: 400 });
  }
  try {
    const query = new URLSearchParams({ reportKey, reportType, cType: "json", ajax: "true" });
    const response = await fetch(`https://www.myrcm.ch/en/report/${eventKey}/${sectionKey}?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return Response.json({ error: "MyRCM no ha devuelto la lista de vueltas." }, { status: 502 });
    const payload = (await response.json()) as { STATUS?: string; DATA?: string[] };
    const drivers = parseLapTable(Array.isArray(payload.DATA) ? payload.DATA.join("") : "");
    return Response.json(
      { eventKey, sectionKey, reportKey, reportType, drivers, status: drivers.some((driver) => driver.laps.length) ? "available" : "lap-list-pending", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    return Response.json({ error: "No se pudo consultar el informe de vueltas de MyRCM.", detail }, { status: 502 });
  }
}
