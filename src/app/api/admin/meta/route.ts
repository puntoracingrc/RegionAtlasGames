import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { platformOptions, REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { companies } from "@/lib/indexes";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(400, Math.max(20, Number.parseInt(url.searchParams.get("limit") ?? "200", 10) || 200));

  const companyList = Object.values(companies)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"))
    .slice(0, limit)
    .map((c) => ({ name: c.name, slug: c.slug, gameCount: c.gameCount }));

  return NextResponse.json({
    ok: true,
    platforms: platformOptions().map((p) => ({
      slug: p.slug,
      name: p.name,
      shortName: p.shortName,
    })),
    regions: REGION_OPTIONS,
    companies: companyList,
  });
}
