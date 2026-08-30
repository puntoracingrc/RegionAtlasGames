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
      skippedUnverified: number;
      errors: { catalogId: string; error: string }[];
    }
  | { error: string };

function targetMatches(game: CatalogGame, job: AdminPriceJobMeta): boolean {
  if (job.catalogId) return game.id === job.catalogId;
  if (job.resultCatalogIds?.length) return job.resultCatalogIds.includes(game.id);
  if (job.catalogIds?.length) return job.catalogIds.includes(game.id);
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

type WallapopBatchResult = {
  schemaVersion: number;
  jobId: string;
  source: string;
  platformSlug: string;
  searchedCatalogIds: string[];
  catalogIds: string[];
  verifiedCatalogIds: string[];
  games: CatalogGame[];
};

function sameIds(left: string[], right: string[]): boolean {
  return [...new Set(left)].sort().join("\n") === [...new Set(right)].sort().join("\n");
}

function validateWallapopBatchResult(
  value: unknown,
  job: AdminPriceJobMeta,
): CatalogGame[] | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "El resultado Wallapop no tiene formato válido." };
  }
  const result = value as Partial<WallapopBatchResult>;
  if (
    result.schemaVersion !== 1 ||
    result.jobId !== job.jobId ||
    result.source !== "wallapop" ||
    !Array.isArray(result.searchedCatalogIds) ||
    !Array.isArray(result.catalogIds) ||
    !Array.isArray(result.verifiedCatalogIds) ||
    !Array.isArray(result.games)
  ) {
    return { error: "El resultado Wallapop no coincide con el trabajo solicitado." };
  }
  if (!job.catalogIds?.length || !sameIds(result.searchedCatalogIds, job.catalogIds)) {
    return { error: "El resultado Wallapop intenta cambiar una tanda distinta." };
  }
  if (result.catalogIds.length > 100 || !result.catalogIds.every((id) => typeof id === "string")) {
    return { error: "El resultado Wallapop supera el alcance permitido." };
  }
  if (job.resultCatalogIds?.length && !sameIds(result.catalogIds, job.resultCatalogIds)) {
    return { error: "El alcance regional del resultado Wallapop no coincide con el estado del worker." };
  }
  if (!Array.isArray(job.verifiedCatalogIds)) {
    return { error: "El worker no ha declarado qué precios verificó en esta tanda." };
  }
  const allowed = new Set(result.catalogIds);
  if (
    result.verifiedCatalogIds.some((id) => typeof id !== "string" || !allowed.has(id)) ||
    !sameIds(result.verifiedCatalogIds, job.verifiedCatalogIds)
  ) {
    return { error: "El resultado Wallapop declara precios verificados fuera de alcance." };
  }
  if (
    !job.catalogIds.every((id) => allowed.has(id)) ||
    !sameIds(result.games.map((game) => String(game?.id ?? "")), result.catalogIds) ||
    result.games.some(
      (game) =>
        !game ||
        typeof game.id !== "string" ||
        !allowed.has(game.id) ||
        (result.platformSlug && game.platformSlug !== result.platformSlug),
    )
  ) {
    return { error: "El resultado Wallapop contiene juegos fuera del alcance permitido." };
  }
  return result.games;
}

export { validateWallapopBatchResult };

async function fetchWorkerCatalog(job: AdminPriceJobMeta): Promise<CatalogGame[] | { error: string }> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return { error: "Worker de precios no configurado." };
  const isWallapopBatch = job.source === "wallapop" && Boolean(job.catalogIds?.length);
  const expectedResultPath = `results/${job.jobId}/catalog-price-results.json`;
  if (isWallapopBatch && job.resultPath !== expectedResultPath) {
    return { error: "El worker no ha publicado el resultado limitado de la tanda Wallapop." };
  }
  const relativePath = isWallapopBatch ? expectedResultPath : "app/data/catalog.json";
  const res = await fetch(`${base}/${relativePath}`, { cache: "no-store" });
  if (!res.ok) return { error: `No se pudo leer el catálogo del worker (${res.status}).` };
  const data = (await res.json()) as unknown;
  if (isWallapopBatch) return validateWallapopBatchResult(data, job);
  if (!Array.isArray(data)) return { error: "El catálogo del worker no tiene formato válido." };
  return data as CatalogGame[];
}

export async function applyAdminPriceJobResults(jobId: string): Promise<AdminPriceApplyResult> {
  const job = await readAdminPriceJob(jobId);
  if (!job) return { error: "Job no encontrado." };
  if (job.status !== "done") return { error: "Solo se pueden aplicar jobs terminados correctamente." };

  const workerCatalog = await fetchWorkerCatalog(job);
  if ("error" in workerCatalog) return workerCatalog;

  const candidates = workerCatalog.filter((game) => targetMatches(game, job));
  const verifiedCatalogIds = new Set(job.verifiedCatalogIds ?? []);
  let updated = 0;
  let skipped = 0;
  let skippedUnverified = 0;
  const errors: { catalogId: string; error: string }[] = [];

  for (const workerGame of candidates) {
    if (
      job.source === "wallapop" &&
      job.catalogIds?.length &&
      (!verifiedCatalogIds.has(workerGame.id) || workerGame.priceRegionVerified !== true)
    ) {
      skipped += 1;
      skippedUnverified += 1;
      continue;
    }
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
    skippedUnverified,
    errors,
  };
}
