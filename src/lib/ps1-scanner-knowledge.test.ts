import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeScannerPerception } from "./game-scanner";
import { ps1ScannerKnowledge, type Ps1ScannerIdentity } from "./ps1-scanner-knowledge";
import { exactScannerCatalogIds, loadScannerKnowledge } from "./scanner-knowledge";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as Ps1ScannerIdentity[];
const perception = (title: string, codes: string[] = []) => normalizeScannerPerception({ title, platformSlug: "ps1", identityConfidence: 0.95,
  observations: [{ photo: 1, component: "game", description: "Disco fotografiado", codes }] }, 1);
const consult = (title: string, codes: string[] = []) => {
  const p = perception(title, codes);
  return ps1ScannerKnowledge(catalog, p, exactScannerCatalogIds(catalog, p, "ps1"));
};

test("PS1 scanner retrieves Dino Crisis 2 text and voice facts from the observed exact serial", () => {
  const result = consult("Dino Crisis 2", ["SLES03225"]);
  assert.equal(result.consultedIds.length, 1);
  const text = result.entries.map((e) => e.text).join(" ");
  assert.match(text, /mercado Spain/);
  assert.match(text, /Textos y menús: Español/);
  assert.match(text, /Voces: Inglés/);
  assert.deepEqual(result.knownVariantIds, []);
  assert(result.entries.every((e) => e.variants.length === 0));
});
test("PS1 scanner preserves documentary packaging scope and cannot alias GTA 2 to a different disc", () => {
  const result = consult("Grand Theft Auto 2", ["SLES-02458"]);
  assert.equal(result.consultedIds.length, 1);
  assert.match(result.entries.at(-1)!.text, /la caja; equivalencia con el disco NO verificada/);
  assert.match(result.entries.at(-1)!.text, /mercado France/);
  assert(!result.entries.at(-1)!.text.includes("SLES-02453"));
});
test("PS1 scanner never invents code observations and refuses an unmatched suffix", () => {
  const p = perception("Dino Crisis 2", ["SLES-03225-UNKNOWN"]);
  const before = structuredClone(p);
  const result = ps1ScannerKnowledge(catalog, p, exactScannerCatalogIds(catalog, p, "ps1"));
  assert.deepEqual(p, before);
  assert.equal(result.consultedIds.length, 0);
  assert(result.entries.some((e) => e.id === "ps1-v2:unmatched-code"));
});
test("PS1 scanner keeps different title candidates apart and identity conflicts unassigned", () => {
  assert.equal(consult("Dino Crisis 2", ["SLES-02723"]).consultedIds.length, 0);
  const p = { ...perception("Dino Crisis 2", ["SLES-03225"]), identityConflict: true };
  assert.equal(ps1ScannerKnowledge(catalog, p, ["ps1-es-sles-03225"]).consultedIds.length, 0);
});
test("PS1 scanner retrieves a multidisc edition once using its fourth disc", () => {
  const result = consult("Legend of Dragoon", ["SCES-33047"]);
  assert.equal(result.consultedIds.length, 1);
  for (const code of ["SCES-03047", "SCES-13047", "SCES-23047", "SCES-33047"]) assert.match(result.entries.at(-1)!.text, new RegExp(code));
});
test("actual scanner loader uses V2 and does not apply unversioned legacy learning", async () => {
  const result = await loadScannerKnowledge("ps1", perception("F1 2000", ["SLES-02723"]));
  assert.equal(result.knowledge.exactGameMatches, 1);
  assert.equal(result.knowledge.platformGuidance, true);
  assert.equal(result.knowledge.learningAvailable, false);
  assert.deepEqual(result.examples, []);
  assert.deepEqual(result.knownVariantIds, []);
  assert(result.entries.some((e) => /mercado Europe/.test(e.text) && /Danés · Inglés · Español · Finés · Sueco/.test(e.text)));
  assert(result.sources.some((s) => s.url.includes("psxdatacenter.com")));
});
