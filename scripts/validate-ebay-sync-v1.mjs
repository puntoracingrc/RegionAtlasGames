import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/lib/ebay/ebay-auth.ts",
  "src/lib/ebay/ebay-client.ts",
  "src/lib/ebay/ebay.types.ts",
  "src/lib/ebay/ebay-normalize.ts",
  "src/lib/ebay/ebay-search.ts",
  "src/lib/ebay/ebay-errors.ts",
  "src/lib/ebay/ebay-enduserctx.ts",
  "scripts/smoke-ebay-auth.mjs",
  "scripts/smoke-ebay-search.mjs",
  "scripts/test-ebay-sync-v1.mjs",
  "scripts/validate-ebay-sync-v1.mjs",
  "docs/ebay-sync-v1.md",
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

const envExample = read(".env.example");
const packageJson = read("package.json");
const auth = read("src/lib/ebay/ebay-auth.ts");
const client = read("src/lib/ebay/ebay-client.ts");
const enduserctx = read("src/lib/ebay/ebay-enduserctx.ts");
const search = read("src/lib/ebay/ebay-search.ts");
const normalize = read("src/lib/ebay/ebay-normalize.ts");
const docs = read("docs/ebay-sync-v1.md");
const dailyPriceIngest = read("scripts/daily_price_ingest.py");
const platformSources = read("scripts/collectors/platform_sources.py");
const smoke = read("scripts/smoke-ebay-auth.mjs") + "\n" + read("scripts/smoke-ebay-search.mjs");
const allSourceFiles = walk(root).filter((full) => /\.(ts|tsx|js|jsx|mjs)$/.test(full));
const source = allSourceFiles
  .filter((full) => !full.includes(`${path.sep}scripts${path.sep}`))
  .map((full) => readFileSync(full, "utf8"))
  .join("\n");
const frontendSource = walk(file("src"))
  .filter((full) => /\.(tsx|jsx)$/.test(full))
  .map((full) => readFileSync(full, "utf8"))
  .join("\n");
const ebayCode = auth + "\n" + client + "\n" + enduserctx + "\n" + search + "\n" + normalize;

if (!packageJson.includes("smoke:ebay-auth")) fail("Falta script smoke:ebay-auth");
if (!packageJson.includes("smoke:ebay-search")) fail("Falta script smoke:ebay-search");
if (!packageJson.includes("test:ebay-sync-v1")) fail("Falta script test:ebay-sync-v1");
if (!packageJson.includes("validate:ebay-sync-v1")) fail("Falta script validate:ebay-sync-v1");
const parsedPackage = JSON.parse(packageJson);
if (!parsedPackage.scripts?.["validate:all"]?.includes("validate:ebay-sync-v1")) fail("validate:all debe incluir validate:ebay-sync-v1");
if (!envExample.includes("# EBAY_AFFILIATE_ENABLED=false")) fail("EBAY_AFFILIATE_ENABLED debe estar false por defecto");
if (!envExample.includes("# ENABLE_EBAY_PRICE_WHEEL=0")) fail("ENABLE_EBAY_PRICE_WHEEL debe estar documentado apagado por defecto");
if (!envExample.includes("# EBAY_ENV=production")) fail("Falta EBAY_ENV documentado");
if (!envExample.includes("# EBAY_OAUTH_TOKEN_ENDPOINT=https://api.ebay.com/identity/v1/oauth2/token")) fail("Falta endpoint OAuth eBay documentado");
if (!envExample.includes("# EBAY_OAUTH_SCOPE=https://api.ebay.com/oauth/api_scope")) fail("Falta OAuth scope eBay documentado");
if (!envExample.includes("# EBAY_BROWSE_API_BASE=https://api.ebay.com/buy/browse/v1")) fail("Falta Browse API base documentada");
if (!envExample.includes("# EBAY_CONTEXTUAL_COUNTRY=ES")) fail("Falta contexto país eBay documentado");
if (!auth.includes("getEbayAccessToken")) fail("Falta getEbayAccessToken");
if (!auth.includes("buildEbayBasicAuthHeader")) fail("Falta Basic auth testeable");
if (!auth.includes("cachedEbayToken")) fail("Falta cache en memoria");
if (!auth.includes("ebayTokenPromise")) fail("Falta lock/promesa compartida");
if (!auth.includes("client_credentials")) fail("OAuth debe usar client credentials");
if (!client.includes("response.status === 401")) fail("Falta retry 401");
if (!client.includes("clearEbayCachedToken")) fail("401 debe limpiar token");
if (!client.includes('"X-EBAY-C-MARKETPLACE-ID"')) fail("Falta marketplace header");
if (!client.includes("X-EBAY-C-ENDUSERCTX")) fail("Falta preparación de tracking afiliado eBay");
if (!enduserctx.includes("affiliateCampaignId")) fail("Enduserctx debe soportar affiliateCampaignId");
if (!enduserctx.includes("buildEbayGameCustomId")) fail("Falta customid automático por juego para eBay");
if (!enduserctx.includes('"game"')) fail("El customid eBay debe incluir el segmento game");
if (!search.includes("/item_summary/search")) fail("Falta Browse item_summary/search");
if (!docs.includes("Inventory Discovery & Refresh decision")) fail("Falta decisión Inventory Discovery & Refresh en docs eBay");
if (!docs.includes("Browse API sigue siendo la única fuente eBay de V1")) fail("Docs deben fijar Browse API como única fuente V1");
if (!docs.includes("Feed API queda fuera de V1")) fail("Docs deben dejar Feed API fuera de V1");
if (!docs.includes("Notification API queda fuera de V1")) fail("Docs deben dejar Notification API fuera de V1");
if (!docs.includes("Fuera de la rotación diaria por defecto")) fail("Docs deben dejar eBay fuera de la rotación por defecto");
if (!dailyPriceIngest.includes('skipped = {"ebay", "todocoleccion", "vinted"}')) fail("daily_price_ingest debe omitir eBay por defecto");
if (!platformSources.includes("ENABLE_EBAY_PRICE_WHEEL")) fail("platform_sources debe requerir override para meter eBay en rueda");
if (/feed\.api|feed beta|notification api|webhook|webhooks|buy\/feed|commerce\/notification|getFeedTypes|getFiles|downloadFile|createSubscription|getTopics/i.test(ebayCode)) fail("EBAY_SYNC_V1 no debe implementar Feed API, Notification API ni webhooks");
if (!normalize.includes("itemAffiliateWebUrl")) fail("affiliateUrl debe usar itemAffiliateWebUrl");
if (!normalize.includes("itemWebUrl") || !normalize.includes("rawProductUrl")) fail("itemWebUrl solo debe guardarse como rawProductUrl/externalProductUrl");
if (/affiliateUrl:\s*rawProductUrl|affiliateUrl:\s*item\.itemWebUrl|affiliateUrl:\s*itemWebUrl/.test(normalize)) fail("No usar itemWebUrl como affiliateUrl");
const affiliateOffers = read("src/lib/affiliate-offers.ts");
const offersPanel = read("src/components/affiliate-offers-panel.tsx");
if (!affiliateOffers.includes("fallbackCta")) fail("El fallback eBay debe separarse de offers");
if (!affiliateOffers.includes("!item.itemAffiliateWebUrl")) fail("Las ofertas públicas de eBay deben exigir itemAffiliateWebUrl");
if (!affiliateOffers.includes("url: item.itemAffiliateWebUrl")) fail("Las ofertas públicas de eBay deben enlazar itemAffiliateWebUrl");
if (affiliateOffers.includes("item.itemAffiliateWebUrl ?? appendEbayTracking")) fail("El fallback trackeado no debe renderizarse como oferta individual");
if (!affiliateOffers.includes("Buscar este juego en eBay")) fail("El fallback debe llamarse Buscar este juego en eBay");
if (!offersPanel.includes("fallbackCta.label")) fail("El fallback debe renderizarse como CTA separado");
if (!normalize.includes("invalid_affiliate_url")) fail("Sin itemAffiliateWebUrl debe quedar invalid_affiliate_url");
if (!normalize.includes("itemEndDate")) fail("Debe soportar itemEndDate para expiración");
if (!normalize.includes("OUT_OF_STOCK")) fail("Debe soportar OUT_OF_STOCK como inactive");
if (!normalize.includes("hasBlockedAffiliateKeyword")) fail("Falta bloqueo conservador de keywords");
if (!normalize.includes("scoreOfferMatch")) fail("Falta scoring común");
if (/process\.env\.NEXT_PUBLIC_EBAY_|NEXT_PUBLIC_EBAY_[A-Z0-9_]+\s*=/.test(source)) fail("No debe existir NEXT_PUBLIC_EBAY");
if (/console\.(log|error|warn)[^\n]*(Authorization|access_token|client_secret|campaign id|campaignId|EBAY_CAMPAIGN_ID)/i.test(smoke)) fail("Smoke eBay imprime secretos");
if (/console\.(log|error|warn)[^\n]*(Authorization|access_token|client_secret|EBAY_CAMPAIGN_ID)/i.test(source)) fail("Código eBay no debe imprimir secretos");
if (/AlbertoI-RegionAt|PRD-[a-z0-9-]{20,}|35b4ee83|3094313c/i.test(source + envExample)) fail("Posibles tokens hardcodeados");
if (envExample.includes("AFFILIATE_OFFERS_ENABLED=true")) fail("AFFILIATE_OFFERS_ENABLED no debe activarse por defecto");
if (/AFFILIATE_OFFERS_ENABLED\s*=\s*["']?true/i.test(ebayCode)) fail("eBay no debe activar AFFILIATE_OFFERS_ENABLED");
if (/EBAY_AFFILIATE_ENABLED\s*=\s*["']?true/i.test(ebayCode)) fail("Módulo eBay no debe activar EBAY_AFFILIATE_ENABLED");
if (/process\.env\.EBAY_|EBAY_CLIENT_SECRET|EBAY_ACCESS_TOKEN|EBAY_OAUTH_TOKEN/.test(frontendSource)) fail("Frontend público no debe leer secretos eBay");

if (failures.length) {
  console.error("EBAY_SYNC_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("EBAY_SYNC_V1 válido: auth, search, normalización y compliance OK.");
