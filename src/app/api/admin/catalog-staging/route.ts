import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { getCatalogStagingSummary } from "@/lib/catalog-staging";

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const admin = await assertAdminApi();
  if (!admin && !cronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const summary = await getCatalogStagingSummary(20);
  return NextResponse.json({ ok: true, summary });
}
