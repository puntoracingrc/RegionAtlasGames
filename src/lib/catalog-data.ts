import { readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogGame } from "./types";

// Keep the authoritative JSON as a runtime file. A static JSON import embeds
// another full copy in every server chunk that also needs filesystem access.
export const catalogData = JSON.parse(
  readFileSync(path.join(process.cwd(), "data", "catalog.json"), "utf8"),
) as CatalogGame[];
