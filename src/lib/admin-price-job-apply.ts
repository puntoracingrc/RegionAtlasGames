import { updatePublishedCatalogPrices } from "./admin-catalog-publish";
import { PRICE_KEYS } from "./admin-price-patch";
import { priceWorkerPublicBaseUrl, readAdminPriceJob, type AdminPriceJobMeta } from "./admin-price-collect";
import { getCatalogGame } from "./catalog";
import type { CatalogGame } from "./types";

export type AdminPriceApplyResult =
  | {
      ok: true;
      jobId: string;
      checked: number;
      updated: number;
      skipped: number;
      errors: { catalogId: string; error: string }[];
    }
  | { error: string };

function targetMatches(game: CatalogGame, job: AdminPriceJobMeta): boolean {
  if (job.catalogId) return game.id === job.catalogId;
  if (job.platformSlug) {
    return game.platformSlug === job.platformSlug && (!job.region || game.region === job.region);
  }
  if (job.targets?.length) {
    return job.targets.some(
      (target) =>
        game.platformSlug === target.platformSlug && (!target.region || game.region === target.region),
    );
  }
  return false;
}

function pricePatchFromWorkerGame(workerGame: CatalogGame): Partial<Record<string, unknown>> {
  const patch: Partial<Record<string, unknown>> = {};
  for (const key of PRICE_KEYS) {
    patch[key] = workerGame[key];
  }
  return patch;
}

function priceFieldsChanged(localGame: CatalogGame, workerGame: CatalogGame): boolean {
  return PRICE_KEYS.some((key) => {
    const localValue = localGame[key] ?? null;
    const workerValue = workerGame[key] ?? null;
    return JSON.stringify(localValue) !== JSON.stringify(workerValue);
  });
}

async function fetchWorkerCatalog(): Promise<CatalogGame[] | { error: string }> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return { error: "Worker de precios no configurado." };
  const res = await fetch(`${base}/app/data/catalog.json`, { cache: "no-store" });
  if (!res.ok) return { error: `No se pudo leer el catálogo del worker (${res.status}).` };
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return { error: "El catálogo del worker no tiene formato válido." };
  return data as CatalogGame[];
}

export async function applyAdminPriceJobResults(jobId: string): Promise<AdminPriceApplyResult> {
  const job = await readAdminPriceJob(jobId);
  if (!job) return { error: "Job no encontrado." };
  if (job.status !== "done") return { error: "Solo se pueden aplicar jobs terminados correctamente." };

  const workerCatalog = await fetchWorkerCatalog();
  if ("error" in workerCatalog) return workerCatalog;

  const candidates = workerCatalog.filter((game) => targetMatches(game, job));
  let updated = 0;
  let skipped = 0;
  const errors: { catalogId: string; error: string }[] = [];

  for (const workerGame of candidates) {
    const localGame = getCatalogGame(workerGame.id);
    if (!localGame) {
      skipped += 1;
      continue;
    }
    if (!priceFieldsChanged(localGame, workerGame)) {
      skipped += 1;
      continue;
    }
    const result = await updatePublishedCatalogPrices(workerGame.id, pricePatchFromWorkerGame(workerGame));
    if ("error" in result) {
      errors.push({ catalogId: workerGame.id, error: result.error });
      continue;
    }
    updated += 1;
  }

  return {
    ok: true,
    jobId,
    checked: candidates.length,
    updated,
    skipped,
    errors,
  };
}
