import { existsSync, mkdirSync } from "fs";
import path from "path";

/** Directorio escribible para users.json, colecciones, etc. */
export function appDataDir(): string {
  const configured = process.env.APP_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) {
    return path.join("/tmp", "region-atlas-data");
  }
  return path.join(process.cwd(), "data");
}

export function ensureAppDataDir(): string {
  const dir = appDataDir();
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // noop — el write posterior reportará el fallo
  }
  return dir;
}

export function appDataFile(name: string): string {
  return path.join(ensureAppDataDir(), name);
}
