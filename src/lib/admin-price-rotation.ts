import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import type { PriceSyncState } from "./price-sync";

const PRICE_SYNC_STATE_FILE = path.join(process.cwd(), "data", "price-sync-state.json");
const PRICE_SYNC_BATCHES_FILE = path.join(process.cwd(), "data", "price-sync-batches.json");

type PriceSyncBatchesFile = {
  batches?: Record<string, { label?: string; platforms?: string[] }>;
};

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function loadBatches(): Record<string, { label?: string; platforms?: string[] }> {
  return loadJson<PriceSyncBatchesFile>(PRICE_SYNC_BATCHES_FILE, {}).batches ?? {};
}

function batchPlatformSlugs(batches = loadBatches()): Set<string> {
  const slugs = new Set<string>();
  for (const batch of Object.values(batches)) {
    for (const slug of batch.platforms ?? []) {
      if (slug.trim()) slugs.add(slug.trim());
    }
  }
  return slugs;
}

function platformCoveredByRotation(slug: string, state: PriceSyncState): boolean {
  if (state.rotationOrder.includes(slug)) return true;
  return batchPlatformSlugs().has(slug);
}

export type PriceRotationRegisterResult = {
  added: boolean;
  rotationOrder: string[];
  message: string;
};

/** Añade una plataforma al final de rotationOrder si aún no está en la rotación diaria. */
export function registerPlatformInPriceRotation(slug: string): PriceRotationRegisterResult {
  const trimmed = slug.trim();
  if (!trimmed) {
    return { added: false, rotationOrder: [], message: "Slug vacío." };
  }

  const state = loadJson<PriceSyncState>(PRICE_SYNC_STATE_FILE, {
    rotationOrder: [],
    lastRunAt: null,
    nextPlatformSlug: null,
    platforms: {},
  });

  if (platformCoveredByRotation(trimmed, state)) {
    return {
      added: false,
      rotationOrder: state.rotationOrder,
      message: "La plataforma ya está en la rotación de precios.",
    };
  }

  state.rotationOrder = [...state.rotationOrder, trimmed];
  if (!state.nextPlatformSlug) {
    state.nextPlatformSlug = state.rotationOrder[0] ?? trimmed;
  }

  saveJson(PRICE_SYNC_STATE_FILE, state);

  return {
    added: true,
    rotationOrder: state.rotationOrder,
    message: `Añadida a la rotación diaria de precios (posición ${state.rotationOrder.length}).`,
  };
}

export function unregisterPlatformFromPriceRotation(slug: string): void {
  const trimmed = slug.trim();
  if (!trimmed) return;

  const state = loadJson<PriceSyncState>(PRICE_SYNC_STATE_FILE, {
    rotationOrder: [],
    lastRunAt: null,
    nextPlatformSlug: null,
    platforms: {},
  });

  state.rotationOrder = state.rotationOrder.filter((step) => step !== trimmed);
  if (state.platforms[trimmed]) {
    delete state.platforms[trimmed];
  }

  if (state.nextPlatformSlug === trimmed) {
    state.nextPlatformSlug = state.rotationOrder[0] ?? null;
  }

  const batches = loadBatches();
  let batchesChanged = false;
  for (const [batchKey, batch] of Object.entries(batches)) {
    const platforms = batch.platforms ?? [];
    if (!platforms.includes(trimmed)) continue;
    batch.platforms = platforms.filter((p) => p !== trimmed);
    batchesChanged = true;
    if (batch.platforms.length === 0) {
      state.rotationOrder = state.rotationOrder.filter((step) => step !== batchKey);
      delete batches[batchKey];
      if (state.nextPlatformSlug === batchKey) {
        state.nextPlatformSlug = state.rotationOrder[0] ?? null;
      }
    }
  }

  saveJson(PRICE_SYNC_STATE_FILE, state);
  if (batchesChanged) {
    saveJson(PRICE_SYNC_BATCHES_FILE, { batches });
  }
}

export function renamePlatformInPriceRotation(oldSlug: string, newSlug: string): void {
  const from = oldSlug.trim();
  const to = newSlug.trim();
  if (!from || !to || from === to) return;

  const state = loadJson<PriceSyncState>(PRICE_SYNC_STATE_FILE, {
    rotationOrder: [],
    lastRunAt: null,
    nextPlatformSlug: null,
    platforms: {},
  });

  state.rotationOrder = state.rotationOrder.map((step) => (step === from ? to : step));
  if (state.nextPlatformSlug === from) {
    state.nextPlatformSlug = to;
  }
  if (state.platforms[from]) {
    state.platforms[to] = state.platforms[from];
    delete state.platforms[from];
  }

  const batches = loadBatches();
  let batchesChanged = false;
  for (const batch of Object.values(batches)) {
    const platforms = batch.platforms ?? [];
    const idx = platforms.indexOf(from);
    if (idx < 0) continue;
    platforms[idx] = to;
    batch.platforms = platforms;
    batchesChanged = true;
  }

  saveJson(PRICE_SYNC_STATE_FILE, state);
  if (batchesChanged) {
    saveJson(PRICE_SYNC_BATCHES_FILE, { batches });
  }

  if (!platformCoveredByRotation(to, state)) {
    registerPlatformInPriceRotation(to);
  }
}
