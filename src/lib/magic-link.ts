import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";
import { appDataFile } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { getSiteUrl } from "./site-url";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_BLOB_PREFIX = "region-atlas/auth/magic-tokens/v1";

type MagicTokenRecord = {
  email: string;
  tokenHash: string;
  expiresAt: string;
};

function localTokensFile(): string {
  return appDataFile("auth/magic-tokens.json");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenBlobPath(tokenHash: string): string {
  return `${TOKEN_BLOB_PREFIX}/${tokenHash}.json`;
}

function shouldUseBlobStorage(): boolean {
  return blobAuthConfigured();
}

function parseTokenRecord(raw: string): MagicTokenRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MagicTokenRecord>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.tokenHash !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      return null;
    }
    return {
      email: parsed.email.trim().toLowerCase(),
      tokenHash: parsed.tokenHash,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function readLocalTokens(): MagicTokenRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(localTokensFile(), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => parseTokenRecord(JSON.stringify(entry)))
      .filter((entry): entry is MagicTokenRecord => Boolean(entry));
  } catch {
    return [];
  }
}

function writeLocalTokens(tokens: MagicTokenRecord[]): void {
  const file = localTokensFile();
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(tokens, null, 2), "utf8");
}

async function saveTokenRecord(record: MagicTokenRecord): Promise<{ ok: true } | { error: string }> {
  if (shouldUseBlobStorage()) {
    try {
      const auth = await blobAuthOptions("private");
      await put(tokenBlobPath(record.tokenHash), JSON.stringify(record), {
        ...auth,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        maximumSizeInBytes: 2_048,
      });
      return { ok: true };
    } catch (error) {
      console.error("[auth/magic-link] token storage failed", error);
      return { error: "No se pudo preparar el enlace de acceso." };
    }
  }

  const now = Date.now();
  const tokens = readLocalTokens()
    .filter((entry) => new Date(entry.expiresAt).getTime() > now)
    .slice(-200);
  tokens.push(record);
  writeLocalTokens(tokens);
  return { ok: true };
}

export async function createMagicLinkToken(
  email: string,
): Promise<{ token: string; verifyUrl: string } | { error: string }> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const record: MagicTokenRecord = {
    email: email.trim().toLowerCase(),
    tokenHash,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
  const saved = await saveTokenRecord(record);
  if ("error" in saved) return saved;

  return { token, verifyUrl: `${getSiteUrl()}/api/auth/verify?token=${token}` };
}

export async function consumeMagicLinkToken(
  token: string,
): Promise<{ email: string } | { error: string }> {
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { error: "Enlace no válido o ya utilizado." };
  }

  const tokenHash = hashToken(token);
  if (shouldUseBlobStorage()) {
    try {
      const auth = await blobAuthOptions("private");
      const pathname = tokenBlobPath(tokenHash);
      const result = await get(pathname, { ...auth, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return { error: "Enlace no válido o ya utilizado." };
      }
      const record = parseTokenRecord(await new Response(result.stream).text());
      if (!record || record.tokenHash !== tokenHash) {
        return { error: "Enlace no válido o ya utilizado." };
      }

      if (new Date(record.expiresAt).getTime() < Date.now()) {
        await del(pathname, { ...auth, ifMatch: result.blob.etag }).catch(() => undefined);
        return { error: "El enlace ha caducado. Solicita uno nuevo." };
      }

      await del(pathname, { ...auth, ifMatch: result.blob.etag });
      return { email: record.email };
    } catch {
      return { error: "Enlace no válido o ya utilizado." };
    }
  }

  const tokens = readLocalTokens();
  const index = tokens.findIndex((entry) => entry.tokenHash === tokenHash);
  if (index === -1) return { error: "Enlace no válido o ya utilizado." };

  const [record] = tokens.splice(index, 1);
  writeLocalTokens(tokens);
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { error: "El enlace ha caducado. Solicita uno nuevo." };
  }
  return { email: record.email };
}
