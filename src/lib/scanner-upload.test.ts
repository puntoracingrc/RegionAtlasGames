import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { readScannerUpload } from "./scanner-upload";
import { ScannerError } from "./scanner-engine";

function upload(photos: Blob[], platform = "gameboy", hint = "Pista no verificada", model?: string) {
  const body = new FormData(); body.set("platform", platform); body.set("hint", hint);
  if (model !== undefined) body.set("model", model);
  for (const photo of photos) body.append("photos", photo, "foto.jpg");
  return new Request("http://localhost/api/scanner", { method: "POST", body });
}
async function photo(color = "red") {
  return new Blob([new Uint8Array(await sharp({ create: { width: 300, height: 300, channels: 3, background: color } }).jpeg().toBuffer())], { type: "image/jpeg" });
}

test("valid photo is decoded and re-encoded without storing it", async () => {
  const result = await readScannerUpload(upload([await photo()]), ["gameboy"]);
  assert.equal(result.platformSlug, "gameboy");
  assert.equal(result.hint, "Pista no verificada");
  assert.equal(result.model, "gpt-4o-mini");
  assert.ok(result.photoUrls[0].startsWith("data:image/jpeg;base64,"));
});
test("model allowlist and admin access are enforced before image processing or quota", async () => {
  const image = await photo();
  await assert.rejects(readScannerUpload(upload([image], "gameboy", "", "arbitrary-model"), ["gameboy"], true), (e: unknown) => e instanceof ScannerError && e.code === "invalid_model");
  await assert.rejects(readScannerUpload(upload([image], "gameboy", "", "gpt-6-astra"), ["gameboy"]), (e: unknown) => e instanceof ScannerError && e.code === "model_forbidden");
  assert.equal((await readScannerUpload(upload([image], "gameboy", "", "gpt-6-astra"), ["gameboy"], true)).model, "gpt-6-astra");
});
test("accepts six different photos and rejects seven", async () => {
  const photos = await Promise.all(["red", "blue", "green", "white", "black", "yellow"].map(photo));
  assert.equal((await readScannerUpload(upload(photos), ["gameboy"])).photoUrls.length, 6);
  await assert.rejects(readScannerUpload(upload([...photos, photos[0]]), ["gameboy"]), (e: unknown) => e instanceof ScannerError && e.code === "invalid_photo_count");
});
test("no photo, invalid platform, excessive text and duplicate files are rejected", async () => {
  const image = await photo();
  for (const request of [upload([]), upload([image], "invalid"), upload([image], "gameboy", "x".repeat(1201)), upload([image, image])]) await assert.rejects(readScannerUpload(request, ["gameboy"]));
});
test("file extension and MIME alone cannot pass image validation", async () => {
  await assert.rejects(readScannerUpload(upload([new Blob(["<svg><script>bad</script></svg>"], { type: "image/jpeg" })]), ["gameboy"]));
});
test("payload size is enforced even without content-length", async () => {
  await assert.rejects(readScannerUpload(new Request("http://localhost/api/scanner", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=bad" }, body: new Uint8Array(3_800_001) }), ["gameboy"]), (e: unknown) => e instanceof ScannerError && e.status === 413);
});
