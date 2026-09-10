import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Ps1EditionDetails } from "./ps1-regional";
import type { GameDetails } from "./types";

let evidence: Record<string, Ps1EditionDetails> | undefined;
type Ps1Work = {
  id: string;
  title: string;
  catalogIds: string[];
  legacyContextCatalogIds: string[];
  commonDetails: Pick<Partial<GameDetails>, "genres" | "series">;
  commonDetailsSources: Record<string, string[]>;
};
let works: Record<string, Ps1Work> | undefined;

export function getPs1Work(workId: string | null | undefined): Ps1Work | undefined {
  if (!workId) return undefined;
  if (!works) works = JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data", "ps1-works.json.gz"))).toString("utf8")).works;
  return works?.[workId];
}

export function getPs1EditionDetails(catalogId: string): Ps1EditionDetails | undefined {
  if (!catalogId.startsWith("ps1-")) return undefined;
  if (!evidence) {
    evidence = JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data", "ps1-edition-evidence.json.gz"))).toString("utf8"));
  }
  return evidence?.[catalogId];
}
