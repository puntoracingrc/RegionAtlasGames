import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const overlayPaths = [
  "data/research/person-study/public.json",
  "data/research/platform-history/people-public.json",
  "data/research/platform-history/people-ps2-public.json",
  "data/research/platform-history/people-ps3-public.json",
  "data/research/platform-history/people-ps5-public.json",
  "data/research/platform-history/people-psp-public.json",
  "data/research/platform-history/people-psvita-public.json",
  "data/research/platform-history/people-xbox-public.json",
  "data/research/platform-history/people-xbox360-public.json",
  "data/research/platform-history/people-xboxone-public.json",
  "data/research/platform-history/people-xboxseries-public.json",
  "data/research/platform-history/people-sega-public.json",
  "data/research/platform-history/people-nintendo-public.json",
  "data/research/platform-history/people-snk-public.json",
];
const portraitOverlayPath =
  "data/research/platform-history/people-portraits-public.json";
const expectedSlugs = [
  "doug-bowser",
  "eiji-aonuma",
  "hirokazu-yasuhara",
  "koji-kondo",
  "masahiro-sakurai",
  "naoto-ohshima",
  "reggie-fils-aime",
  "takashi-tezuka",
  "tetsuya-mizuguchi",
  "tom-kalinske",
  "toshihiro-nagoshi",
  "yuji-naka",
  "yukio-futatsugi",
].sort();

const profiles = new Map();
for (const relativePath of overlayPaths) {
  const overlay = readJson(relativePath);
  for (const profile of overlay.profiles ?? []) {
    profiles.set(profile.slug, profile);
  }
  for (const patch of overlay.profilePatches ?? []) {
    profiles.set(patch.slug, { ...profiles.get(patch.slug), ...patch });
  }
}

const portraitOverlay = readJson(portraitOverlayPath);
const patches = portraitOverlay.profilePatches ?? [];
const sources = portraitOverlay.sources ?? [];
const mediaRecords = readJson("data/research/person-study/media.json").records;
const coreRecords = readJson("data/research/person-study/core.json").records;
const portraitHashes = readJson("data/research/person-study/manifest.json").portraitHashes;
const mediaSlugAliases = new Map([["naoto-ohshima", "naoto-oshima"]]);
const mediaBySlug = new Map(mediaRecords.map((record) => [record.person_slug, record]));
const coreBySlug = new Map(coreRecords.map((record) => [record.slug, record]));
const sourceById = new Map(sources.map((source) => [source.id, source]));
const normalizeName = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "");

assert.deepEqual(
  patches.map((patch) => patch.slug).sort(),
  expectedSlugs,
  "El lote publicable debe ser el conjunto explícito de 12 retratos verificados",
);
assert.equal(sourceById.size, sources.length, "Los sourceId deben ser únicos");

for (const patch of patches) {
  const existing = profiles.get(patch.slug);
  const portrait = patch.portrait;
  const mediaSlug = mediaSlugAliases.get(patch.slug) ?? patch.slug;
  const media = mediaBySlug.get(mediaSlug);
  const core = coreBySlug.get(mediaSlug);
  const source = sourceById.get(portrait?.sourceId);

  assert.ok(existing, `${patch.slug}: el perfil público debe existir`);
  assert.equal(
    existing.portrait,
    null,
    `${patch.slug}: el overlay no puede sustituir un retrato ya publicado`,
  );
  assert.ok(portrait, `${patch.slug}: falta portrait`);
  assert.ok(media, `${patch.slug}: falta el registro de medios retenido`);
  assert.ok(core, `${patch.slug}: falta la identidad canónica retenida`);
  assert.ok(media.person_qid, `${patch.slug}: el medio debe estar unido a un QID humano`);
  assert.equal(media.person_qid, core.qid, `${patch.slug}: QID del medio incoherente`);
  assert.ok(
    [core.name, ...(core.aliases ?? [])]
      .map(normalizeName)
      .includes(normalizeName(existing.name)),
    `${patch.slug}: el nombre público no coincide con el nombre o alias canónico`,
  );
  assert.equal(portrait.path, media.local_path, `${patch.slug}: asset distinto al auditado`);
  assert.equal(
    portrait.sourceUrl,
    media.source_url,
    `${patch.slug}: fuente distinta a la auditada`,
  );
  assert.equal(portrait.license, media.license, `${patch.slug}: licencia distinta a la auditada`);
  assert.equal(
    portrait.licenseUrl,
    media.license_url,
    `${patch.slug}: URL de licencia distinta a la auditada`,
  );
  assert.equal(portrait.artist, media.artist, `${patch.slug}: autor distinto al auditado`);
  assert.equal(portrait.attributionRequired, true, `${patch.slug}: falta atribución obligatoria`);
  assert.match(
    portrait.sourceUrl,
    /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
    `${patch.slug}: la fuente debe ser la ficha estable de Commons`,
  );
  assert.match(
    portrait.license,
    /^CC BY(?:-SA)? /,
    `${patch.slug}: licencia no incluida en el conjunto publicable`,
  );
  assert.match(
    portrait.licenseUrl,
    /^https:\/\/creativecommons\.org\/licenses\/by(?:-sa)?\//,
    `${patch.slug}: enlace de licencia incompatible`,
  );
  assert.ok(portrait.artist, `${patch.slug}: falta autor`);
  assert.ok(portrait.credit, `${patch.slug}: falta crédito legible`);

  assert.ok(source, `${patch.slug}: falta fuente pública para la atribución`);
  assert.equal(source.url, portrait.sourceUrl, `${patch.slug}: fuente pública incoherente`);
  assert.equal(source.kind, "MEDIA_REPOSITORY", `${patch.slug}: tipo de fuente inesperado`);
  assert.equal(source.reliability, "HIGH", `${patch.slug}: fiabilidad inesperada`);

  const asset = readFileSync(path.join(root, "public", portrait.path));
  assert.ok(asset.length > 0, `${patch.slug}: asset vacío`);
  assert.equal(asset.subarray(0, 4).toString("ascii"), "RIFF", `${patch.slug}: no es RIFF`);
  assert.equal(asset.subarray(8, 12).toString("ascii"), "WEBP", `${patch.slug}: no es WebP`);
  assert.equal(
    createHash("sha256").update(asset).digest("hex"),
    portraitHashes[mediaSlug],
    `${patch.slug}: el asset no coincide con el hash histórico retenido`,
  );
}

const portraitComponent = readFileSync(
  path.join(root, "src/components/person-portrait.tsx"),
  "utf8",
);
assert.ok(portraitComponent.includes('from "next/image"'), "El retrato debe usar next/image");
assert.ok(
  portraitComponent.includes('alt={`Retrato de ${name}`}'),
  "El alt debe identificar a la persona",
);
assert.ok(
  portraitComponent.includes('aria-label="Sin retrato"'),
  "El fallback debe tener etiqueta accesible",
);
assert.ok(portraitComponent.includes("sizes={sizes}"), "next/image debe recibir sizes");

const profileDetail = readFileSync(
  path.join(root, "src/components/person-profile-detail.tsx"),
  "utf8",
);
for (const field of ["artist", "sourceUrl", "license", "licenseUrl"]) {
  assert.ok(
    profileDetail.includes(`profile.portrait.${field}`),
    `La ficha debe mostrar ${field} en la atribución`,
  );
}

console.log(
  `Retratos públicos verificados: ${patches.length}; assets, identidad editorial, fuente, licencia, atribución, alt, fallback y sizes correctos.`,
);
