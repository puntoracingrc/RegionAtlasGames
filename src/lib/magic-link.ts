import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { getSiteUrl } from "./site-url";

const TOKENS_DIR = path.join(process.cwd(), "data", "auth");
const TOKENS_FILE = path.join(TOKENS_DIR, "magic-tokens.json");

type MagicToken = {
  email: string;
  token: string;
  expiresAt: string;
  usedAt: string | null;
};

function ensureDir() {
  if (!existsSync(TOKENS_DIR)) mkdirSync(TOKENS_DIR, { recursive: true });
}

function readTokens(): MagicToken[] {
  ensureDir();
  try {
    return JSON.parse(readFileSync(TOKENS_FILE, "utf-8")) as MagicToken[];
  } catch {
    return [];
  }
}

function writeTokens(tokens: MagicToken[]) {
  ensureDir();
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

const TOKEN_TTL_MS = 15 * 60 * 1000;

export function createMagicLinkToken(email: string): { token: string; verifyUrl: string } {
  const normalized = email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const entry: MagicToken = {
    email: normalized,
    token,
    expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(),
    usedAt: null,
  };

  const tokens = readTokens()
    .filter((t) => t.usedAt || new Date(t.expiresAt).getTime() > now)
    .slice(-200);
  tokens.push(entry);
  writeTokens(tokens);

  return { token, verifyUrl: `${getSiteUrl()}/api/auth/verify?token=${token}` };
}

export function consumeMagicLinkToken(token: string): { email: string } | { error: string } {
  const tokens = readTokens();
  const idx = tokens.findIndex((t) => t.token === token);
  if (idx === -1) return { error: "Enlace no válido o ya utilizado." };

  const entry = tokens[idx];
  if (entry.usedAt) return { error: "Este enlace ya se utilizó." };
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return { error: "El enlace ha caducado. Solicita uno nuevo." };
  }

  tokens[idx] = { ...entry, usedAt: new Date().toISOString() };
  writeTokens(tokens);
  return { email: entry.email };
}
