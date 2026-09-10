import type { ScannerPerception, ScannerSource } from "./game-scanner";
import { getPs1EditionDetails } from "./ps1-edition-data";
import { languageNames, normalizePs1Serial, type Ps1EditionDetails } from "./ps1-regional";

export type Ps1ScannerIdentity = {
  id: string; title: string; platformSlug: string; region?: string;
  regionFamily?: string; marketRegion?: string | null; regionalStatus?: string;
  canonicalSerials?: string[]; resolutionSerials?: string[];
};
type Entry = { id: string; text: string; sourceIds: string[]; variants: unknown[] };

/** Documentary retrieval after perception. It never adds observations or certifies a physical set. */
export function ps1ScannerKnowledge(
  catalog: readonly Ps1ScannerIdentity[], perception: ScannerPerception, titleCandidateIds: readonly string[],
  editionForId: (id: string) => Ps1EditionDetails | undefined = getPs1EditionDetails,
) {
  const sources: ScannerSource[] = [{ id: "ps1-v2:method", url: "https://psxdatacenter.com/pal_list.html",
    label: "PSX Datacenter: índices, fichas y referencias de componentes", reviewedAt: "2026-09-10" }];
  const entries: Entry[] = [{ id: "ps1-v2:component-rules", sourceIds: ["ps1-v2:method"], variants: [],
    text: "PS1: separa familia regional, mercado de distribución, idiomas del software e idiomas de caja/manual. Español no demuestra España; inglés no demuestra Reino Unido. Las fichas son referencias documentales, no observaciones de este ejemplar. Un código documentado no demuestra que se vea en las fotos ni que corresponda a la caja, disco o manual fotografiado. Conserva ceros y sufijos de los códigos. Un mismo código puede aparecer en varias tiradas o cajas. Varios discos pueden pertenecer a una sola edición. Contrasta cada componente por separado; solicita fotos legibles de los códigos que falten. Ninguna de estas referencias certifica un conjunto de fábrica ni habilita un variantId." }];
  const observedCodes = new Set(perception.observations.flatMap((o) => o.codes).map(normalizePs1Serial)
    .filter((code) => /^(S[A-Z]{3}|LSP)-\d/.test(code)));
  const identityUsable = perception.platformSlug === "ps1" && perception.identityConfidence >= 0.85
    && !perception.identityConflict && !perception.platformConflict && !perception.multipleGames && !perception.multiplePlatforms;
  const allowedIds = new Set(identityUsable ? titleCandidateIds : []);
  const titleMatches = catalog.filter((g) => g.platformSlug === "ps1" && allowedIds.has(g.id) && g.regionalStatus === "resolved");
  const selected = observedCodes.size ? titleMatches.filter((g) =>
    [...(g.canonicalSerials ?? []), ...(g.resolutionSerials ?? [])].some((code) => observedCodes.has(normalizePs1Serial(code)))) : titleMatches;
  if (observedCodes.size && !selected.length) entries.push({ id: "ps1-v2:unmatched-code", sourceIds: ["ps1-v2:method"], variants: [],
    text: "Ningún código PS1 leído coincide exactamente con una edición resuelta del título candidato. No asignes por aproximación el mercado ni la composición. Puede tratarse de una lectura errónea, otro componente o una edición todavía no documentada; solicita una foto nítida del código." });
  // Avoid a truncated list looking like an exhaustive edition match.
  if (selected.length > 12) entries.push({ id: "ps1-v2:many-candidates", sourceIds: ["ps1-v2:method"], variants: [],
    text: `Hay ${selected.length} ediciones documentadas compatibles con el título. Se necesita un código legible para consultar una lista acotada; el título por sí solo no determina región ni variante física.` });
  const consultedIds: string[] = [];
  for (const game of selected.length <= 12 ? selected : []) {
    const edition = editionForId(game.id);
    if (!edition || edition.status !== "resolved") continue;
    const sourceIds: string[] = [];
    for (const source of edition.sources) {
      if (!/^https?:\/\//i.test(source.url)) continue;
      let found = sources.find((row) => row.url === source.url);
      if (!found) {
        found = { id: `ps1-v2:source-${sources.length}`, url: source.url, label: source.label, reviewedAt: "2026-09-10" };
        sources.push(found);
      }
      sourceIds.push(found.id);
    }
    if (!sourceIds.length) continue;
    const facts = [`Referencia documental ${game.id}: ${game.title}. Familia ${game.regionFamily}; mercado ${game.marketRegion}.`,
      `Códigos de ${edition.serialScope === "packaging" ? "la caja; equivalencia con el disco NO verificada" : "disco/software"}: ${(game.canonicalSerials ?? []).join(", ")}.`];
    if (edition.editionLabels?.length) facts.push(`Etiqueta de edición en la fuente: ${edition.editionLabels.join(", ")}.`);
    if (edition.languages?.all.length) facts.push(`Idiomas documentados: ${languageNames(edition.languages.all)}.`);
    if (edition.languages?.text.length) facts.push(`Textos y menús: ${languageNames(edition.languages.text)}.`);
    if (edition.languages?.audio.length) facts.push(`Voces: ${languageNames(edition.languages.audio)}.`);
    if (edition.languages?.discrepancy) facts.push("El índice y la ficha no enumeran los idiomas igual; se conserva el detalle de textos/voces de la ficha.");
    if (edition.components.length > 1) facts.push(`Componentes documentados de esta edición: ${edition.components.map((c) => `${c.kind} ${c.number}: ${c.serial}${c.title ? ` (${c.title})` : ""}`).join("; ")}.`);
    if (edition.serialAliases.length) facts.push(`Equivalencias documentadas, sin eliminar sufijos automáticamente: ${edition.serialAliases.map((a) => `${a.sourceSerial} → ${a.canonicalSerial} (${a.relation})`).join("; ")}.`);
    if (edition.regionalReleaseDate?.raw) facts.push(`Fecha indicada por PSX Datacenter: ${edition.regionalReleaseDate.raw}${edition.editionLabels?.length ? "; fecha propia de esta reedición por confirmar" : ""}.`);
    facts.push("La asociación física de caja, disco y manual sigue sin certificar. Los códigos anteriores son de referencia; cita observaciones independientes para afirmar qué aparece en las fotos.");
    entries.push({ id: `ps1-v2:${game.id}`, text: facts.join(" "), sourceIds: [...new Set(sourceIds)], variants: [] });
    consultedIds.push(game.id);
  }
  return { sources, entries, knownVariantIds: [] as string[], consultedIds };
}
