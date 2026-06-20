import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/lib/cron-auth";
import { refreshEnabledNewsSections } from "@/lib/news-enrich";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronRequestAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const includePlatforms = url.searchParams.get("platforms") !== "0";
  const platformLimit = Math.min(
    12,
    Math.max(0, Number.parseInt(url.searchParams.get("platformLimit") ?? "6", 10) || 6),
  );

  const results = await refreshEnabledNewsSections({
    dryRun,
    includePlatforms,
    platformLimit,
  });

  return NextResponse.json({
    ok: true,
    dryRun,
    results: results.map((result) => ({
      section: result.section,
      topic: result.topic,
      query: result.query,
      fetched: result.fetched,
      saved: result.saved,
      titles: result.items.slice(0, 3).map((item) => item.title),
    })),
  });
}
