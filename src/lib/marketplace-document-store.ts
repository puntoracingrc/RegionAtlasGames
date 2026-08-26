import path from "path";
import { appDataFile } from "./app-data-dir";
import { assertDurableBlobConfigured, blobAuthConfigured } from "./blob-auth";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function safeDocumentName(name: string): string {
  if (!/^[a-z0-9-]+\.json$/.test(name)) {
    throw new Error("Nombre de documento de marketplace no válido.");
  }
  return name;
}

function parseArray<T>(raw: string): T[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("El documento de marketplace no es válido.");
  return parsed as T[];
}

function blobOptions<T>(name: string) {
  const safe = safeDocumentName(name);
  return {
    pathname: `region-atlas/marketplace/${safe}`,
    empty: (): T[] => [],
    parse: (raw: string) => parseArray<T>(raw),
    maximumSizeInBytes: 64 * 1024 * 1024,
    cacheControlMaxAge: 30,
  };
}

function diskOptions<T>(name: string) {
  const safe = safeDocumentName(name);
  return {
    pathname: appDataFile(path.join("marketplace", safe)),
    readCandidates: [path.join(process.cwd(), "data", "marketplace", safe)],
    empty: (): T[] => [],
    parse: (raw: string) => parseArray<T>(raw),
  };
}

export async function readMarketplaceDocument<T>(name: string): Promise<T[]> {
  try {
    if (!shouldUseBlobStorage()) return await readDiskJsonDocument(diskOptions<T>(name));

    const blobData = await readBlobJsonDocument(blobOptions<T>(name));
    if (blobData.length > 0) return blobData;

    const localData = await readDiskJsonDocument(diskOptions<T>(name));
    if (localData.length === 0) return blobData;
    return mutateBlobJsonDocument(blobOptions<T>(name), (current) =>
      current.length > 0
        ? { next: current, result: current, changed: false }
        : { next: localData, result: localData },
    );
  } catch (error) {
    console.error(`[marketplace-store] read ${name} failed`, error);
    throw new Error("No se pudieron leer los datos del mercado. Inténtalo de nuevo más tarde.");
  }
}

export async function mutateMarketplaceDocument<T, R>(
  name: string,
  mutation: JsonMutation<T[], R>,
): Promise<R> {
  try {
    if (shouldUseBlobStorage()) {
      return await mutateBlobJsonDocument(blobOptions<T>(name), mutation);
    }
    return await mutateDiskJsonDocument(diskOptions<T>(name), mutation);
  } catch (error) {
    console.error(`[marketplace-store] mutation ${name} failed`, error);
    throw new Error("No se pudieron guardar los datos del mercado. Inténtalo de nuevo más tarde.");
  }
}
