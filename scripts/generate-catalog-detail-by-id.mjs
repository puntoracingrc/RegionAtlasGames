import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detailsFile = path.join(rootDir, "data", "game-details.json");
const platformChunksDir = path.join(rootDir, "public", "catalog-details");
const outputDir = path.join(rootDir, "public", "catalog-details", "by-id");

function isGameDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if ("error" in value) return false;
  return true;
}

function detailFileName(catalogId) {
  return `${encodeURIComponent(catalogId)}.json`;
}

function readDetails() {
  return JSON.parse(readFileSync(detailsFile, "utf8"));
}

function mergePublicDetailFields(base, publicDetails) {
  if (!isGameDetails(publicDetails)) return base;

  const preferReviewedDescription =
    base.description !== undefined && base.fieldSources?.description === "research";
  const preferReviewedSeo = base.seoMeta !== undefined && base.fieldSources?.seoMeta === "research";

  return {
    ...base,
    ...(!preferReviewedDescription && publicDetails.description !== undefined
      ? { description: publicDetails.description }
      : {}),
    ...(!preferReviewedDescription && publicDetails.descriptionMeta !== undefined
      ? { descriptionMeta: publicDetails.descriptionMeta }
      : {}),
    ...(!preferReviewedSeo && publicDetails.seoMeta !== undefined
      ? { seoMeta: publicDetails.seoMeta }
      : {}),
    ...(publicDetails.videos !== undefined ? { videos: publicDetails.videos } : {}),
    ...("pegi" in publicDetails ? { pegi: publicDetails.pegi } : {}),
  };
}

function readPlatformChunkDetails() {
  if (!existsSync(platformChunksDir)) return { details: {}, merged: 0 };

  const details = {};
  let merged = 0;
  for (const entry of readdirSync(platformChunksDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    const chunk = JSON.parse(readFileSync(path.join(platformChunksDir, entry.name), "utf8"));
    for (const [catalogId, publicDetails] of Object.entries(chunk)) {
      if (!isGameDetails(publicDetails)) continue;
      details[catalogId] = publicDetails;
      merged += 1;
    }
  }

  return { details, merged };
}

function cleanOutputDir() {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    return 0;
  }

  let removed = 0;
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    rmSync(path.join(outputDir, entry.name));
    removed += 1;
  }
  return removed;
}

const rawDetails = readDetails();
const publicChunkDetails = readPlatformChunkDetails();
const removed = cleanOutputDir();
let written = 0;
let skipped = 0;
const writtenIds = new Set();

for (const [catalogId, details] of Object.entries(rawDetails)) {
  if (!isGameDetails(details)) {
    skipped += 1;
    continue;
  }

  const mergedDetails = mergePublicDetailFields(details, publicChunkDetails.details[catalogId]);
  writeFileSync(
    path.join(outputDir, detailFileName(catalogId)),
    `${JSON.stringify(mergedDetails)}\n`,
    "utf8",
  );
  writtenIds.add(catalogId);
  written += 1;
}

for (const [catalogId, details] of Object.entries(publicChunkDetails.details)) {
  if (writtenIds.has(catalogId)) continue;
  writeFileSync(
    path.join(outputDir, detailFileName(catalogId)),
    `${JSON.stringify(details)}\n`,
    "utf8",
  );
  writtenIds.add(catalogId);
  written += 1;
}

console.log(
  JSON.stringify(
    {
      source: path.relative(rootDir, detailsFile),
      publicChunks: path.relative(rootDir, platformChunksDir),
      output: path.relative(rootDir, outputDir),
      removed,
      publicChunkEntries: publicChunkDetails.merged,
      written,
      skipped,
    },
    null,
    2,
  ),
);
