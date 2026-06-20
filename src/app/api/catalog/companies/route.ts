import { NextResponse } from "next/server";
import {
  COMPANY_PAGE_SIZE,
  COMPANY_SORT_OPTIONS,
  DEFAULT_COMPANY_FILTERS,
  filterCompanies,
  getCompanyExplorerData,
  type CompanyRoleFilter,
  type CompanySort,
} from "@/lib/company-index";

const ROLE_FILTERS: CompanyRoleFilter[] = ["all", "publishers", "developers", "both"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role") ?? DEFAULT_COMPANY_FILTERS.role;
  const sortParam = url.searchParams.get("sort") ?? DEFAULT_COMPANY_FILTERS.sort;
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const filters = {
    ...DEFAULT_COMPANY_FILTERS,
    q: url.searchParams.get("q") ?? DEFAULT_COMPANY_FILTERS.q,
    initial: url.searchParams.get("initial") ?? DEFAULT_COMPANY_FILTERS.initial,
    role: ROLE_FILTERS.includes(roleParam as CompanyRoleFilter)
      ? (roleParam as CompanyRoleFilter)
      : DEFAULT_COMPANY_FILTERS.role,
    platform: url.searchParams.get("platform") ?? DEFAULT_COMPANY_FILTERS.platform,
    genre: url.searchParams.get("genre") ?? DEFAULT_COMPANY_FILTERS.genre,
    sort: COMPANY_SORT_OPTIONS.some((option) => option.value === sortParam)
      ? (sortParam as CompanySort)
      : DEFAULT_COMPANY_FILTERS.sort,
  };

  const filtered = filterCompanies(getCompanyExplorerData().companies, filters);
  const start = (page - 1) * COMPANY_PAGE_SIZE;

  return NextResponse.json({
    items: filtered.slice(start, start + COMPANY_PAGE_SIZE),
    total: filtered.length,
  });
}
