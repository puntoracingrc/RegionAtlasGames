import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { withReviewedPs2Photos } from "./ps2-reviewed-market-photos";
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
    const profiles = JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data", "ps2-edition-evidence.json.gz"))).toString("utf8")) as Record<string, Ps2EditionDetails>;
    evidence = Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, withReviewedPs2Photos(id, profile)]));
  }
  return evidence?.[catalogId];
}
