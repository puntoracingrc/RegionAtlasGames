import { blobAuthConfigured } from "./blob-auth";

export const DEV_SESSION_SECRET = "dev-only-secret-min-32-chars-long!!";

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret !== DEV_SESSION_SECRET && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET no está configurado correctamente en producción.");
  }
  return DEV_SESSION_SECRET;
}

export function usesVercelBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

export function sessionConfigError(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret === DEV_SESSION_SECRET || secret.length < 32) {
    return "SESSION_SECRET no está configurado con al menos 32 caracteres en producción.";
  }
  return null;
}

export function authStorageConfigError(): string | null {
  if (!process.env.VERCEL) return null;
  if (usesVercelBlobStorage()) return null;
  return "Vercel Blob no está conectado al proyecto (falta BLOB_STORE_ID).";
}

export function authConfigErrors(): string[] {
  return [sessionConfigError(), authStorageConfigError()].filter(
    (message): message is string => Boolean(message),
  );
}
