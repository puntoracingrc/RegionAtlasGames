import { blobAuthConfigured } from "./blob-auth";

const DEV_SESSION_SECRET = "dev-only-secret-min-32-chars-long!!";

export function usesVercelBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

export function sessionConfigError(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret === DEV_SESSION_SECRET) {
    return "SESSION_SECRET no está configurado en producción.";
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
