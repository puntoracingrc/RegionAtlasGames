import type { ScannerPerception, ScannerSource } from "./game-scanner";
import { ps2DocumentaryByCode, ps2SourceRecords } from "./ps2-documentary";
import { getPs2EditionDetails } from "./ps2-edition-data";
import { languageNames } from "./ps1-regional";
import { normalizePs2Serial } from "./ps2-regional";

const normalTitle = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function ps2ScannerKnowledge(perception: ScannerPerception, catalogIds: string[]) {
  const sources: ScannerSource[] = [{ id: "ps2-v2:method", url: "https://psxdatacenter.com/psx2/plist2.html", label: "PSX Data Center · documentación PS2", reviewedAt: "2026-09-11" }];
  const entries = [{ id: "ps2-v2:components", sourceIds: ["ps2-v2:method"], variants: [] as unknown[],
    text: "PS2: distingue familia regional, mercado del software, país de la carátula, textos, voces y manual. PAL no significa España y NTSC-J no significa Japón. Cada código conserva componente, ceros y sufijos. Un mismo serial puede tener caja normal, Platinum o Greatest Hits. Un EAN válido no confirma una caja y un SKU comercial no es necesariamente el serial del disco. Las galerías pueden mezclar papeles, reediciones y publicidad de otros mercados. Accesorio compatible no significa accesorio incluido; un DVD bonus anunciado no demuestra que esté en el lote. Estas referencias documentales no añaden observaciones a las fotos ni certifican autenticidad, variante física o contenido completo." }];
  const identityUsable = perception.platformSlug === "ps2" && perception.identityConfidence >= 0.85 && !!perception.title
    && !perception.identityConflict && !perception.platformConflict && !perception.multipleGames && !perception.multiplePlatforms;
  if (!identityUsable) return { sources, entries, knownVariantIds: [] as string[], consultedIds: [] as string[] };
  const urls = new Set(catalogIds.flatMap((id) => getPs2EditionDetails(id)?.sources.map((source) => source.url) ?? []));
  const sameTitle = (record: ReturnType<typeof ps2SourceRecords>[number]) => urls.has(record.sourceUrl) || record.names.some((name) => normalTitle(name) === normalTitle(perception.title!));
  const codes = [...new Set(perception.observations.flatMap((o) => o.codes).map(normalizePs2Serial))];
  const matched = codes.length ? codes.flatMap(ps2DocumentaryByCode).filter((r) => r.role !== "accessory_code" && sameTitle(r.record)).map((r) => r.record)
    : ps2SourceRecords().filter(sameTitle);
  const selected = [...new Map(matched.map((r) => [r.id, r])).values()];
  if (codes.length && !selected.length) entries.push({ id: "ps2-v2:unmatched", sourceIds: ["ps2-v2:method"], variants: [],
    text: "Los códigos observados no identifican exactamente una edición documental del título leído. No elimines sufijos ni uses el código de un periférico como el del juego. Conserva región y composición sin resolver y solicita el código legible de cada pieza." });
  if (selected.length > 12) entries.push({ id: "ps2-v2:ambiguous", sourceIds: ["ps2-v2:method"], variants: [],
    text: `Hay ${selected.length} referencias de este título. Hace falta un código legible y la banda de edición para acotar la consulta; el título no determina un mercado.` });
  const consultedIds: string[] = [];
  for (const record of selected.length <= 12 ? selected : []) {
    const sourceId = `ps2-v2:${record.id}`;
    sources.push({ id: sourceId, url: record.sourceUrl, label: `PSX Data Center · ${record.title}`, reviewedAt: "2026-09-11" });
    const facts = [`Referencia documental ${record.title}; códigos ${record.codes.join(", ")}. Familia ${record.family}; mercado de software ${record.market?.label ?? "pendiente de confirmar"}. Esto no determina el país de cada caja.`,
      `Textos y menús: ${languageNames(record.languages.text) || "no documentados"}. Voces: ${languageNames(record.languages.audio) || "no documentadas"}.`];
    if (record.editionLabels.length) facts.push(`Edición declarada: ${record.editionLabels.join(", ")}.`);
    if (record.releaseDate?.raw) facts.push(record.warnings.includes("release_date_precedes_ps2_retail_launch")
      ? `La fuente declara ${record.releaseDate.raw}, anterior al lanzamiento comercial de PS2. No usarla como fecha de lanzamiento del juego; sigue pendiente de contraste.`
      : `Fecha declarada para esta referencia: ${record.releaseDate.raw}; no propagar a las reediciones de su galería.`);
    for (const barcode of record.barcodeReferences.filter((b) => codes.includes(b.digits))) facts.push(`Código de barras documental ${barcode.digits}; alcance ${barcode.scope}${barcode.editionLabel ? `; presentación ${barcode.editionLabel}` : ""}${barcode.sourceDisclaimsCertainty ? "; la fuente advierte incertidumbre" : ""}. Verifica el papel fotografiado; no demuestra una tirada única.`);
    if (record.accessoryCodes.length) facts.push(`Códigos de accesorios: ${record.accessoryCodes.map((c) => c.value).join(", ")}; no son seriales del disco.`);
    if (record.reviewReasons.length || record.warnings.length) facts.push(`Datos que requieren contraste: ${[...record.reviewReasons, ...record.warnings].join(", ")}.`);
    for (const finding of record.findings) facts.push(`Observación documental (${finding.evidenceClass}; no ground truth independiente): ${finding.observation} ${finding.engineRule}`);
    facts.push("Contrasta cada pieza fotografiada. Las referencias no certifican una combinación de fábrica ni habilitan un variantId.");
    entries.push({ id: sourceId, text: facts.join(" "), sourceIds: [sourceId], variants: [] });
    consultedIds.push(record.id);
  }
  return { sources, entries, knownVariantIds: [] as string[], consultedIds };
}
