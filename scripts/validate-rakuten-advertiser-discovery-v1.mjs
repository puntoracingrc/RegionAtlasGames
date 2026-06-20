import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/lib/rakuten/advertiser-search.ts",
  "src/lib/rakuten/advertiser-search.types.ts",
  "src/lib/rakuten/advertiser-search-normalize.ts",
  "src/lib/rakuten/advertiser-search-xml.ts",
  "scripts/smoke-rakuten-advertiser-search.mjs",
  "scripts/discover-rakuten-advertisers.mjs",
  "scripts/review-rakuten-advertisers.mjs",
  "scripts/validate-rakuten-advertiser-discovery-v1.mjs",
  "scripts/test-rakuten-advertiser-discovery-v1.mjs",
  "docs/rakuten-advertiser-discovery-v1.md",
  "data/rakuten-advertiser-candidates.example.json",
];

function fail(message) {
  failures.push(message);
}

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return readFileSync(file(relativePath), "utf8");
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "data"].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (lstatSync(full).isSymbolicLink() && !existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

for (const requiredFile of required) {
  if (!existsSync(file(requiredFile))) fail(`Falta ${requiredFile}`);
}

const moduleSource = read("src/lib/rakuten/advertiser-search.ts");
const xmlSource = read("src/lib/rakuten/advertiser-search-xml.ts");
const normalizeSource = read("src/lib/rakuten/advertiser-search-normalize.ts");
const smokeSource = read("scripts/smoke-rakuten-advertiser-search.mjs");
const batchSource = read("scripts/discover-rakuten-advertisers.mjs");
const reviewSource = read("scripts/review-rakuten-advertisers.mjs");
const gitignore = read(".gitignore");
const packageJson = read("package.json");
const envExample = read(".env.example");
const source = walk(root)
  .filter((full) => /\.(ts|tsx|js|jsx|mjs)$/.test(full))
  .filter((full) => !full.includes(`${path.sep}scripts${path.sep}`))
  .map((full) => readFileSync(full, "utf8"))
  .join("\n");
const frontendSource = walk(file("src"))
  .filter((full) => /\.(tsx|jsx)$/.test(full))
  .map((full) => readFileSync(full, "utf8"))
  .join("\n");

if (!xmlSource.includes("parseRakutenAdvertiserSearchXml")) fail("Falta parser XML");
if (!moduleSource.includes("getRakutenAccessToken")) fail("No usa getRakutenAccessToken");
if (!moduleSource.includes("Accept: \"application/xml\"")) fail("No envía Accept application/xml");
if (!moduleSource.includes("response.status === 401")) fail("No maneja 401");
if (!moduleSource.includes("clearToken()")) fail("401 no limpia token");
if (!moduleSource.includes("response.status === 403")) fail("No maneja 403");
if (!moduleSource.includes("RAKUTEN_ADVERTISER_RATE_LIMIT")) fail("403 no se trata como rate limit");
if (!normalizeSource.includes("partnershipStatus: \"unknown\"")) fail("Normalizado no deja partnershipStatus unknown");
if (!normalizeSource.includes("source: \"advertisersearch-1.0\"")) fail("Normalizado no marca source advertisersearch-1.0");
if (!packageJson.includes("smoke:rakuten-advertiser-search")) fail("Falta script smoke");
if (!packageJson.includes("validate:rakuten-advertiser-discovery-v1")) fail("Falta script validate");
if (!packageJson.includes("test:rakuten-advertiser-discovery-v1")) fail("Falta script test");
if (!packageJson.includes("discover:rakuten-advertisers")) fail("Falta script discover batch");
if (!packageJson.includes("review:rakuten-advertisers")) fail("Falta script review");
if (!gitignore.includes("/data/rakuten-advertiser-candidates.local.json")) fail("El output local de Rakuten debe estar en .gitignore");
if (!gitignore.includes("/data/rakuten-advertiser-review.local.json")) fail("El review local de Rakuten debe estar en .gitignore");
if (/process\.env\.NEXT_PUBLIC_RAKUTEN_|NEXT_PUBLIC_RAKUTEN_[A-Z0-9_]+\s*=/.test(source)) fail("Existe uso real de NEXT_PUBLIC_RAKUTEN");
if (/console\.(log|error|warn)[^\n]*(Authorization|access_token|refresh_token|client_secret|token-key)/i.test(smokeSource)) fail("Smoke imprime secretos");
if (/console\.(log|error|warn)[^\n]*(Authorization|access_token|refresh_token|client_secret|token-key)/i.test(batchSource)) fail("Batch imprime secretos");
if (/console\.(log|error|warn)[^\n]*(Authorization|access_token|refresh_token|client_secret|token-key)/i.test(reviewSource)) fail("Review imprime secretos");
if (envExample.includes("AFFILIATE_OFFERS_ENABLED=true")) fail("AFFILIATE_OFFERS_ENABLED no debe activarse por defecto");
if (envExample.includes("RAKUTEN_AFFILIATE_ENABLED=true")) fail("RAKUTEN_AFFILIATE_ENABLED no debe activarse por defecto");
if (/advertiser-search/.test(frontendSource)) fail("No frontend imports de advertiser-search");
if (/Product Search|productsearch|deep_links|Coupons|Advanced Reports|Postback/i.test(moduleSource + batchSource + reviewSource)) fail("Discovery no debe usar Product Search, Deep Links, Coupons, Reports ni Postback");
if (/AFFILIATE_OFFERS_ENABLED\s*=\s*["']?true/i.test(batchSource)) fail("Batch no debe activar AFFILIATE_OFFERS_ENABLED");
if (/RAKUTEN_AFFILIATE_ENABLED\s*=\s*["']?true/i.test(batchSource)) fail("Batch no debe modificar RAKUTEN_AFFILIATE_ENABLED");
if (/AFFILIATE_OFFERS_ENABLED\s*=\s*["']?true/i.test(reviewSource)) fail("Review no debe activar AFFILIATE_OFFERS_ENABLED");
if (/RAKUTEN_AFFILIATE_ENABLED\s*=\s*["']?true/i.test(reviewSource)) fail("Review no debe modificar RAKUTEN_AFFILIATE_ENABLED");

// No frontend imports
if (failures.length) {
  console.error("RAKUTEN_ADVERTISER_DISCOVERY_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("RAKUTEN_ADVERTISER_DISCOVERY_V1 válido: backend discovery, XML, smoke y compliance OK.");
