#!/usr/bin/env node
/**
 * Sincroniza variables de .env.local a Vercel (solo las que faltan).
 * Uso: npm run env:sync-vercel
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");

const SYNC_PLAN = [
  { key: "RESEND_API_KEY", targets: ["production", "preview"] },
  { key: "RESEND_FROM_EMAIL", targets: ["production", "preview"] },
  { key: "GOOGLE_CLIENT_ID", targets: ["production", "preview"] },
  { key: "GOOGLE_CLIENT_SECRET", targets: ["production", "preview"] },
  { key: "SESSION_SECRET", targets: ["preview"] },
  { key: "NEXT_PUBLIC_SITE_URL", targets: ["preview"] },
];

function parseEnvLocal(filePath) {
  const values = new Map();
  if (!existsSync(filePath)) return values;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function listVercelEnvs() {
  const raw = execSync("npx vercel env ls --format json", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) throw new Error("No se pudo leer env vars de Vercel.");
  return JSON.parse(raw.slice(jsonStart)).envs ?? [];
}

function hasTarget(envs, key, target) {
  const entry = envs.find((item) => item.key === key);
  return Boolean(entry?.target?.includes(target));
}

function addEnv(key, value, target) {
  const args = ["vercel", "env", "add", key, target, "--value", value, "--yes"];
  const result = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status === 0) return true;
  if (target === "preview" && output.includes("git_branch_required")) {
    console.warn(`· ${key} [preview] — omitido (añádelo manualmente en el dashboard de Vercel)`);
    return false;
  }
  throw new Error(`Falló vercel env add ${key} ${target}: ${output.trim()}`);
}

execSync("npx vercel link --yes", { cwd: root, stdio: "ignore" });

const local = parseEnvLocal(envFile);
if (local.size === 0) {
  console.log("No hay .env.local — nada que sincronizar.");
  process.exit(0);
}

const remote = listVercelEnvs();

for (const { key, targets } of SYNC_PLAN) {
  const value = local.get(key)?.trim();
  if (!value) {
    console.log(`· ${key} — omitido (no está en .env.local)`);
    continue;
  }
  for (const target of targets) {
    if (hasTarget(remote, key, target)) {
      console.log(`· ${key} [${target}] — ya existe`);
      continue;
    }
    const added = addEnv(key, value, target);
    if (added) console.log(`· ${key} [${target}] — añadido`);
    if (!remote.some((item) => item.key === key)) {
      remote.push({ key, target: [target] });
    } else {
      const entry = remote.find((item) => item.key === key);
      entry.target = [...new Set([...(entry.target ?? []), target])];
    }
  }
}

console.log("\nHecho. Redeploy en Vercel para aplicar cambios.");
