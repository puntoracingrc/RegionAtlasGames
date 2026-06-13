import { NextResponse } from "next/server";
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

  const summary = await getCatalogStagingSummary(20);
  return NextResponse.json({ ok: true, summary });
}
