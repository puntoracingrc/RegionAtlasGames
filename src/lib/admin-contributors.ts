import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";

const CONTRIBUTORS_FILE = path.join(process.cwd(), "data", "admin", "contributors.json");
const CONTRIBUTORS_BLOB_PATH = "region-atlas/admin/contributors.json";

export type ContributorEntry = {
  email: string;
  addedAt: string;
  addedBy: string;
};

export type ContributorsFile = {
  updatedAt: string | null;
  contributors: ContributorEntry[];
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

function assertWritable(): { ok: true } | { error: string } {
  if (!canWriteCatalogFiles()) {
    return { error: "Escritura desactivada en este entorno (ADMIN_ALLOW_CATALOG_WRITE=1)." };
  }
  return { ok: true };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function useBlobContributors(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

async function loadBlobContributorsFile(): Promise<ContributorsFile> {
  if (!useBlobContributors()) return { updatedAt: null, contributors: [] };
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(CONTRIBUTORS_BLOB_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) {
      return { updatedAt: null, contributors: [] };
    }
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as ContributorsFile;
    return {
      updatedAt: parsed.updatedAt ?? null,
      contributors: Array.isArray(parsed.contributors) ? parsed.contributors : [],
    };
  } catch {
    return { updatedAt: null, contributors: [] };
  }
}

async function saveBlobContributorsFile(file: ContributorsFile): Promise<void> {
  if (!useBlobContributors()) return;
  const auth = await blobAuthOptions("private");
  await put(
    CONTRIBUTORS_BLOB_PATH,
    JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2),
    {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    },
  );
}

export function loadContributorsFile(): ContributorsFile {
  return loadJson<ContributorsFile>(CONTRIBUTORS_FILE, { updatedAt: null, contributors: [] });
}

export async function listContributorEmails(): Promise<string[]> {
  const local = loadContributorsFile().contributors;
  const blob = await loadBlobContributorsFile();
  return [...local, ...blob.contributors].map((c) => normalizeEmail(c.email));
}

export async function isContributorEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return (await listContributorEmails()).includes(normalizeEmail(email));
}

export async function listContributors(): Promise<ContributorEntry[]> {
  const local = loadContributorsFile().contributors;
  const blob = (await loadBlobContributorsFile()).contributors;
  const byEmail = new Map<string, ContributorEntry>();
  for (const contributor of [...local, ...blob]) {
    byEmail.set(normalizeEmail(contributor.email), {
      ...contributor,
      email: normalizeEmail(contributor.email),
    });
  }
  return [...byEmail.values()]
    .slice()
    .sort((a, b) => a.email.localeCompare(b.email, "es"));
}

export async function addContributor(
  email: string,
  addedBy: string,
): Promise<{ ok: true; entry: ContributorEntry } | { error: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    return { error: "Email no válido." };
  }

  if (!canWriteCatalogFiles()) {
    const file = await loadBlobContributorsFile();
    if (file.contributors.some((c) => normalizeEmail(c.email) === normalized)) {
      return { error: "Ese email ya tiene permiso de colaborador." };
    }
    const entry: ContributorEntry = {
      email: normalized,
      addedAt: new Date().toISOString(),
      addedBy: normalizeEmail(addedBy),
    };
    file.contributors.push(entry);
    await saveBlobContributorsFile(file);
    return { ok: true, entry };
  }

  const writable = assertWritable();
  if ("error" in writable) return writable;

  const file = loadContributorsFile();
  if (file.contributors.some((c) => normalizeEmail(c.email) === normalized)) {
    return { error: "Ese email ya tiene permiso de colaborador." };
  }

  const entry: ContributorEntry = {
    email: normalized,
    addedAt: new Date().toISOString(),
    addedBy: normalizeEmail(addedBy),
  };

  file.contributors.push(entry);
  file.updatedAt = new Date().toISOString();
  saveJson(CONTRIBUTORS_FILE, file);

  return { ok: true, entry };
}

export async function removeContributor(
  email: string,
): Promise<{ ok: true } | { error: string }> {
  const normalized = normalizeEmail(email);
  if (!canWriteCatalogFiles()) {
    const file = await loadBlobContributorsFile();
    const next = file.contributors.filter((c) => normalizeEmail(c.email) !== normalized);
    if (next.length === file.contributors.length) {
      return { error: "Colaborador no encontrado." };
    }
    file.contributors = next;
    await saveBlobContributorsFile(file);
    return { ok: true };
  }

  const writable = assertWritable();
  if ("error" in writable) return writable;

  const file = loadContributorsFile();
  const next = file.contributors.filter((c) => normalizeEmail(c.email) !== normalized);
  if (next.length === file.contributors.length) {
    return { error: "Colaborador no encontrado." };
  }

  file.contributors = next;
  file.updatedAt = new Date().toISOString();
  saveJson(CONTRIBUTORS_FILE, file);

  return { ok: true };
}
