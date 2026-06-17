import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { startAdminPriceCollectJob, type AdminPriceCollectTarget } from "@/lib/admin-price-collect";

const MAX_TARGETS = 12;

function cleanTargets(value: unknown): AdminPriceCollectTarget[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const targets: AdminPriceCollectTarget[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const platformSlug = String(raw.platformSlug ?? "").trim();
    const region = String(raw.region ?? "").trim();
    if (!platformSlug) continue;
    const key = `${platformSlug}::${region}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ platformSlug, region: region || undefined });
  }
  return targets.slice(0, MAX_TARGETS);
}

export async function POST(request: Request) {
  try {
    if (!(await assertAdminApi())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const targets = cleanTargets(body?.targets);
    if (targets.length === 0) {
      return NextResponse.json({ error: "Selecciona al menos una plataforma o región." }, { status: 400 });
    }

    const estimateMinutes = Number(body?.estimateMinutes ?? 0) || undefined;
    const started = await startAdminPriceCollectJob({ targets, estimateMinutes });
    if ("error" in started) {
      return NextResponse.json({ error: started.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, jobId: started.jobId, targets, estimateMinutes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo lanzar el lote." },
      { status: 500 },
    );
  }
}
