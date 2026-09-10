import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogGame } from "./types";

// Keep the authoritative JSON as a runtime file. A static JSON import embeds
// another full copy in every server chunk that also needs filesystem access.
function readCatalogData(): string {
  try {
    return readFileSync(path.join(process.cwd(), "data", "catalog.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Admin tools can change cwd to isolate mutable overlays. The immutable
    // catalog still belongs to this application, independently of that cwd.
    const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
    return readFileSync(path.resolve(sourceDirectory, "../../data/catalog.json"), "utf8");
  }
}

export const catalogData = JSON.parse(readCatalogData()) as CatalogGame[];
