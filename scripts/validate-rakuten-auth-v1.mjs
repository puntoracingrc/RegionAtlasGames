import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return readFileSync(file(relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "data"].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const authPath = "src/lib/affiliate/providers/rakuten/rakuten-auth.ts";
const clientPath = "src/lib/affiliate/providers/rakuten/rakuten-client.ts";
const auth = read(authPath);
const client = read(clientPath);
const envExample = read(".env.example");
const smoke = read("scripts/smoke-rakuten-auth.mjs");
const frontendFiles = walk(file("src"))
  .filter((full) => /\.(tsx|jsx)$/.test(full))
  .map((full) => readFileSync(full, "utf8").replaceAll("\\n", "\n"))
  .join("\n");
const source = walk(root)
  .filter((full) => /\.(ts|tsx|js|jsx|mjs)$/.test(full))
  .filter((full) => !full.includes(`${path.sep}scripts${path.sep}`))
  .map((full) => readFileSync(full, "utf8"))
  .join("\n");

assert(!/process\.env\.NEXT_PUBLIC_RAKUTEN_|NEXT_PUBLIC_RAKUTEN_[A-Z0-9_]+\s*=/.test(source), "No debe existir uso real de NEXT_PUBLIC_RAKUTEN");
assert(existsSync(file(authPath)), "Falta rakuten-auth.ts");
assert(auth.includes("getRakutenAccessToken"), "Falta getRakutenAccessToken");
assert(auth.includes("cachedRakutenToken"), "Falta cache de token");
assert(auth.includes("refreshSafetySeconds"), "Falta refresh antes de expiración");
assert(auth.includes("rakutenTokenPromise"), "Falta lock/promesa compartida");
assert(auth.includes("AbortController"), "Falta timeout en token request");
assert(client.includes("response.status === 401"), "Falta manejo de 401");
assert(client.includes("clearRakutenCachedToken"), "Falta limpieza de token en 401");
assert(envExample.includes("# RAKUTEN_AFFILIATE_ENABLED=false"), "RAKUTEN_AFFILIATE_ENABLED debe estar documentado false por defecto");
assert(envExample.includes("# RAKUTEN_ADVANCED_REPORTS_ENABLED=false"), "RAKUTEN_ADVANCED_REPORTS_ENABLED debe estar documentado false por defecto");
assert(smoke.includes("Rakuten auth OK"), "Falta salida OK del smoke Rakuten");
assert(smoke.includes("Rakuten auth failed:"), "Falta salida failed no sensible del smoke Rakuten");
assert(!/console\.(log|error|warn)[^\n]*(client_secret|tokenKey|access_token|refresh_token|Authorization)/i.test(smoke), "Smoke no debe imprimir secretos");
assert(!/console\.(log|error|warn)[^\n]*(Authorization|access_token|refresh_token|client_secret|TOKEN_KEY)/i.test(source), "No se deben loguear secretos Rakuten");
assert(!frontendFiles.includes("rakuten-auth"), "Ningún componente frontend debe importar rakuten-auth.ts");
assert(!source.includes("RAKUTEN_WEB_SECURITY_TOKEN") || envExample.includes("Advanced"), "Web Security Token solo debe estar documentado como no usado");

if (failures.length) {
  console.error("RAKUTEN_AUTH_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("RAKUTEN_AUTH_V1 válido: auth backend, cache, refresh, 401 retry y secretos OK.");
