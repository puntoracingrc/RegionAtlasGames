export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MyRcmSection = { key: string; name: string };
type MyRcmRun = { key: string; type: string; phase: string; group: string; label: string; status: string };

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

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function parseSections(html: string, eventKey: string): MyRcmSection[] {
  const sections: MyRcmSection[] = [];
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const name = row.match(/data-section-name="([^"]+)"/)?.[1];
    const key = row.match(new RegExp(`/report/${eventKey}/(\\d+)`))?.[1];
    if (name && key && !sections.some((section) => section.key === key)) {
      sections.push({ key, name: decodeHtml(name) });
    }
  }
  return sections;
}

function selectSection(sections: MyRcmSection[], requested: string) {
  const target = normalize(requested);
  const exact = sections.find((section) => normalize(section.name) === target);
  if (exact) return exact;
  const targetTokens = target.split(" ").filter(Boolean);
  const best = [...sections]
    .map((section) => {
      const normalized = normalize(section.name);
      const score = targetTokens.filter((token) => normalized.includes(token)).length;
      return { section, score };
    })
    .sort((a, b) => b.score - a.score)[0];
  return best?.score ? best.section : undefined;
}

function parseRanking(html: string) {
  const ranking: Array<{ position: number; name: string; points: number | null }> = [];
  const rows = html.match(/<tr class="[^"]*">[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const position = Number(row.match(/class="report-position">(\d+)<\/strong>/)?.[1]);
    const driver = row.match(/<td data-label="Driver">([\s\S]*?)<\/td>/)?.[1];
    if (!position || !driver) continue;
    const pointsValue = row.match(/<td data-label="P">[\s\S]*?<strong>(\d+)<\/strong>/)?.[1];
    ranking.push({ position, name: decodeHtml(driver), points: pointsValue ? Number(pointsValue) : null });
  }
  return ranking.sort((a, b) => a.position - b.position);
}

function lastMatch(html: string, pattern: RegExp) {
  const matches = [...html.matchAll(pattern)];
  return matches.length ? decodeHtml(matches[matches.length - 1][1]) : "";
}

function parseRuns(html: string): MyRcmRun[] {
  const runs: MyRcmRun[] = [];
  const seen = new Set<string>();
  const buttonPattern = /<button class="run-button[^>]*data-href="[^"]*reportKey=(\d+)(?:&amp;|&)reportType=([^"]+)"[^>]*>[\s\S]*?<\/button>/g;
  for (const match of html.matchAll(buttonPattern)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    const block = match[0];
    const before = html.slice(0, match.index);
    const label = block.match(/run-button__copy[\s\S]*?<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "Manga";
    const status = block.match(/<span class="chip[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? "";
    runs.push({
      key: match[1],
      type: decodeHtml(match[2]),
      phase: lastMatch(before, /<span class="phase__title">[\s\S]*?<strong>([\s\S]*?)<\/strong>/g),
      group: lastMatch(before, /<span class="group__title">[\s\S]*?<strong>([\s\S]*?)<\/strong>/g),
      label: decodeHtml(label),
      status: decodeHtml(status).toLowerCase(),
    });
  }
  return runs;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventKey = searchParams.get("event")?.trim() ?? "";
  const requestedSection = searchParams.get("section")?.trim() ?? "";
  if (!/^\d{1,12}$/.test(eventKey) || !requestedSection || requestedSection.length > 120) {
    return Response.json({ error: "Parámetros de MyRCM inválidos." }, { status: 400 });
  }

  try {
    const eventResponse = await fetch(`https://www.myrcm.ch/en/live/${eventKey}`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!eventResponse.ok) {
      return Response.json({ error: "MyRCM no ha devuelto la ficha del evento." }, { status: 502 });
    }
    const eventHtml = await eventResponse.text();
    const sections = parseSections(eventHtml, eventKey);
    const section = selectSection(sections, requestedSection);
    if (!section) {
      return Response.json({ eventKey, requestedSection, sections, ranking: [], status: "section-pending" });
    }

    const overviewResponse = await fetch(`https://www.myrcm.ch/en/report/${eventKey}/${section.key}`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(8_000),
    });
    const runs = overviewResponse.ok ? parseRuns(await overviewResponse.text()) : [];
    const query = new URLSearchParams({ reportKey: "203", reportType: "final", cType: "json", ajax: "true" });
    const rankingResponse = await fetch(`https://www.myrcm.ch/en/report/${eventKey}/${section.key}?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!rankingResponse.ok) {
      return Response.json({ error: "MyRCM no ha devuelto la clasificación agregada." }, { status: 502 });
    }
    const payload = (await rankingResponse.json()) as { STATUS?: string; DATA?: string[] };
    const ranking = parseRanking(Array.isArray(payload.DATA) ? payload.DATA.join("") : "");
    return Response.json(
      { eventKey, requestedSection, section, sections, runs, ranking, status: ranking.length ? "available" : "ranking-pending", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, max-age=2, s-maxage=5, stale-while-revalidate=10" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return Response.json({ error: "No se pudo consultar MyRCM.", detail: message }, { status: 502 });
  }
}
