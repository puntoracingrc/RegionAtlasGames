import { NextResponse } from "next/server";
import { enrichCatalogStagingBatch } from "@/lib/catalog-staging-enrich";
import { getCatalogStagingSummary } from "@/lib/catalog-staging";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(30, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "12", 10) || 12));

  const enrich = await enrichCatalogStagingBatch({ limit, delayMs: 900 });
  const summary = await getCatalogStagingSummary();

  return NextResponse.json({
    ok: true,
    enrich,
    summary,
  });
}
