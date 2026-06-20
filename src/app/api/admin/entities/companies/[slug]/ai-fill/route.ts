import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { listAdminCompanies } from "@/lib/admin-entity-catalog";
import { fillAdminCompanyWithAi, type AdminCompanyAiTarget } from "@/lib/admin-company-ai-fill";

type RouteParams = { params: Promise<{ slug: string }> };

const VALID_TARGETS = new Set<AdminCompanyAiTarget>(["history", "logo", "website", "years", "relations", "seo"]);

function parseTargets(value: unknown): AdminCompanyAiTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (target): target is AdminCompanyAiTarget =>
      typeof target === "string" && VALID_TARGETS.has(target as AdminCompanyAiTarget),
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const companyRows = await listAdminCompanies({ q: slug, limit: 500 });
  const company = companyRows.find((row) => row.slug === slug);
  if (!company) {
    return NextResponse.json({ error: "Compañía no encontrada." }, { status: 404 });
  }
  const companyCandidates = await listAdminCompanies({ limit: 500 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    history?: unknown;
    logoUrl?: unknown;
    websiteUrl?: unknown;
    foundedYear?: unknown;
    closedYear?: unknown;
    status?: unknown;
    parentCompany?: { slug: string; name: string } | null;
    acquiredByCompany?: { slug: string; name: string } | null;
    mergedWithCompany?: { slug: string; name: string } | null;
    predecessorCompany?: { slug: string; name: string } | null;
    successorCompany?: { slug: string; name: string } | null;
    seoTitle?: unknown;
    seoDescription?: unknown;
    targets?: unknown;
  };

  const result = await fillAdminCompanyWithAi({
    slug,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : company.name,
    gameCount: company.gameCount ?? 0,
    history: typeof body.history === "string" ? body.history : null,
    logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : null,
    websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl : null,
    foundedYear: typeof body.foundedYear === "number" ? body.foundedYear : null,
    closedYear: typeof body.closedYear === "number" ? body.closedYear : null,
    status:
      body.status === "active" || body.status === "defunct" || body.status === "subsidiary" || body.status === "unknown"
        ? body.status
        : "unknown",
    parentCompany: body.parentCompany ?? null,
    acquiredByCompany: body.acquiredByCompany ?? null,
    mergedWithCompany: body.mergedWithCompany ?? null,
    predecessorCompany: body.predecessorCompany ?? null,
    successorCompany: body.successorCompany ?? null,
    seoTitle: typeof body.seoTitle === "string" ? body.seoTitle : null,
    seoDescription: typeof body.seoDescription === "string" ? body.seoDescription : null,
    companyCandidates: companyCandidates.map((candidate) => ({
      slug: candidate.slug,
      name: candidate.name,
    })),
    targets: parseTargets(body.targets),
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
