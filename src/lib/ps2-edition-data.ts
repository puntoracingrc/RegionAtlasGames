import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Ps2EditionDetails } from "./ps2-regional";
import type { GameDetails } from "./types";

let evidence: Record<string, Ps2EditionDetails> | undefined;
type Ps2Work = {
  id: string;
  title: string;
  catalogIds: string[];
  legacyContextCatalogIds: string[];
  commonDetails: Pick<Partial<GameDetails>, "genres" | "series">;
  commonDetailsSources: Record<string, string[]>;
};
let works: Record<string, Ps2Work> | undefined;

export function getPs2Work(workId: string | null | undefined): Ps2Work | undefined {
  if (!workId) return undefined;
  if (!works) works = JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data", "ps2-works.json.gz"))).toString("utf8")).works;
  return works?.[workId];
}

export function getPs2EditionDetails(catalogId: string): Ps2EditionDetails | undefined {
  if (!catalogId.startsWith("ps2-")) return undefined;
  if (!evidence) {
    evidence = JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data", "ps2-edition-evidence.json.gz"))).toString("utf8"));
  }
  return evidence?.[catalogId];
}
