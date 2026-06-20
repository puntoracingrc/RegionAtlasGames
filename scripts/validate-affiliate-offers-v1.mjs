import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
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
    if (lstatSync(full).isSymbolicLink() && !existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const disclosureComponent = "src/components/affiliate/affiliate-disclosure.tsx";
const offersPanel = read("src/components/affiliate-offers-panel.tsx");
const envExample = read(".env.example");
const affiliateOffers = read("src/lib/affiliate-offers.ts");
const disclosure = read("src/lib/affiliate/disclosure.ts");
const allSource = walk(root)
  .filter((full) => /\.(ts|tsx|js|jsx|mjs)$/.test(full))
  .filter((full) => !full.includes(`${path.sep}scripts${path.sep}`))
  .map((full) => readFileSync(full, "utf8"))
  .join("\n");

assert(existsSync(file("docs/affiliate-offers-v1.md")), "Falta docs/affiliate-offers-v1.md");
assert(existsSync(file(disclosureComponent)), "Falta componente AffiliateDisclosure");
assert(disclosure.includes("Disclosure:"), "El disclosure no empieza por Disclosure:");
assert(offersPanel.includes("<AffiliateDisclosure"), "AffiliateOffersPanel debe renderizar AffiliateDisclosure");
assert(offersPanel.includes('rel="sponsored nofollow noopener noreferrer"'), "Los enlaces afiliados deben usar rel sponsored nofollow noopener noreferrer");
assert(offersPanel.includes('target="_blank"'), "Los enlaces afiliados deben abrirse con target _blank tras click voluntario");
assert(offersPanel.includes("getEbayAffiliateImpressionPixelUrl"), "El panel debe soportar píxel de impresión eBay");
assert(offersPanel.includes("<img") && offersPanel.includes('aria-hidden="true"'), "El píxel eBay debe renderizarse como imagen no interactiva");
assert(existsSync(file("src/app/affiliate-disclosure/page.tsx")), "Falta página /affiliate-disclosure/");
assert(read("src/app/affiliate-disclosure/page.tsx").includes("no vende directamente"), "La página legal debe indicar que Region Atlas Games no vende directamente");
assert(envExample.includes("# AFFILIATE_OFFERS_ENABLED=false"), "AFFILIATE_OFFERS_ENABLED debe estar false por defecto");
assert(envExample.includes("# AFFILIATE_OFFERS_PRODUCTION_WHITELIST=true"), "Debe existir AFFILIATE_OFFERS_PRODUCTION_WHITELIST=true documentado");
assert(existsSync(file("data/affiliate-offers-whitelist.json")), "Falta data/affiliate-offers-whitelist.json");
assert(affiliateOffers.includes("affiliateGameWhitelisted"), "Falta control de whitelist en getAffiliateOfferBlock");
assert(affiliateOffers.includes("affiliate-offers-whitelist.json"), "Affiliate offers debe leer data/affiliate-offers-whitelist.json");
assert(affiliateOffers.includes("ebayFallbackSearchOffer"), "Falta fallback de búsqueda eBay sin resultados API");
assert(affiliateOffers.includes("item.itemAffiliateWebUrl ?? appendEbayTracking"), "eBay debe priorizar itemAffiliateWebUrl y solo usar fallback trackeado si falta");
assert(affiliateOffers.includes("trackingId"), "AffiliateOfferBlock debe devolver trackingId por ficha");
assert(offersPanel.includes("trackingId") && read("src/app/catalogo/[slug]/page.tsx").includes("trackingId={affiliateOffers.trackingId}"), "El panel público debe recibir trackingId por ficha");
assert(envExample.includes("# EBAY_AFFILIATE_IMPRESSION_PIXEL_URL="), "Falta documentar píxel de impresión eBay");
assert(!/process\.env\.NEXT_PUBLIC_RAKUTEN_|NEXT_PUBLIC_RAKUTEN_[A-Z0-9_]+\s*=/.test(allSource), "No debe existir uso real de NEXT_PUBLIC_RAKUTEN_*");
assert(!/<iframe[^>]+(?:ebay|rakuten|amazon|affiliate|adservice|marketingtracking)/i.test(allSource), "No debe haber iframes ocultos de afiliación");
assert(!/auto.?click|cookie.?stuffing|window\.open\([^)]*\)/i.test(allSource), "No debe haber autoclick, cookie stuffing ni aperturas automáticas");
assert(read("src/lib/affiliate/matching/score-offer-match.ts").includes("affiliateMinConfidenceRelated") === false, "El scoring no debe depender de UI");
assert(read("src/lib/affiliate/providers/mock.provider.ts").includes("fetchedAt"), "Las ofertas mock deben tener fetchedAt");
assert(read("src/lib/affiliate/types.ts").includes("matchConfidence"), "El modelo debe incluir matchConfidence");
assert(read("src/lib/affiliate/types.ts").includes("provider"), "El modelo debe incluir provider");

if (failures.length) {
  console.error("AFFILIATE_OFFERS_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AFFILIATE_OFFERS_V1 válido: disclosure, links, página legal y estructura OK.");
