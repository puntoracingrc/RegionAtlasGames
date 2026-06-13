import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { appDataFile, ensureAppDataDir } from "./app-data-dir";

export type StoredUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  googleId?: string;
  theme: "light" | "dark" | "system";
  plan?: "free" | "pro";
  createdAt: string;
};

const BLOB_PATH = "region-atlas/auth/users.json";

function useBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function parseUsers(raw: string): StoredUserRecord[] {
  try {
    const parsed = JSON.parse(raw) as StoredUserRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readUsersFromDisk(): StoredUserRecord[] {
  const candidates = [appDataFile("users.json"), path.join(process.cwd(), "data", "users.json")];
  for (const file of candidates) {
    try {
      return parseUsers(readFileSync(file, "utf-8"));
    } catch {
      continue;
    }
  }
  return [];
}

async function readUsersFromBlob(): Promise<StoredUserRecord[]> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(BLOB_PATH, auth);
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const text = await new Response(result.stream).text();
    return parseUsers(text);
  } catch (error) {
    console.error("[users-store] blob read failed", error);
    return [];
  }
}

function writeUsersToDisk(users: StoredUserRecord[]): { ok: true } | { error: string } {
  try {
    ensureAppDataDir();
    writeFileSync(appDataFile("users.json"), JSON.stringify(users, null, 2), "utf-8");
    return { ok: true };
  } catch {
    return {
      error:
        "No se pudo guardar la cuenta en disco. En Vercel conecta Vercel Blob al proyecto.",
    };
  }
}

async function writeUsersToBlob(
  users: StoredUserRecord[],
): Promise<{ ok: true } | { error: string }> {
  try {
    const auth = await blobAuthOptions("private");
    await put(BLOB_PATH, JSON.stringify(users, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { ok: true };
  } catch (error) {
    console.error("[users-store] blob write failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("No blob credentials") || detail.includes("OIDC token")) {
      return {
        error:
          "No se pudo guardar la cuenta. Falta autenticación con Vercel Blob (BLOB_STORE_ID o BLOB_READ_WRITE_TOKEN).",
      };
    }
    return {
      error:
        "No se pudo guardar la cuenta. Revisa que Vercel Blob esté conectado al proyecto.",
    };
  }
}

/** Carga usuarios: Blob en Vercel, disco en local. */
export async function loadUsers(): Promise<StoredUserRecord[]> {
  if (useBlobStorage()) {
    const blobUsers = await readUsersFromBlob();
    if (blobUsers.length > 0) return blobUsers;
    const localUsers = readUsersFromDisk();
    if (localUsers.length > 0) {
      await writeUsersToBlob(localUsers);
      return localUsers;
    }
    return [];
  }
  return readUsersFromDisk();
}

export async function saveUsers(
  users: StoredUserRecord[],
): Promise<{ ok: true } | { error: string }> {
  if (useBlobStorage()) {
    return writeUsersToBlob(users);
  }
  return writeUsersToDisk(users);
}

export function usersStorageBackend(): "blob" | "disk" {
  return useBlobStorage() ? "blob" : "disk";
}
