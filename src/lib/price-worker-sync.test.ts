import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { workerSyncFiles } from "./price-worker-sync";

test("worker sync ships the PS2 documentary data before its new Python consumer", () => {
  const files = workerSyncFiles();
  const consumer = files.findIndex((f) => f.local === "scripts/collectors/ps2_documentary.py");
  assert(consumer >= 0);
  for (const name of ["ps2-source-knowledge.json.gz", "ps2-edition-evidence.json.gz"]) {
    const index = files.findIndex((f) => f.local === `data/${name}`);
    assert(index >= 0 && index < consumer);
    assert.equal(files[index].remote, `app/data/${name}`);
    assert(!files[index].optional);
    const payload = JSON.parse(gunzipSync(readFileSync(files[index].local)).toString("utf8"));
    assert(Object.keys(payload).length > 0);
  }
});

test("worker sync includes every active research document before the Python reader", () => {
  const files = workerSyncFiles();
  const consumer = files.findIndex((f) => f.local === "scripts/collectors/region_research.py");
  assert(consumer >= 0);
  for (const name of ["gameboy", "gameboy-reviewed-guidance", "snes", "snes-distributions", "megadrive", "nes", "ps2", "ps1", "dreamcast", "ds", "3ds", "xbox360"]) {
    const index = files.findIndex((f) => f.local === `data/region-research/${name}.json`);
    assert(index >= 0 && index < consumer, name);
    assert.equal(files[index].remote, `app/data/region-research/${name}.json`);
    assert(!files[index].optional);
    assert.equal(JSON.parse(readFileSync(files[index].local, "utf8")).schemaVersion, 1);
  }
});
