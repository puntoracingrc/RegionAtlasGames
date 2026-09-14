import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const GUIDE_PATH = path.join(ROOT, "data/catalog-edition-guides-ac-ps3.json");
const QUEUE_PATH = path.join(ROOT, "data/research/ac-ps3-regional-packaging-queue-2026-09-13.json");
const DECISIONS_PATH = path.join(ROOT, "data/research/ac-ps3-regional-packaging-decisions-2026-09-13.json");
const WRITE = process.argv.includes("--write");

const sourceQueueBytes = fs.readFileSync(QUEUE_PATH);
const sourceQueueSha256 = createHash("sha256").update(sourceQueueBytes).digest("hex");
const expectedSourceQueueSha256 = "07015c2e38fc2331c6dc5ef57e48816515404440356be49b74153c47107635b0";
if (sourceQueueSha256 !== expectedSourceQueueSha256) {
  throw new Error(`Unexpected research queue checksum: ${sourceQueueSha256}`);
}
const sourceQueue = JSON.parse(sourceQueueBytes.toString("utf8"));
const originalGuideText = fs.readFileSync(GUIDE_PATH, "utf8");
const document = JSON.parse(originalGuideText);

function upsertById(entries, entry) {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index < 0) entries.push(entry);
  else entries[index] = entry;
}

function unique(values) {
  return [...new Set(values)];
}

function catalogPath(catalogId) {
  const id = catalogId
    .replace(/^ps3-(?:usa-|japon-)?/, "")
    .replaceAll("%27", "-")
    .replaceAll("&#43;", "-")
    .replaceAll("&amp;", "-")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  const region = catalogId.startsWith("ps3-usa-") ? "pal-us" : catalogId.startsWith("ps3-japon-") ? "pal-jp" : "pal-es";
  return `/catalogo/${id}-ps3-${region}`;
}

function makeGuide(id, title, game) {
  return {
    schemaVersion: 2,
    id,
    title,
    reviewedAt: "2026-09-13",
    note: "Inventario físico V2: las cajas se separan por evidencia propia; los mercados pendientes no se deducen del idioma.",
    game,
    editionFamilies: [],
    physicalEditions: [],
    evidence: [],
    images: [],
    sources: [],
    evidenceNote: "Cobertura parcial y trazable; no representa todas las cajas publicadas en el mundo.",
  };
}

function guide(id, title, game) {
  let result = document.guides.find((candidate) => candidate.id === id);
  if (!result) {
    result = makeGuide(id, title, game);
    document.guides.push(result);
  }
  result.evidence ??= [];
  result.images ??= [];
  result.sources ??= [];
  return result;
}

function addSource(targetGuide, label, url) {
  if (!targetGuide.sources.some((source) => source.url === url)) targetGuide.sources.push({ label, url });
}

function addEvidence(targetGuide, observationId, type, label, url, summary, supports) {
  const id = `ac-ps3-regional-${observationId.toLowerCase()}`;
  upsertById(targetGuide.evidence, { id, type, label, url, summary, supports });
  addSource(targetGuide, `${observationId} · ${label}`, url);
  return id;
}

const imageDefinitions = {
  O100: ["o100.jpg", 428, 502, "dd57ce4821533dc1e1516eefff863ffb42504e5786270e82dd602850f0dbfda2", "31d510c1b115c54f544930abfa55ec320a3dd31fa6a741ca21cf42423081a1e0", 1200, 630, "1f36a1124ee5d7f2ddf30772dd4b1ed526088f684b28a6c072935da7829d0b3a"],
  O101: ["o101.jpg", 193, 242, "331fc709bd32d5c7ea3ea544a8bde1cfead666f75dce22599986a0488b6f3828", "0d1513573ffdfb7ef14711571ef71793a229c75b081eb159b5c476d400f315cd", 1200, 630, "f258a87c336252bd6bd7cf2434e97ee4261c8061208421a95d21727b63ecf33d"],
  O103: ["o103.png", 252, 291, "e375fc7970207b3f804dc4e994335ce2a5c7ddee6769ccbb1330a1ce08c77049", "c38260e38b2aef352fcec708d01d8b5b79429a0813b6a62c3ac18fc171dbc7a6", 1024, 768, "e87f57323b12b76e5e65f14ea33d6124ada4134d1d066d7900562a8c7c26e870"],
  O104: ["o104.jpg", 481, 618, "48d1e48dddd6fe22d87fff6817d87b19799ec04118650c6e678972ec25c4c12f", "bdff2785027e9d5eef57688f4191ea1c256c52661ea99dd84caabad15d17b682", 1200, 630, "50ae6bd40090926b93ac93d764f69b9af5f9f2cab007b15cfca6f20015496e8e"],
  O107: ["o107.jpg", 371, 434, "2526c1f1d75706131e17b814b0cc3b1889acf063ccb32f380166723b910d64f4", "bb6bc97c493b42ff6b8dd3e18fa2500019b4315ff9d066594e3b0853dfc8f428", 1200, 630, "40b35d6bbea6b0d21c8e9f8c4392c18ea46b55002103071e8bd6973024953f26"],
  O108: ["o107.jpg", 371, 434, "2526c1f1d75706131e17b814b0cc3b1889acf063ccb32f380166723b910d64f4", "bb6bc97c493b42ff6b8dd3e18fa2500019b4315ff9d066594e3b0853dfc8f428", 1200, 630, "40b35d6bbea6b0d21c8e9f8c4392c18ea46b55002103071e8bd6973024953f26"],
  O109: ["o109.jpg", 351, 413, "4e5c5161898b72daaea16b52f6c141565af73bbb7de2d348971e16482744a4f8", "c852a98c201ea5334dabfd0437f3549369a221ee4a77705e8b166ae5409e28a7", 1200, 630, "124b25d35360ab8a030e28b1d3d8647d6b0393011ce8546caa0567331a778566"],
  O110: ["o110.jpg", 357, 442, "7f4814dcd0e9725185f2f961766263a2f49703ca823edd228ec7b843f94ec52f", "3ca87a44e69f3bcba291ef306e75efc0f4199dacdd7bc0772e72a535db572238", 1200, 630, "3a23bee5b41f574e3cd4399608623e8b07e7c7dc306430c5845b069cca4fca5c"],
  O111: ["o111.jpg", 500, 585, "fdbfcfd025a4943778dc2525ad986d6e8f1d887d0c392c63807ce798ac4c038c", "c3ceb64fe562e8db77b4d2bed10faa28612481f5482e840fe54cad6aa314c1b9", 1200, 630, "d9ef6da3c6f4525f99eb02c88cd5345c767096cce7ee7fad0dc738f0ee982445"],
  O112: ["o112.jpg", 373, 440, "c15619249d14780220e7f6536ef56a7bd42b842f4870ac2687df43006f412720", "12a2493d108f36ab76b9e09e5e47db44f0ec3497df0697071c593850afd49f55", 1200, 630, "3f7de494f4384c065e911c58e619d82d2a6ac3c8b523c0fd5c2b59d098d85f23"],
  O113: ["o113.jpg", 508, 600, "b7366c8fe9115ea54d84b55721dd1d9dbba9498e4b531580c966a992a706cb4f", "18e80165899f4c80152cc6ef33311a6e4932af5b2a62c659aa031944b1e9572d", 1200, 630, "7ccdec893abbf5ee637b7413574e3ae1758fbdb0a7e83d5875fcbb4588fc07bd"],
  O115: ["o115-ebay.jpg", 1390, 1600, "cc349552f67782e240e1beabaa364e357a7c112324e250d1740ebe4990740763", "2f088df6dfcd202ccc177e379951fece19e8bca3e2f5a6a09a8f65d0aa3953de", 1390, 1600, "8e78dfdb5e04e39a52b0d17d0aae566208260753efd18ceaf53ba38bb0b7dabf", "https://www.ebay.de/p/25050694857"],
};

function addImage(targetGuide, observationId, caption, sourcePageUrl) {
  const definition = imageDefinitions[observationId];
  if (!definition) return undefined;
  const [filename, width, height, sha256, thumbnailSha256, originalWidth, originalHeight, originalSha256, imageSourcePageUrl] = definition;
  const stem = path.parse(filename).name;
  const key = `ac-ps3-regional-${observationId.toLowerCase()}-front`;
  const image = {
    key,
    url: `/catalog-covers/ps3/ac-regional-2026-09-13/display/${stem}.webp`,
    thumbnailUrl: `/catalog-covers/ps3/ac-regional-2026-09-13/thumb/${stem}.webp`,
    width,
    height,
    caption,
    evidenceType: "RETAILER_PHOTO_CONFIRMED",
    sha256,
    thumbnailSha256,
    originalUrl: `/catalog-covers/ps3/ac-regional-2026-09-13/original/${filename}`,
    originalWidth,
    originalHeight,
    originalSha256,
    sourcePageUrl: imageSourcePageUrl ?? sourcePageUrl,
    inspectedAt: "2026-09-13",
  };
  if (imageSourcePageUrl) addSource(targetGuide, `${observationId} · imagen de producto eBay`, imageSourcePageUrl);
  const imageIndex = targetGuide.images.findIndex((candidate) => candidate.key === key);
  if (imageIndex < 0) targetGuide.images.push(image);
  else targetGuide.images[imageIndex] = image;
  return key;
}

function baseEdition(id, label, broadRegion, editionType, marketRegions, catalogIds) {
  return { id, label, broadRegion, editionType, marketRegions, catalogIds };
}

function addEdition(targetGuide, edition) {
  upsertById(targetGuide.physicalEditions, edition);
}

function addFamily(targetGuide, id, label, representativeCatalogId, physicalEditionIds, priceConditions) {
  upsertById(targetGuide.editionFamilies, {
    id,
    label,
    representativeCatalogId,
    physicalEditionIds: unique(physicalEditionIds),
    priceConditions,
  });
}

function languageEvidence(component, languages, basis, evidenceId, note) {
  return [{ component, languages, basis, exhaustive: false, ...(note ? { note } : {}), evidenceIds: [evidenceId] }];
}

function regionalEdition({
  id, label, broadRegion = "EUROPE", editionType, barcode, boxCode, evidenceId, imageKey,
  componentLanguageEvidence = [], ratingSystems = [], marketRegions = [], catalogIds = [],
  containsCatalogIds = [], notes = [],
}) {
  return {
    id,
    label,
    broadRegion,
    editionType,
    marketRegions,
    packagingLanguages: [],
    componentLanguageEvidence,
    ratingSystems,
    ...(barcode ? { barcode } : {}),
    ...(boxCode ? { boxCode } : {}),
    catalogIds,
    evidenceIds: [evidenceId],
    imageKeys: imageKey ? [imageKey] : [],
    containsCatalogIds,
    notes,
  };
}

const ac1 = guide(
  "assassins-creed-ps3",
  "Ediciones físicas de Assassin's Creed en PlayStation 3",
  { title: "Assassin's Creed", platformSlug: "ps3", canonicalCatalogId: "ps3-assassin%27s-creed" },
);
for (const edition of [
  baseEdition("assassins-creed-ps3-europe-standard", "Standard · España", "EUROPE", "STANDARD", ["ES"], ["ps3-assassin%27s-creed"]),
  baseEdition("assassins-creed-ps3-north-america-standard", "Standard · USA", "NORTH_AMERICA", "STANDARD", ["US"], ["ps3-usa-assassin-s-creed"]),
  baseEdition("assassins-creed-ps3-japan-standard", "Standard · Japón", "ASIA", "STANDARD", ["JP"], ["ps3-japon-assassin%27s-creed"]),
  baseEdition("assassins-creed-ps3-europe-platinum", "Platinum · ficha legacy", "EUROPE", "BUDGET_REISSUE", ["ES"], ["ps3-assassin%27s-creed-platinum"]),
]) addEdition(ac1, edition);
{
  const url = "https://www.retroloco.es/producto/assassins-creed-esp/";
  const evidenceId = addEvidence(ac1, "O001", "RETAILER_ASSET", "O001: referencia PAL España de Assassin's Creed", url, "La ficha comercial identifica el producto PS3 español, el EAN y BLES; no acredita todos los idiomas impresos.", ["EAN 3307210263483", "BLES-00158", "mercado documentado: ES"]);
  const edition = ac1.physicalEditions.find((candidate) => candidate.id === "assassins-creed-ps3-europe-standard");
  edition.barcode = "3307210263483";
  edition.catalogNumber = "BLES-00158";
  edition.evidenceIds = unique([...(edition.evidenceIds ?? []), evidenceId]);
}

const ac1Specs = [
  ["O100", "3307210238382", "DE", "https://www.originalky.cz/assassin-s-creed-ps3-pouzite-p76738/"],
  ["O101", "3307210450968", "DE", "https://www.originalky.cz/assassin-s-creed-ps3-pouzite-p52101/"],
];
for (const [observationId, barcode, language, url] of ac1Specs) {
  const evidenceId = addEvidence(ac1, observationId, "RETAILER_PHOTO_CONFIRMED", `${observationId}: caja alemana declarada`, url, "La tienda vincula el EAN con una caja declarada en alemán; no acredita todas las caras ni un mercado nacional.", [`EAN ${barcode}`, "idioma de caja declarado: DE"]);
  const imageKey = addImage(ac1, observationId, `Imagen de producto inspeccionada para ${observationId}`, url);
  addEdition(ac1, regionalEdition({
    id: `assassins-creed-ps3-europe-standard-${observationId.toLowerCase()}`,
    label: `Standard · caja alemana declarada · ${barcode}`,
    editionType: "STANDARD", barcode, evidenceId, imageKey,
    componentLanguageEvidence: languageEvidence("BOX", [language], "DECLARED", evidenceId),
    notes: ["Mercado nacional pendiente; el idioma y la ubicación del vendedor no se usan como prueba de distribución."],
  }));
}
{
  const observationId = "O102";
  const url = "https://www.tradergames.fr/fr/playstation-3/338070-assassin-s-creed-sony-playstation-3-ps3-platinum-fr-occasion-3307210449061.html";
  const evidenceId = addEvidence(ac1, observationId, "RETAILER_ASSET", "O102: Assassin's Creed Platinum con caja francesa declarada", url, "La ficha identifica el producto Platinum y declara francés como idioma de caja; la imagen utilizable no estaba accesible.", ["EAN 3307210449061", "idioma de caja declarado: FR", "familia Platinum"]);
  addEdition(ac1, regionalEdition({
    id: "assassins-creed-ps3-europe-platinum-o102", label: "Platinum · caja francesa declarada · 3307210449061",
    editionType: "BUDGET_REISSUE", barcode: "3307210449061", evidenceId,
    componentLanguageEvidence: languageEvidence("BOX", ["FR"], "DECLARED", evidenceId),
    notes: ["Mercado nacional pendiente; sin imagen local porque la referencia no ofreció un asset reutilizable."],
  }));
}
addFamily(ac1, "standard", "Standard Edition", "ps3-assassin%27s-creed", [
  "assassins-creed-ps3-europe-standard", "assassins-creed-ps3-north-america-standard", "assassins-creed-ps3-japan-standard",
  "assassins-creed-ps3-europe-standard-o100", "assassins-creed-ps3-europe-standard-o101",
], ["sealed", "newRetail", "complete", "gameManual", "loose"]);
addFamily(ac1, "platinum", "Platinum", "ps3-assassin%27s-creed-platinum", [
  "assassins-creed-ps3-europe-platinum", "assassins-creed-ps3-europe-platinum-o102",
], ["sealed", "newRetail", "complete", "gameManual", "loose"]);

const ac2 = guide(
  "assassins-creed-ii-ps3",
  "Ediciones físicas de Assassin's Creed II en PlayStation 3",
  { title: "Assassin's Creed II", platformSlug: "ps3", canonicalCatalogId: "ps3-assassin%27s-creed-ii" },
);
for (const edition of [
  baseEdition("assassins-creed-ii-ps3-europe-standard", "Standard · España", "EUROPE", "STANDARD", ["ES"], ["ps3-assassin%27s-creed-ii"]),
  baseEdition("assassins-creed-ii-ps3-north-america-standard", "Standard · USA", "NORTH_AMERICA", "STANDARD", ["US"], ["ps3-usa-assassin-s-creed-ii"]),
  baseEdition("assassins-creed-ii-ps3-japan-standard", "Standard · Japón", "ASIA", "STANDARD", ["JP"], ["ps3-japon-assassin%27s-creed-ii"]),
  baseEdition("assassins-creed-ii-ps3-europe-goty", "Game of the Year Edition · ficha legacy", "EUROPE", "BUDGET_REISSUE", ["ES"], ["ps3-assassin%27s-creed-ii-game-of-the-year-edition"]),
]) addEdition(ac2, edition);
{
  const url = "https://www.todoconsolas.com/juegos-ps3/474-assassin_s_creed_ii_ps3_sp_po0274-3307211666535.html";
  const evidenceId = addEvidence(ac2, "O024", "RETAILER_ASSET", "O024: referencia PAL España de Assassin's Creed II", url, "La ficha comercial identifica el producto PS3 español y su EAN; sus imágenes se mantienen como ilustrativas.", ["EAN 3307211666535", "mercado documentado: ES"]);
  const edition = ac2.physicalEditions.find((candidate) => candidate.id === "assassins-creed-ii-ps3-europe-standard");
  edition.barcode = "3307211666535";
  edition.evidenceIds = unique([...(edition.evidenceIds ?? []), evidenceId]);
}
{
  const observationId = "O103";
  const url = "https://www.gamershouse.cz/akcni-adventury-na-ps3/ps3-assassin-s-creed-ii/";
  const evidenceId = addEvidence(ac2, observationId, "RETAILER_PHOTO_CONFIRMED", "O103: Assassin's Creed II con caja inglesa declarada", url, "La ficha separa el idioma de caja del idioma del juego y lo vincula al EAN.", ["EAN 3307211666504", "idioma de caja declarado: EN"]);
  const imageKey = addImage(ac2, observationId, "Imagen de producto inspeccionada para O103", url);
  addEdition(ac2, regionalEdition({
    id: "assassins-creed-ii-ps3-europe-standard-o103", label: "Standard · caja inglesa declarada · 3307211666504",
    editionType: "STANDARD", barcode: "3307211666504", evidenceId, imageKey, ratingSystems: ["BBFC"],
    componentLanguageEvidence: languageEvidence("BOX", ["EN"], "DECLARED", evidenceId),
    notes: ["Mercado nacional pendiente; la clasificación visible no demuestra por sí sola todos los mercados de la caja."],
  }));
}
{
  const observationId = "O104";
  const url = "https://www.originalky.cz/assassin-s-creed-ii-game-of-the-year-edition-ps3-pouzite-p268344/";
  const evidenceId = addEvidence(ac2, observationId, "RETAILER_PHOTO_CONFIRMED", "O104: Game of the Year / Essentials con caja alemana declarada", url, "La imagen muestra la línea Essentials y Game of the Year; la tienda declara caja alemana.", ["EAN 3307215659069", "idioma de caja declarado: DE", "línea Essentials / Game of the Year"]);
  const imageKey = addImage(ac2, observationId, "Imagen de producto inspeccionada para O104", url);
  addEdition(ac2, regionalEdition({
    id: "assassins-creed-ii-ps3-europe-goty-o104", label: "Game of the Year · Essentials · caja alemana declarada",
    editionType: "BUDGET_REISSUE", barcode: "3307215659069", evidenceId, imageKey, ratingSystems: ["USK"],
    componentLanguageEvidence: languageEvidence("BOX", ["DE"], "DECLARED", evidenceId),
    notes: ["Mercado nacional pendiente; se conserva la línea de reedición visible."],
  }));
}
{
  const observationId = "O026";
  const url = "https://www.mobygames.com/game/43958/assassins-creed-ii/covers/group-63645/";
  const evidenceId = addEvidence(ac2, observationId, "REAL_SCAN", "O026: caja compartida de Assassin's Creed II", url, "El grupo de escaneos identifica una sola caja física para Canadá, México y Estados Unidos.", ["mercados documentados: CA, MX y US", "una sola identidad de packaging"]);
  addEdition(ac2, regionalEdition({
    id: "assassins-creed-ii-ps3-north-america-shared-o026", label: "Standard · caja compartida CA / MX / US",
    broadRegion: "NORTH_AMERICA", editionType: "STANDARD", evidenceId, marketRegions: ["CA", "MX", "US"],
    notes: ["Una caja compartida entre tres mercados; se cuenta y colecciona una sola vez."],
  }));
}
addFamily(ac2, "standard", "Standard Edition", "ps3-assassin%27s-creed-ii", [
  "assassins-creed-ii-ps3-europe-standard", "assassins-creed-ii-ps3-north-america-standard", "assassins-creed-ii-ps3-japan-standard",
  "assassins-creed-ii-ps3-europe-standard-o103", "assassins-creed-ii-ps3-north-america-shared-o026",
], ["sealed", "newRetail", "complete", "gameManual", "loose"]);
addFamily(ac2, "goty", "Game of the Year Edition", "ps3-assassin%27s-creed-ii-game-of-the-year-edition", [
  "assassins-creed-ii-ps3-europe-goty", "assassins-creed-ii-ps3-europe-goty-o104",
], ["sealed", "newRetail", "complete", "gameManual", "loose"]);

const revelations = guide(
  "assassins-creed-revelations-ps3",
  "Ediciones físicas de Assassin's Creed: Revelations en PlayStation 3",
  { title: "Assassin's Creed: Revelations", platformSlug: "ps3", canonicalCatalogId: "ps3-assassin%27s-creed-revelations" },
);
for (const edition of [
  baseEdition("assassins-creed-revelations-ps3-europe-standard", "Standard · España", "EUROPE", "STANDARD", ["ES"], ["ps3-assassin%27s-creed-revelations"]),
  baseEdition("assassins-creed-revelations-ps3-north-america-standard", "Standard · USA", "NORTH_AMERICA", "STANDARD", ["US"], ["ps3-usa-assassin-s-creed-revelations"]),
  baseEdition("assassins-creed-revelations-ps3-japan-standard", "Standard · Japón", "ASIA", "STANDARD", ["JP"], ["ps3-japon-assassin%27s-creed-revelations"]),
  baseEdition("assassins-creed-revelations-ps3-europe-special", "Special Edition · ficha legacy", "EUROPE", "SPECIAL", ["ES"], ["ps3-assassin%27s-creed-revelations-special-edition"]),
]) addEdition(revelations, edition);
{
  const observationId = "O096";
  const url = "https://www.smartoys.be/catalog/retro-gaming-playstation-assassins-creed-revelations-p-3307215586631.html";
  const evidenceId = addEvidence(revelations, observationId, "REAL_PHOTO", "O096: Revelations con Assassin's Creed incluido", url, "El reverso observado contiene bloques NL y FR; los comercios NL y BE apuntan al mismo EAN.", ["EAN 3307215586631", "contraportada observada: NL / FR", "incluye Assassin's Creed"]);
  addEdition(revelations, regionalEdition({
    id: "assassins-creed-revelations-ps3-europe-ac1-o096", label: "Revelations con Assassin's Creed · contraportada NL / FR",
    editionType: "SPECIAL", barcode: "3307215586631", evidenceId, ratingSystems: ["PEGI"],
    componentLanguageEvidence: languageEvidence("BACK", ["NL", "FR"], "OBSERVED", evidenceId, "Sólo se examinó la contraportada."),
    containsCatalogIds: ["ps3-assassin%27s-creed"], notes: ["Mercado nacional pendiente; no se duplica por aparecer en comercios de dos países."],
  }));
}
{
  const observationId = "O097";
  const url = "https://psgames.ca/ps3-assassins-creed-revelations.html";
  const evidenceId = addEvidence(revelations, observationId, "REAL_PHOTO", "O097: reverso EN / FR con código de impresión", url, "La imagen del reverso permite leer inglés, francés y el código de impresión 346845-CVRF; no aporta EAN.", ["código de impresión 346845-CVRF", "contraportada observada: EN / FR"]);
  addEdition(revelations, regionalEdition({
    id: "assassins-creed-revelations-ps3-standard-o097", label: "Standard · contraportada EN / FR · 346845-CVRF",
    editionType: "STANDARD", boxCode: "346845-CVRF", evidenceId,
    componentLanguageEvidence: languageEvidence("BACK", ["EN", "FR"], "OBSERVED", evidenceId, "No se han examinado portada y lomo."),
    notes: ["Mercado nacional pendiente; el código conservado es de impresión, no un EAN."],
  }));
}
{
  const observationId = "O111";
  const url = "https://www.originalky.cz/assassin-s-creed-revelations-ps3-pouzite-p221262/";
  const evidenceId = addEvidence(revelations, observationId, "RETAILER_PHOTO_CONFIRMED", "O111: Special Edition con caja alemana declarada", url, "La foto inspeccionada muestra Special Edition y USK; la tienda declara caja alemana.", ["EAN 3307215589786", "idioma de caja declarado: DE", "familia Special Edition"]);
  const imageKey = addImage(revelations, observationId, "Imagen de producto inspeccionada para O111", url);
  addEdition(revelations, regionalEdition({
    id: "assassins-creed-revelations-ps3-europe-special-o111", label: "Special Edition · caja alemana declarada",
    editionType: "SPECIAL", barcode: "3307215589786", evidenceId, imageKey, ratingSystems: ["USK"],
    componentLanguageEvidence: languageEvidence("BOX", ["DE"], "DECLARED", evidenceId),
    notes: ["Mercado nacional pendiente; la inspección de la portada corrige la familia de investigación provisional."],
  }));
}
addFamily(revelations, "standard", "Standard Edition", "ps3-assassin%27s-creed-revelations", [
  "assassins-creed-revelations-ps3-europe-standard", "assassins-creed-revelations-ps3-north-america-standard", "assassins-creed-revelations-ps3-japan-standard",
  "assassins-creed-revelations-ps3-standard-o097",
], ["sealed", "newRetail", "complete", "gameManual", "loose"]);
addFamily(revelations, "special", "Special Edition", "ps3-assassin%27s-creed-revelations-special-edition", [
  "assassins-creed-revelations-ps3-europe-special", "assassins-creed-revelations-ps3-europe-ac1-o096", "assassins-creed-revelations-ps3-europe-special-o111",
], ["sealed", "newRetail", "complete"]);

const brotherhood = guide("assassins-creed-brotherhood-ps3");
for (const edition of [
  baseEdition("assassins-creed-brotherhood-ps3-europe-special", "Special Edition · ficha legacy", "EUROPE", "SPECIAL", ["ES"], ["ps3-assassin%27s-creed-brotherhood-special-edition"]),
  baseEdition("assassins-creed-brotherhood-ps3-europe-platinum", "Platinum · ficha legacy", "EUROPE", "BUDGET_REISSUE", ["ES"], ["ps3-assassin%27s-creed-brotherhood-platinum"]),
]) addEdition(brotherhood, edition);
for (const spec of [
  { observationId: "O107", barcode: "3307217927036", language: "EN", family: "standard", editionType: "STANDARD", label: "Standard · caja inglesa declarada" },
  { observationId: "O108", barcode: "3307215659311", language: "EN", family: "standard", editionType: "STANDARD", label: "Standard · segunda referencia con caja inglesa declarada" },
  { observationId: "O109", barcode: "3307219903939", language: "DE", family: "special", editionType: "SPECIAL", label: "Special Edition · caja alemana declarada", ratingSystems: ["USK"] },
  { observationId: "O110", barcode: "3307219951312", language: "DE", family: "platinum-special", editionType: "BUDGET_REISSUE", label: "Platinum · Special Edition · caja alemana declarada", ratingSystems: ["USK"] },
]) {
  const urlByObservation = {
    O107: "https://www.originalky.cz/assassin-s-creed-brotherhood-ps3-pouzite-p320843/",
    O108: "https://www.originalky.cz/assassin-s-creed-brotherhood-ps3-pouzite-p176479/",
    O109: "https://www.originalky.cz/assassin-s-creed-brotherhood-ps3-pouzite-p86554/",
    O110: "https://www.originalky.cz/assassin-s-creed-brotherhood-special-edition-ps3-pouzite-p209894/",
  };
  const url = urlByObservation[spec.observationId];
  const evidenceId = addEvidence(brotherhood, spec.observationId, "RETAILER_PHOTO_CONFIRMED", `${spec.observationId}: ${spec.label}`, url, "La foto y el campo de idioma de caja identifican esta referencia; el mercado nacional sigue pendiente.", [`EAN ${spec.barcode}`, `idioma de caja declarado: ${spec.language}`, `familia visual: ${spec.label.split(" · ")[0]}`]);
  const imageKey = addImage(brotherhood, spec.observationId, `Imagen de producto inspeccionada para ${spec.observationId}`, url);
  addEdition(brotherhood, regionalEdition({
    id: `assassins-creed-brotherhood-ps3-europe-${spec.family}-${spec.observationId.toLowerCase()}`,
    label: `${spec.label} · ${spec.barcode}`, editionType: spec.editionType, barcode: spec.barcode,
    evidenceId, imageKey, ratingSystems: spec.ratingSystems,
    componentLanguageEvidence: languageEvidence("BOX", [spec.language], "DECLARED", evidenceId),
    notes: [spec.observationId === "O108" ? "El frontal coincide con O107, pero el EAN es distinto; se conserva como identidad separada hasta cotejar reverso y tirada." : "Mercado nacional pendiente."],
  }));
}
const brotherhoodStandard = brotherhood.editionFamilies.find((family) => family.id === "standard");
addFamily(brotherhood, "standard", brotherhoodStandard.label, brotherhoodStandard.representativeCatalogId, [
  ...brotherhoodStandard.physicalEditionIds,
  "assassins-creed-brotherhood-ps3-europe-standard-o107", "assassins-creed-brotherhood-ps3-europe-standard-o108",
], brotherhoodStandard.priceConditions);
addFamily(brotherhood, "special", "Special Edition", "ps3-assassin%27s-creed-brotherhood-special-edition", [
  "assassins-creed-brotherhood-ps3-europe-special", "assassins-creed-brotherhood-ps3-europe-special-o109",
], ["sealed", "newRetail", "complete"]);
addFamily(brotherhood, "platinum-special", "Platinum / Special Edition", "ps3-assassin%27s-creed-brotherhood-platinum", [
  "assassins-creed-brotherhood-ps3-europe-platinum", "assassins-creed-brotherhood-ps3-europe-platinum-special-o110",
], ["sealed", "newRetail", "complete"]);

const ac3 = guide("assassins-creed-iii-ps3");
for (const edition of [
  baseEdition("assassins-creed-iii-ps3-europe-special", "Special Edition · ficha legacy", "EUROPE", "SPECIAL", [], ["ps3-assassin%27s-creed-iii-special-edition"]),
  baseEdition("assassins-creed-iii-ps3-north-america-nfr", "Not for Resale · USA · ficha legacy", "NORTH_AMERICA", "OTHER", ["US"], ["ps3-usa-assassin-s-creed-iii-not-for-resale"]),
]) addEdition(ac3, edition);
{
  const observationId = "O112";
  const url = "https://www.originalky.cz/assassin-s-creed-iii-ps3-pouzite-p72877/";
  const evidenceId = addEvidence(ac3, observationId, "RETAILER_PHOTO_CONFIRMED", "O112: PS3 Exclusive Edition con caja y manual alemanes", url, "La foto inspeccionada muestra PS3 Exclusive Edition y USK 16; la ficha declara caja y manual alemanes.", ["EAN 3307215644836", "caja declarada: DE", "manual declarado: DE", "familia visual: PS3 Exclusive Edition"]);
  const imageKey = addImage(ac3, observationId, "Imagen de producto inspeccionada para O112", url);
  addEdition(ac3, regionalEdition({
    id: "assassins-creed-iii-ps3-europe-exclusive-o112", label: "PS3 Exclusive Edition · caja y manual alemanes declarados",
    editionType: "SPECIAL", barcode: "3307215644836", evidenceId, imageKey, ratingSystems: ["USK"],
    componentLanguageEvidence: [
      ...languageEvidence("BOX", ["DE"], "DECLARED", evidenceId),
      ...languageEvidence("MANUAL", ["DE"], "DECLARED", evidenceId),
    ],
    notes: ["Mercado nacional pendiente. No se fusiona con la ficha australiana Special / Exclusive existente, cuya portada es distinta."],
  }));
}
{
  const observationId = "O082";
  const url = "https://www.mobygames.com/game/59414/assassins-creed-iii/covers/";
  const evidenceId = addEvidence(ac3, observationId, "REAL_SCAN", "O082: caja Standard alemana", url, "El grupo de carátulas PS3 identifica una caja Standard para Alemania, distinta de O112 Special.", ["mercado documentado: DE", "familia Standard"]);
  addEdition(ac3, regionalEdition({
    id: "assassins-creed-iii-ps3-europe-standard-de-o082", label: "Standard · Alemania",
    editionType: "STANDARD", evidenceId, marketRegions: ["DE"],
    notes: ["Imagen externa no incorporada: se mantiene placeholder y enlace de evidencia."],
  }));
}
{
  const observationId = "O083";
  const url = "https://www.mobygames.com/game/59414/assassins-creed-iii/covers/group-401916/";
  const evidenceId = addEvidence(ac3, observationId, "REAL_SCAN", "O083: caja canadiense Not for Resale", url, "El grupo físico identifica una caja canadiense marcada Not for Resale.", ["mercado documentado: CA", "marca física: Not for Resale"]);
  addEdition(ac3, regionalEdition({
    id: "assassins-creed-iii-ps3-north-america-nfr-ca-o083", label: "Not for Resale · Canadá",
    broadRegion: "NORTH_AMERICA", editionType: "OTHER", evidenceId, marketRegions: ["CA"],
    notes: ["No se absorbe en Standard retail; se conserva la marca de bundle como diferencia física."],
  }));
}
const ac3Standard = ac3.editionFamilies.find((family) => family.id === "standard");
addFamily(ac3, "standard", ac3Standard.label, ac3Standard.representativeCatalogId, [
  ...ac3Standard.physicalEditionIds, "assassins-creed-iii-ps3-europe-standard-de-o082",
], ac3Standard.priceConditions);
addFamily(ac3, "special", "Special / PS3 Exclusive Edition", "ps3-assassin%27s-creed-iii-special-edition", [
  "assassins-creed-iii-ps3-europe-special", "assassins-creed-iii-ps3-europe-exclusive-o112",
], ["sealed", "newRetail", "complete"]);
addFamily(ac3, "not-for-resale", "Not for Resale", "ps3-usa-assassin-s-creed-iii-not-for-resale", [
  "assassins-creed-iii-ps3-north-america-nfr", "assassins-creed-iii-ps3-north-america-nfr-ca-o083",
], ["sealed", "complete"]);

const rogue = guide("assassins-creed-rogue-ps3");
{
  const url = "https://www.todoconsolas.com/juegos-ps3/5033-assassin_s_creed_rogue_ps3_sp_po30044-3307215812327.html";
  const evidenceId = addEvidence(rogue, "O091", "RETAILER_ASSET", "O091: referencia PAL España de Assassin's Creed Rogue", url, "La ficha comercial identifica el producto PS3 español y su EAN; no se extiende a los idiomas de todas las caras.", ["EAN 3307215812327", "mercado documentado: ES"]);
  const edition = rogue.physicalEditions.find((candidate) => candidate.id === "assassins-creed-rogue-ps3-europe-standard");
  edition.barcode = "3307215812327";
  edition.evidenceIds = unique([...(edition.evidenceIds ?? []), evidenceId]);
}
for (const spec of [
  { observationId: "O113", barcode: "3307215812303", language: "DE", url: "https://www.originalky.cz/assassin-s-creed-rogue-ps3-pouzite-p70457/" },
  { observationId: "O114", barcode: "3307215812273", language: "FR", url: "https://www.tradergames.fr/fr/playstation-3/349787-assassin-s-creed-rogue-sony-playstation-3-ps3-fr-occasion-3307215812273.html" },
]) {
  const evidenceId = addEvidence(rogue, spec.observationId, imageDefinitions[spec.observationId] ? "RETAILER_PHOTO_CONFIRMED" : "RETAILER_ASSET", `${spec.observationId}: Rogue Standard con caja ${spec.language} declarada`, spec.url, "La tienda vincula el producto PS3 y el EAN con el idioma declarado de la caja; no certifica el mercado.", [`EAN ${spec.barcode}`, `idioma de caja declarado: ${spec.language}`]);
  const imageKey = addImage(rogue, spec.observationId, `Imagen de producto inspeccionada para ${spec.observationId}`, spec.url);
  addEdition(rogue, regionalEdition({
    id: `assassins-creed-rogue-ps3-europe-standard-${spec.observationId.toLowerCase()}`,
    label: `Standard · caja ${spec.language} declarada · ${spec.barcode}`, editionType: "STANDARD", barcode: spec.barcode,
    evidenceId, imageKey, ratingSystems: spec.observationId === "O113" ? ["PEGI"] : [],
    componentLanguageEvidence: languageEvidence("BOX", [spec.language], "DECLARED", evidenceId),
    notes: [imageKey ? "Mercado nacional pendiente." : "Mercado nacional pendiente; la fuente no ofreció una imagen utilizable y se muestra placeholder."],
  }));
}
const rogueStandard = rogue.editionFamilies.find((family) => family.id === "standard");
addFamily(rogue, "standard", rogueStandard.label, rogueStandard.representativeCatalogId, [
  ...rogueStandard.physicalEditionIds, "assassins-creed-rogue-ps3-europe-standard-o113", "assassins-creed-rogue-ps3-europe-standard-o114",
], rogueStandard.priceConditions);

const americanSaga = guide(
  "assassins-creed-american-saga-ps3",
  "Ediciones físicas de Assassin's Creed: The American Saga en PlayStation 3",
  { title: "Assassin's Creed: Birth Of A New World The American Saga", platformSlug: "ps3", canonicalCatalogId: "ps3-assassin%27s-creed-birth-of-a-new-world-the-american-saga" },
);
for (const edition of [
  baseEdition("assassins-creed-american-saga-ps3-europe", "Birth of a New World · ficha legacy", "EUROPE", "COMPILATION", ["ES"], ["ps3-assassin%27s-creed-birth-of-a-new-world-the-american-saga"]),
  baseEdition("assassins-creed-americas-collection-ps3-north-america", "The Americas Collection · USA", "NORTH_AMERICA", "COMPILATION", ["US"], ["ps3-usa-assassin-s-creed-the-americas-collection"]),
]) addEdition(americanSaga, edition);
{
  const observationId = "O115";
  const url = "https://www.originalky.cz/assassin-s-creed-birth-of-a-new-world-the-american-saga-ps3-pouzite-p428200/";
  const evidenceId = addEvidence(americanSaga, observationId, "RETAILER_PHOTO_CONFIRMED", "O115: Birth of a New World con caja alemana declarada", url, "La ficha y la imagen identifican el recopilatorio, no Assassin's Creed III independiente.", ["EAN 3307215802434", "idioma de caja declarado: DE", "producto: Birth of a New World / American Saga"]);
  const imageKey = addImage(americanSaga, observationId, "Imagen de producto inspeccionada para O115", url);
  addEdition(americanSaga, regionalEdition({
    id: "assassins-creed-american-saga-ps3-europe-o115", label: "Birth of a New World · caja alemana declarada",
    editionType: "COMPILATION", barcode: "3307215802434", evidenceId, imageKey,
    componentLanguageEvidence: languageEvidence("BOX", ["DE"], "DECLARED", evidenceId),
    notes: ["Mercado nacional pendiente. The Americas Collection conserva su denominación norteamericana en una familia separada."],
  }));
}
addFamily(americanSaga, "birth-of-a-new-world", "Birth of a New World / The American Saga", "ps3-assassin%27s-creed-birth-of-a-new-world-the-american-saga", [
  "assassins-creed-american-saga-ps3-europe", "assassins-creed-american-saga-ps3-europe-o115",
], ["sealed", "newRetail", "complete"]);
addFamily(americanSaga, "americas-collection", "The Americas Collection", "ps3-usa-assassin-s-creed-the-americas-collection", [
  "assassins-creed-americas-collection-ps3-north-america",
], ["sealed", "newRetail", "complete"]);

const blackFlag = guide("assassins-creed-iv-black-flag-ps3");
{
  const url = "https://www.todoconsolas.com/juegos-ps3/2651-assassin_s_creed_iv_black_flag_ps3_sp_po24602-3307215704974.html";
  const evidenceId = addEvidence(blackFlag, "O094", "RETAILER_ASSET", "O094: referencia PAL España de Assassin's Creed IV Black Flag", url, "La ficha comercial identifica el producto PS3 español y su EAN; no se traslada el dato a PS4.", ["EAN 3307215704974", "mercado documentado: ES"]);
  const edition = blackFlag.physicalEditions.find((candidate) => candidate.id === "assassins-creed-iv-black-flag-ps3-europe-standard");
  edition.barcode = "3307215704974";
  edition.evidenceIds = unique([...(edition.evidenceIds ?? []), evidenceId]);
}

const createdObservationIds = new Set([
  "O026", "O082", "O083", "O096", "O097", "O100", "O101", "O102", "O103", "O104",
  "O107", "O108", "O109", "O110", "O111", "O112", "O113", "O114", "O115",
]);
const enrichedObservationIds = new Set(["O001", "O024", "O091", "O094"]);
const alreadyImplemented = new Set(["O092", "O093", "O130", "O133"]);
const noAdditionalVariant = new Set(["O023", "O060", "O061", "O067", "O068", "O085", "O132"]);
const supervision = new Set(["O044", "O055", "O056", "O057", "O058", "O131"]);

const observationTargets = new Map([
  ["O001", ["assassins-creed-ps3-europe-standard", "ps3-assassin%27s-creed"]],
  ["O024", ["assassins-creed-ii-ps3-europe-standard", "ps3-assassin%27s-creed-ii"]],
  ["O026", ["assassins-creed-ii-ps3-north-america-shared-o026", "ps3-assassin%27s-creed-ii"]],
  ["O082", ["assassins-creed-iii-ps3-europe-standard-de-o082", "ps3-assassin%27s-creed-iii"]],
  ["O083", ["assassins-creed-iii-ps3-north-america-nfr-ca-o083", "ps3-usa-assassin-s-creed-iii-not-for-resale"]],
  ["O091", ["assassins-creed-rogue-ps3-europe-standard", "ps3-assassin%27s-creed-rogue"]],
  ["O094", ["assassins-creed-iv-black-flag-ps3-europe-standard", "ps3-assassin%27s-creed-iv-black-flag"]],
  ["O096", ["assassins-creed-revelations-ps3-europe-ac1-o096", "ps3-assassin%27s-creed-revelations-special-edition"]],
  ["O097", ["assassins-creed-revelations-ps3-standard-o097", "ps3-assassin%27s-creed-revelations"]],
  ["O100", ["assassins-creed-ps3-europe-standard-o100", "ps3-assassin%27s-creed"]],
  ["O101", ["assassins-creed-ps3-europe-standard-o101", "ps3-assassin%27s-creed"]],
  ["O102", ["assassins-creed-ps3-europe-platinum-o102", "ps3-assassin%27s-creed-platinum"]],
  ["O103", ["assassins-creed-ii-ps3-europe-standard-o103", "ps3-assassin%27s-creed-ii"]],
  ["O104", ["assassins-creed-ii-ps3-europe-goty-o104", "ps3-assassin%27s-creed-ii-game-of-the-year-edition"]],
  ["O107", ["assassins-creed-brotherhood-ps3-europe-standard-o107", "ps3-assassin%27s-creed-brotherhood"]],
  ["O108", ["assassins-creed-brotherhood-ps3-europe-standard-o108", "ps3-assassin%27s-creed-brotherhood"]],
  ["O109", ["assassins-creed-brotherhood-ps3-europe-special-o109", "ps3-assassin%27s-creed-brotherhood-special-edition"]],
  ["O110", ["assassins-creed-brotherhood-ps3-europe-platinum-special-o110", "ps3-assassin%27s-creed-brotherhood-platinum"]],
  ["O111", ["assassins-creed-revelations-ps3-europe-special-o111", "ps3-assassin%27s-creed-revelations-special-edition"]],
  ["O112", ["assassins-creed-iii-ps3-europe-exclusive-o112", "ps3-assassin%27s-creed-iii-special-edition"]],
  ["O113", ["assassins-creed-rogue-ps3-europe-standard-o113", "ps3-assassin%27s-creed-rogue"]],
  ["O114", ["assassins-creed-rogue-ps3-europe-standard-o114", "ps3-assassin%27s-creed-rogue"]],
  ["O115", ["assassins-creed-american-saga-ps3-europe-o115", "ps3-assassin%27s-creed-birth-of-a-new-world-the-american-saga"]],
]);

const decisions = sourceQueue.items.map((item) => {
  const observationId = item.observationId;
  let decision = "PENDIENTE_EVIDENCIA";
  let decisionReason = "La observación conserva una pista útil, pero falta abrir un conjunto coherente de imágenes o resolver su identidad física sin colisión.";
  if (createdObservationIds.has(observationId)) {
    decision = "CREADA";
    decisionReason = "La evidencia identifica una caja física distinguible sin reasignar ni borrar ninguna ficha existente.";
  } else if (enrichedObservationIds.has(observationId)) {
    decision = "REUTILIZADA_ENRIQUECIDA";
    decisionReason = "El EAN y el producto encajan inequívocamente con la caja Standard española ya publicada; se enriquece su identidad física sin crear un duplicado.";
  } else if (alreadyImplemented.has(observationId)) {
    decision = "YA_IMPLEMENTADA";
    decisionReason = "El producto o pack ya tiene identidad V2 o ficha de catálogo inequívoca; esta observación no crea una segunda caja.";
  } else if (noAdditionalVariant.has(observationId)) {
    decision = "NO_ES_VARIANTE_ADICIONAL";
    decisionReason = "La venta local, el idioma del software o el incentivo separado no demuestran una impresión de caja adicional.";
  } else if (supervision.has(observationId)) {
    decision = "PENDIENTE_SUPERVISION";
    decisionReason = "Resolver el caso exigiría relacionar o corregir una ficha genérica o una denominación potencialmente mezclada; no se modifica sin supervisión.";
  }
  const target = observationTargets.get(observationId);
  const source = item.researchObservationOriginal;
  return {
    observationId,
    priorityRank: item.priorityRank,
    sourceOriginal: item.sourcesOriginal,
    product: { rootId: source.rootId, platform: "ps3", editionFamily: source.editionFamily },
    physicalCandidate: source.candidateLabel,
    observedOrDeclaredData: {
      evidenceStatus: source.evidenceStatus,
      barcode: source.barcode || null,
      printedReference: source.printedReference || null,
      frontLanguagesObserved: source.frontLanguagesObserved || null,
      backLanguagesObserved: source.backLanguagesObserved || null,
      spineLanguagesObserved: source.spineLanguagesObserved || null,
      packagingLanguagesDeclared: source.packagingLanguagesDeclared || null,
      ratingClaim: source.ratingClaim || null,
      finding: source.finding,
    },
    supportedMarkets: enrichedObservationIds.has(observationId)
      ? ["ES"]
      : createdObservationIds.has(observationId) && observationId === "O026"
      ? ["CA", "MX", "US"]
      : createdObservationIds.has(observationId) && observationId === "O082"
        ? ["DE"]
        : createdObservationIds.has(observationId) && observationId === "O083"
          ? ["CA"]
          : [],
    checkedCatalogIds: target ? [target[1]] : item.productionCatalogIds,
    openedImages: imageDefinitions[observationId]
      ? [{ localAsset: `/catalog-covers/ps3/ac-regional-2026-09-13/original/${imageDefinitions[observationId][0]}`, components: ["FRONT"], limitation: "No demuestra las caras ausentes." }]
      : [],
    decision,
    decisionReason,
    appliedFields: target ? ["physicalEditionId", "family", "evidence", ...(imageDefinitions[observationId] ? ["image", "checksum"] : [])] : [],
    targetPhysicalEditionId: target?.[0] ?? null,
    targetCatalogId: target?.[1] ?? null,
    targetPublicUrl: target ? `${catalogPath(target[1])}#${target[0]}` : null,
    exactBlocker: decision.startsWith("PENDIENTE") ? source.pending || decisionReason : null,
  };
});

const decisionDocument = {
  kind: "regionatlas-ac-ps3-regional-packaging-decisions-v2",
  reviewedAt: "2026-09-13",
  sourceQueueSha256,
  counts: Object.fromEntries([...new Set(decisions.map((entry) => entry.decision))].sort().map((decision) => [decision, decisions.filter((entry) => entry.decision === decision).length])),
  observations: decisions,
};

const guideText = `${JSON.stringify(document, null, 2)}\n`;
const decisionText = `${JSON.stringify(decisionDocument, null, 2)}\n`;
if (WRITE) {
  fs.writeFileSync(GUIDE_PATH, guideText);
  fs.writeFileSync(DECISIONS_PATH, decisionText);
  console.log(`updated ${path.relative(ROOT, GUIDE_PATH)}`);
  console.log(`updated ${path.relative(ROOT, DECISIONS_PATH)}`);
} else {
  let failed = false;
  if (guideText !== originalGuideText) {
    console.error(`${path.relative(ROOT, GUIDE_PATH)} is not synchronized`);
    failed = true;
  }
  if (!fs.existsSync(DECISIONS_PATH) || decisionText !== fs.readFileSync(DECISIONS_PATH, "utf8")) {
    console.error(`${path.relative(ROOT, DECISIONS_PATH)} is not synchronized`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log("AC PS3 regional packaging data is synchronized");
}
