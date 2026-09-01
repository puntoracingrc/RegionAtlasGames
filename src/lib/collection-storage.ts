import path from "path";
import { appDataFile } from "./app-data-dir";
import { assertDurableBlobConfigured, blobAuthConfigured } from "./blob-auth";
import { findAvailableCatalogLink, repairCollectionPlatform } from "./import-collection";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";
import type { CollectionItem } from "./types";

export type UserCollectionFile = {
  userId: string;
  importedAt: string | null;
  source: string | null;
  items: CollectionItem[];
  catalogGapReportSentAt?: string | null;
  /** Ventas ya descontadas del inventario. Evita dobles decrementos en reintentos. */
  completedSaleIds?: string[];
};

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function safeUserId(userId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(userId)) {
    throw new Error("Identificador de usuario no válido.");
  }
  return userId;
}

function collectionDiskPath(userId: string): string {
  return appDataFile(path.join("collections", `${safeUserId(userId)}.json`));
}

function collectionBlobPath(userId: string): string {
  return `region-atlas/collections/${safeUserId(userId)}.json`;
}

function emptyCollection(userId: string): UserCollectionFile {
  return { userId, importedAt: null, source: null, items: [], completedSaleIds: [] };
}

function parseCollection(raw: string, userId: string): UserCollectionFile {
  const parsed = JSON.parse(raw) as Partial<UserCollectionFile>;
  if (!parsed || parsed.userId !== userId || !Array.isArray(parsed.items)) {
    throw new Error("El documento de colección no es válido.");
  }
  return parsed as UserCollectionFile;
}

function blobOptions(userId: string) {
  return {
    pathname: collectionBlobPath(userId),
    empty: () => emptyCollection(userId),
    parse: (raw: string) => parseCollection(raw, userId),
    maximumSizeInBytes: 32 * 1024 * 1024,
    cacheControlMaxAge: 30,
  };
}

function diskOptions(userId: string) {
  const safe = safeUserId(userId);
  return {
    pathname: collectionDiskPath(safe),
    readCandidates: [path.join(process.cwd(), "data", "collections", `${safe}.json`)],
    empty: () => emptyCollection(userId),
    parse: (raw: string) => parseCollection(raw, userId),
  };
}

function hasCollectionData(data: UserCollectionFile): boolean {
  return data.items.length > 0 || Boolean(data.importedAt) || Boolean(data.catalogGapReportSentAt);
}

export function normalizeIndividualCollectionItems(items: CollectionItem[]): {
  items: CollectionItem[];
  changed: boolean;
} {
  const usedIds = new Set(items.map((item) => item.id));
  const normalized: CollectionItem[] = [];
  let changed = false;

  for (const item of items) {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitValue =
      item.totalValue != null && quantity > 1
        ? Math.round((item.totalValue / quantity) * 100) / 100
        : item.totalValue;
    const quantityPc = item.quantityPc == null ? null : 1;
    const first = {
      ...item,
      quantity: 1,
      quantityPc,
      totalValue: unitValue,
    };
    normalized.push(first);

    if (quantity === 1) {
      if (
        item.quantity !== first.quantity ||
        item.quantityPc !== first.quantityPc ||
        item.totalValue !== first.totalValue
      ) {
        changed = true;
      }
      continue;
    }

    changed = true;
    for (let copyNumber = 2; copyNumber <= quantity; copyNumber += 1) {
      let candidate = `${item.id}-copy-${copyNumber}`;
      let suffix = copyNumber;
      while (usedIds.has(candidate)) {
        suffix += 1;
        candidate = `${item.id}-copy-${suffix}`;
      }
      usedIds.add(candidate);
      normalized.push({ ...first, id: candidate });
    }
  }

  return { items: normalized, changed };
}

function repairCollection(data: UserCollectionFile): {
  data: UserCollectionFile;
  changed: boolean;
} {
  const repairedItems = data.items.map((item) => {
    const repaired = repairCollectionPlatform(item);
    const match = findAvailableCatalogLink(repaired);
    if (!match) return repaired;
    return {
      ...repaired,
      catalogId: match.id,
      catalogMatched: true,
      inRetroCatalog: true,
    };
  });
  const catalogChanged = repairedItems.some(
    (item, index) =>
      item.platformSlug !== data.items[index]?.platformSlug ||
      item.inRetroCatalog !== data.items[index]?.inRetroCatalog ||
      item.catalogId !== data.items[index]?.catalogId ||
      item.catalogMatched !== data.items[index]?.catalogMatched,
  );
  const copies = normalizeIndividualCollectionItems(repairedItems);
  const changed = catalogChanged || copies.changed;
  return { data: changed ? { ...data, items: copies.items } : data, changed };
}

export async function mutateUserCollection<R>(
  userId: string,
  mutation: JsonMutation<UserCollectionFile, R>,
): Promise<R> {
  try {
    if (shouldUseBlobStorage()) {
      return await mutateBlobJsonDocument(blobOptions(userId), mutation);
    }
    return await mutateDiskJsonDocument(diskOptions(userId), mutation);
  } catch (error) {
    console.error("[collection-storage] mutation failed", error);
    throw new Error("No se pudo guardar la colección. Inténtalo de nuevo en unos minutos.");
  }
}

export async function loadUserCollection(userId: string): Promise<UserCollectionFile> {
  let data: UserCollectionFile;

  try {
    if (shouldUseBlobStorage()) {
      const blobData = await readBlobJsonDocument(blobOptions(userId));
      if (hasCollectionData(blobData)) {
        data = blobData;
      } else {
        const localData = await readDiskJsonDocument(diskOptions(userId));
        data = hasCollectionData(localData)
          ? await mutateBlobJsonDocument(blobOptions(userId), (current) =>
              hasCollectionData(current)
                ? { next: current, result: current, changed: false }
                : { next: localData, result: localData },
            )
          : blobData;
      }
    } else {
      data = await readDiskJsonDocument(diskOptions(userId));
    }
  } catch (error) {
    console.error("[collection-storage] read failed", error);
    throw new Error("No se pudo leer la colección. Inténtalo de nuevo en unos minutos.");
  }

  const repaired = repairCollection(data);
  if (!repaired.changed) return data;

  return mutateUserCollection(userId, (current) => {
    const latest = repairCollection(current);
    return { next: latest.data, result: latest.data, changed: latest.changed };
  });
}

export async function saveUserCollectionFile(
  data: UserCollectionFile,
): Promise<{ ok: true } | { error: string }> {
  try {
    await mutateUserCollection(data.userId, () => ({ next: data, result: undefined }));
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la colección." };
  }
}

export function collectionsStorageBackend(): "blob" | "disk" {
  return shouldUseBlobStorage() ? "blob" : "disk";
}
