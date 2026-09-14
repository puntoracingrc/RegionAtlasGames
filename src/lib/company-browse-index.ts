import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { DEFAULT_COMPANY_FILTERS, type CompanyExplorerData } from "./company-explorer-types";
import {
  COMPANY_INITIAL_RESULT_COUNT,
  companyInitial,
  filterCompanies,
} from "./company-explorer-filter";

const INDEX_VERSION = 2;
const INDEX_FILE = "company-browse-index.json.gz";

type CompanyBrowseIndexPayload = {
  version: number;
  data: CompanyExplorerData;
};

export type CompanyExplorerInitialData = Omit<CompanyExplorerData, "companies"> & {
  companies: CompanyExplorerData["companies"];
  totalCount: number;
  initials: string[];
  grouped: {
    publishers: CompanyExplorerData["companies"];
    developers: CompanyExplorerData["companies"];
  } | null;
};

let cache: CompanyExplorerData | null = null;

export function getCompanyBrowseData(): CompanyExplorerData {
  if (cache) return cache;
  const compressed = readFileSync(path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "index",
    INDEX_FILE,
  ));
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8")) as CompanyBrowseIndexPayload;
  if (payload.version !== INDEX_VERSION || !Array.isArray(payload.data?.companies)) {
    throw new Error(`Índice de compañías incompatible: ${INDEX_FILE}`);
  }
  cache = payload.data;
  return cache;
}

export function getCompanyBrowseInitialData(): CompanyExplorerInitialData {
  const data = getCompanyBrowseData();
  const available = new Set(data.companies.map((company) => companyInitial(company.name)));
  const initials = [
    ...(available.has("0-9") ? ["0-9"] : []),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((letter) => available.has(letter)),
  ];
  const publishers = filterCompanies(data.companies, {
    ...DEFAULT_COMPANY_FILTERS,
    role: "publishers",
    sort: "games-desc",
  }).slice(0, 12);
  const developers = filterCompanies(data.companies, {
    ...DEFAULT_COMPANY_FILTERS,
    role: "developers",
    sort: "games-desc",
  }).slice(0, 12);
  const companies = filterCompanies(data.companies, DEFAULT_COMPANY_FILTERS);
  return {
    ...data,
    companies: companies.slice(0, COMPANY_INITIAL_RESULT_COUNT),
    totalCount: companies.length,
    initials,
    grouped: publishers.length || developers.length ? { publishers, developers } : null,
  };
}
