import { NextResponse } from "next/server";
import {
  COMPANY_ACTIVITY_OPTIONS,
  COMPANY_MARKET_OPTIONS,
  COMPANY_PAGE_SIZE,
  COMPANY_SIZE_OPTIONS,
  COMPANY_SORT_OPTIONS,
  COMPANY_STATUS_OPTIONS,
  DEFAULT_COMPANY_FILTERS,
  filterCompanies,
  getCompanyExplorerData,
  type CompanyActivityFilter,
  type CompanyCatalogSizeFilter,
  type CompanyIndexFilters,
  type CompanyMarketFilter,
  type CompanyRoleFilter,
  type CompanySort,
  type CompanyStatusFilter,
} from "@/lib/company-index";

const ROLE_FILTERS: CompanyRoleFilter[] = ["all", "publishers", "developers", "both"];

function allowedOption<T extends string>(
  value: string | null,
  options: { value: T }[],
  fallback: T,
): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role") ?? DEFAULT_COMPANY_FILTERS.role;
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const filters: CompanyIndexFilters = {
    ...DEFAULT_COMPANY_FILTERS,
    q: url.searchParams.get("q") ?? DEFAULT_COMPANY_FILTERS.q,
    initial: url.searchParams.get("initial") ?? DEFAULT_COMPANY_FILTERS.initial,
    role: ROLE_FILTERS.includes(roleParam as CompanyRoleFilter)
      ? (roleParam as CompanyRoleFilter)
      : DEFAULT_COMPANY_FILTERS.role,
    platform: url.searchParams.get("platform") ?? DEFAULT_COMPANY_FILTERS.platform,
    genre: url.searchParams.get("genre") ?? DEFAULT_COMPANY_FILTERS.genre,
    size: allowedOption<CompanyCatalogSizeFilter>(
      url.searchParams.get("size"),
      COMPANY_SIZE_OPTIONS,
      DEFAULT_COMPANY_FILTERS.size,
    ),
    status: allowedOption<CompanyStatusFilter>(
      url.searchParams.get("status"),
      COMPANY_STATUS_OPTIONS,
      DEFAULT_COMPANY_FILTERS.status,
    ),
    activity: allowedOption<CompanyActivityFilter>(
      url.searchParams.get("activity"),
      COMPANY_ACTIVITY_OPTIONS,
      DEFAULT_COMPANY_FILTERS.activity,
    ),
    market: allowedOption<CompanyMarketFilter>(
      url.searchParams.get("market"),
      COMPANY_MARKET_OPTIONS,
      DEFAULT_COMPANY_FILTERS.market,
    ),
    sort: allowedOption<CompanySort>(
      url.searchParams.get("sort"),
      COMPANY_SORT_OPTIONS,
      DEFAULT_COMPANY_FILTERS.sort,
    ),
  };

  const filtered = filterCompanies(getCompanyExplorerData().companies, filters);
  const start = (page - 1) * COMPANY_PAGE_SIZE;

  return NextResponse.json({
    items: filtered.slice(start, start + COMPANY_PAGE_SIZE),
    total: filtered.length,
  });
}
