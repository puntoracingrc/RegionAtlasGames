import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { put } from "@vercel/blob";

// This is an offline, explicit publishing command. It is never run by a build.
const [credentialFile, evidenceDirectory, limitArg] = process.argv.slice(2);
if (!credentialFile || !evidenceDirectory) throw new Error("Usage: node scripts/ps2-regional/publish_covers.mjs <credential-file> <evidence-directory> [limit]");
const credentials = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
const token = credentials.COVERS_READ_WRITE_TOKEN;
const storeId = "rcu58iNCyX2S3RIb";
const hostname = `${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
if (token?.split("_")[3] !== storeId) throw new Error("Only the dedicated public covers store is allowed");
const manifest = JSON.parse(zlib.gunzipSync(fs.readFileSync("artifacts/ps2-region-migration/assets.json.gz")));
const assets = limitArg ? manifest.slice(0, Number(limitArg)) : manifest;
if (!assets.length) throw new Error("Empty asset selection");
const journalPath = path.join(evidenceDirectory, "blob-upload-journal.jsonl");
const previous = fs.existsSync(journalPath) ? fs.readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const verified = new Map(previous.filter(row => row.status === "verified" && row.hostname === hostname).map(row => [row.pathname, row]));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let next = 0;
let completed = 0;
let uploaded = 0;
let resumed = 0;
const errors = [];

async function verifyPublic(asset, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Public read failed: HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.startsWith("image/jpeg")) throw new Error("Wrong public content type");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256) throw new Error("Public image differs from the archived original");
  return response.headers.get("etag");
}

async function publish(asset) {
  if (!asset.url.startsWith("/catalog-covers/ps2/galeria/") || asset.url.includes("..")) throw new Error("Unexpected PS2 image path");
  const pathname = asset.url.slice(1);
  const url = `https://${hostname}/${pathname}`;
  const before = verified.get(pathname);
  if (before?.sha256 === asset.sha256 && before.bytes === asset.bytes) { resumed++; return; }
  const publicFile = path.join("public", pathname);
  const archivedFile = path.join("artifacts/ps2-region-migration/original-covers", asset.url.slice("/catalog-covers/ps2/galeria/".length));
  const bytes = fs.readFileSync(fs.existsSync(publicFile) ? publicFile : archivedFile);
  if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256) throw new Error("Local original failed integrity verification");
  let etag;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt === 0) {
        const result = await put(pathname, bytes, { token, access: "public", addRandomSuffix: false,
          allowOverwrite: false, contentType: "image/jpeg", cacheControlMaxAge: 31536000 });
        if (result.url !== url) throw new Error("Unexpected upload destination");
      } else {
        // An interrupted response can mean the previous upload succeeded.
        // Read it before retrying, and never overwrite an existing object.
        const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30000) });
        if (response.status === 404) await put(pathname, bytes, { token, access: "public", addRandomSuffix: false,
          allowOverwrite: false, contentType: "image/jpeg", cacheControlMaxAge: 31536000 });
        else if (!response.ok) throw new Error(`Public existence check failed: HTTP ${response.status}`);
      }
      etag = await verifyPublic(asset, url);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await pause(1000 * 2 ** attempt);
    }
  }
  const record = { status: "verified", hostname, pathname, url, bytes: asset.bytes, sha256: asset.sha256,
    etag, verifiedAt: new Date().toISOString() };
  fs.appendFileSync(journalPath, `${JSON.stringify(record)}\n`);
  verified.set(pathname, record);
  uploaded++;
}

async function worker() {
  while (next < assets.length) {
    const asset = assets[next++];
    try { await publish(asset); }
    catch (error) { errors.push({ pathname: asset.url, error: String(error.message ?? error) }); }
    completed++;
    if (completed % 100 === 0 || completed === assets.length) console.log(JSON.stringify({ completed, total: assets.length, uploaded, resumed, errors: errors.length }));
  }
}

await Promise.all(Array.from({ length: 20 }, worker));
const result = { storeId: `store_${storeId}`, hostname, completed, uploaded, resumed, total: assets.length,
  allOriginals: manifest.length, bytes: assets.reduce((sum, row) => sum + row.bytes, 0), errors,
  finishedAt: new Date().toISOString() };
fs.writeFileSync(path.join(evidenceDirectory, "blob-upload-result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
