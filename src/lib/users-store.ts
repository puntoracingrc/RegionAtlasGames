import path from "path";
import { assertDurableBlobConfigured, blobAuthConfigured } from "./blob-auth";
import { appDataFile } from "./app-data-dir";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";

export type StoredUserRecord = {
  id: string;
  email: string;
  name: string;
  city?: string | null;
  passwordHash?: string;
  googleId?: string;
  theme: "light" | "dark" | "system";
  plan?: "free" | "pro";
  createdAt: string;
};

const BLOB_PATH = "region-atlas/auth/users.json";

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function parseUsers(raw: string): StoredUserRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("El documento de usuarios no es válido.");
  return parsed as StoredUserRecord[];
}

function blobOptions() {
  return {
    pathname: BLOB_PATH,
    empty: (): StoredUserRecord[] => [],
    parse: parseUsers,
    maximumSizeInBytes: 16 * 1024 * 1024,
    cacheControlMaxAge: 30,
  };
}

function diskOptions() {
  return {
    pathname: appDataFile("users.json"),
    readCandidates: [path.join(process.cwd(), "data", "users.json")],
    empty: (): StoredUserRecord[] => [],
    parse: parseUsers,
  };
}

async function storageError(operation: string, error: unknown): Promise<never> {
  console.error(`[users-store] ${operation} failed`, error);
  throw new Error(
    "No se pudo acceder al almacenamiento de cuentas. Inténtalo de nuevo en unos minutos.",
  );
}

/** Carga usuarios: Blob en Vercel, disco en local. */
export async function loadUsers(): Promise<StoredUserRecord[]> {
  if (!shouldUseBlobStorage()) {
    return readDiskJsonDocument(diskOptions()).catch((error) => storageError("disk read", error));
  }

  try {
    const blobUsers = await readBlobJsonDocument(blobOptions());
    if (blobUsers.length > 0) return blobUsers;

    const localUsers = await readDiskJsonDocument(diskOptions());
    if (localUsers.length === 0) return blobUsers;

    return mutateBlobJsonDocument(blobOptions(), (current) =>
      current.length > 0
        ? { next: current, result: current, changed: false }
        : { next: localUsers, result: localUsers },
    );
  } catch (error) {
    return storageError("blob read", error);
  }
}

export async function mutateUsers<R>(mutation: JsonMutation<StoredUserRecord[], R>): Promise<R> {
  try {
    if (shouldUseBlobStorage()) {
      return await mutateBlobJsonDocument(blobOptions(), mutation);
    }
    return await mutateDiskJsonDocument(diskOptions(), mutation);
  } catch (error) {
    return storageError("mutation", error);
  }
}

export function usersStorageBackend(): "blob" | "disk" {
  return shouldUseBlobStorage() ? "blob" : "disk";
}
