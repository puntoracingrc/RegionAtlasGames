/* eslint-disable @typescript-eslint/no-require-imports -- This harness executes the actual TS modules through a CommonJS transpiler. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const cp = require('node:child_process');
const ts = require('typescript');

// Execute the actual pure TS modules through the installed TypeScript compiler.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const root = path.resolve(__dirname, '..');
const read = (name) => JSON.parse(name.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(path.join(root, name))) : fs.readFileSync(path.join(root, name), 'utf8'));
// Later reviewed scans have an exact before/after hash ledger. Only the
// historical preservation checks use those inputs; every PS1 assertion below
// continues to exercise the current catalog and runtime.
const historicalRead = (name) => JSON.parse(cp.execFileSync('python3', [
  '-c',
  'import sys; sys.path.insert(0, "scripts"); from owned_scan_migration_compat import historical_bytes; sys.stdout.buffer.write(historical_bytes(sys.argv[1]))',
  name,
], { cwd: root, maxBuffer: 150_000_000 }));
const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'artifacts/ps1-region-migration/baseline-ps1.json.gz'))));
const catalog = read('data/catalog.json');
const details = read('data/game-details.json');
const profiles = read('data/ps1-edition-evidence.json.gz');
const games = catalog.filter((g) => g.platformSlug === 'ps1');
const byId = new Map(catalog.map((g) => [g.id, g]));
const { buildCatalogSeoSlug } = require('../src/lib/catalog-path.ts');
const { normalizePs1Serial, mergePs1MarketEvidence, resolvePs1Serial } = require('../src/lib/ps1-regional.ts');
const { mergeCatalogGameWithOverlay } = require('../src/lib/catalog-overlay-merge.ts');
const { toCatalogCardGame } = require('../src/lib/catalog-card-game.ts');
const checks = [];
function check(name, fn) { fn(); checks.push(name); }

check('EVERY-PS1-ROW-AUDITED', () => {
  for (const old of baseline.catalog) {
    assert(byId.has(old.id), old.id);
    assert(profiles[old.id], old.id);
    assert(['resolved', 'review'].includes(byId.get(old.id).regionalStatus));
    if (profiles[old.id].status === 'review') assert(profiles[old.id].reviewReasons.length, old.id);
  }
});
check('URL-ALL-LEGACY-PRESERVED', () => {
  for (const old of baseline.catalog) {
    const game = byId.get(old.id);
    assert.equal(buildCatalogSeoSlug(game), buildCatalogSeoSlug(old), old.id);
    assert.equal(buildCatalogSeoSlug(toCatalogCardGame(game)), buildCatalogSeoSlug(old), 'Card ' + old.id);
  }
});
check('NO-DUPLICATE-IDS-OR-NEW-URLS', () => {
  assert.equal(byId.size, catalog.length);
  const oldUrls = new Set(baseline.catalog.map(buildCatalogSeoSlug));
  const newUrls = new Set();
  for (const game of games.filter((g) => g.seedSource === 'ps1-regional-v2')) {
    const url = buildCatalogSeoSlug(game);
    assert(!oldUrls.has(url), url);
    assert(!newUrls.has(url), url); newUrls.add(url);
  }
});
check('OTHER-PLATFORMS-UNCHANGED', () => {
  // PS2 has a later audited migration with its own full baseline-preservation
  // check in scripts/ps2-regional/verify.py. Keep the PS1 historical boundary.
  const before = JSON.parse(cp.execFileSync('git', ['show', `${baseline.commit}:data/catalog.json`], { cwd: root, maxBuffer: 150_000_000 }));
  const beforeDetails = JSON.parse(cp.execFileSync('git', ['show', `${baseline.commit}:data/game-details.json`], { cwd: root, maxBuffer: 150_000_000 }));
  const oldPs1 = new Set(baseline.catalog.map((g) => g.id));
  const historicalCatalog = historicalRead('data/catalog.json');
  const historicalDetails = historicalRead('data/game-details.json');
  assert.deepEqual(historicalCatalog.filter((g) => !['ps1', 'ps2'].includes(g.platformSlug)), before.filter((g) => !['ps1', 'ps2'].includes(g.platformSlug)));
  for (const [id, d] of Object.entries(beforeDetails)) if (!oldPs1.has(id) && !id.startsWith("ps2-")) assert.deepEqual(historicalDetails[id], d, id);
});
check('REGION-LANGUAGE-001-AND-UK-001', () => {
  const europe = { value: 'Europe', source: 'redump-org', sourceUrl: 'http://redump.org/', confidence: 'high', verifiedAt: '2026-09-10' };
  for (const value of ['Spain', 'United Kingdom', 'Italy']) {
    assert.equal(mergePs1MarketEvidence(europe, { ...europe, value, evidenceKind: 'language' }), europe);
  }
});
check('INDEX-CANONICAL-METADATA-AND-OTHER-PLATFORM-MEMBERSHIPS-PRESERVED', () => {
  const memberships = ['gameIds', 'asDeveloper', 'asPublisher', 'asDigitalPublisher', 'asPhysicalPublisherOrDistributor'];
  const derived = new Set([...memberships, 'gameCount', 'byPlatform']);
  for (const kind of ['companies', 'genres', 'series']) {
    const before = JSON.parse(cp.execFileSync('git', ['show', `${baseline.commit}:data/index/${kind}.json`], { cwd: root, maxBuffer: 80_000_000 }));
    const after = historicalRead(`data/index/${kind}.json`);
    for (const [slug, old] of Object.entries(before)) {
      assert(after[slug], slug);
      for (const [key, value] of Object.entries(old)) if (!derived.has(key)) assert.deepEqual(after[slug][key], value, `${kind}/${slug}/${key}`);
      for (const key of memberships) assert.deepEqual((after[slug][key] ?? []).filter((id) => !id.startsWith('ps1-') && !id.startsWith('ps2-')), (old[key] ?? []).filter((id) => !id.startsWith('ps1-') && !id.startsWith('ps2-')), `${kind}/${slug}/${key}`);
    }
  }
});
check('REGION-LANGUAGE-002-AND-IMPORT-001', () => {
  const spain = { value: 'Spain', source: 'redump-org', sourceUrl: 'http://redump.org/', confidence: 'high', verifiedAt: '2026-09-10' };
  assert.equal(mergePs1MarketEvidence(spain, { ...spain, value: 'Europe', source: 'psxdatacenter-detail', evidenceKind: 'language' }), spain);
  assert.equal(mergePs1MarketEvidence(spain, { ...spain, value: 'Europe', source: 'psxdatacenter-explicit-market', evidenceKind: 'explicit-market' }), spain);
});
function resolved(code) { return resolvePs1Serial(games, code).candidates; }
check('007-SPAIN-SERIAL-ALIAS', () => {
  const game = resolved('SLES-03137').find((g) => g.regionCode === 'ES');
  assert(game); assert(resolved('SLES-03137-T').some((g) => g.id === game.id));
});
check('WARZONE-EUROPE-MULTI3', () => {
  const game = resolved('SLES-00937').find((g) => g.regionCode === 'EU');
  assert(game); assert.deepEqual(game.languages, ['en', 'es', 'it']);
});
check('F1-2000-EUROPE-DETAILED-LANGUAGE-CORRECTION', () => {
  const game = resolved('SLES-02723').find((g) => g.regionCode === 'EU');
  assert(game); assert.deepEqual(game.languages, ['da', 'en', 'es', 'fi', 'sv']);
  assert(profiles[game.id].languages.discrepancy);
});
check('DINO-CRISIS-2-SPAIN-TEXT-AND-VOICE', () => {
  const game = resolved('SLES-03225').find((g) => g.regionCode === 'ES');
  assert(game); assert.deepEqual(game.languages, ['en', 'es']);
  assert.deepEqual(profiles[game.id].languages.text, ['es']);
  assert.deepEqual(profiles[game.id].languages.audio, ['en']);
});
check('MULTIDISC-001-DRAGOON-FOUR-DISCS-ONE-EDITION', () => {
  const codes = ['SCES-03047', 'SCES-13047', 'SCES-23047', 'SCES-33047'];
  const ids = codes.map((code) => resolved(code).filter((g) => g.regionCode === 'ES').map((g) => g.id));
  assert(ids[0].length); for (const list of ids) assert.deepEqual(list, ids[0]);
  for (const id of ids[0]) assert.deepEqual(profiles[id].components.map((d) => d.number), [1, 2, 3, 4]);
});
check('SERIAL-001-SUFFIXES-AND-AMBIGUITY-PRESERVED', () => {
  for (const code of ['SLES-03137-T', 'SLES-01404/COLL.', 'SLES-014042', 'SCES-03047-0']) assert.equal(normalizePs1Serial(code), code);
  const common = { canonicalSerials: ['SLES-00937'], regionalStatus: 'resolved' };
  const result = resolvePs1Serial([{ id: 'original', ...common }, { id: 'reissue', ...common }], 'SLES00937');
  assert.equal(result.candidates.length, 2); assert.equal(result.physicalVariantResolved, false);
});
check('WRONG-SOURCE-INTERNAL-SERIAL-IS-NOT-AN-ALIAS', () => {
  const italian = resolved('SCES-02030').find((g) => g.regionCode === 'IT');
  assert(italian); assert(!resolved('SCES-02028').some((g) => g.id === italian.id));
});
check('COVERS-MARKET-CODE-AND-SOURCE-PROVENANCE', () => {
  for (const game of games) {
    const p = profiles[game.id];
    if (p.fieldProvenance.cover) {
      const cover = p.graphics.find((a) => a.assetId === p.fieldProvenance.cover.assetId);
      assert(cover?.stored, game.id); assert.deepEqual(cover.marketHints, [game.regionCode], game.id);
      assert.equal(cover.url, game.coverUrl); assert.equal(cover.sha256, p.fieldProvenance.cover.sha256);
    }
    if (game.regionalStatus === 'resolved') {
      assert(game.regionCode && game.marketRegion && game.canonicalSerials.length, game.id);
      assert(p.fieldProvenance.market?.sourceUrl, game.id);
    }
  }
});
check('NEW-EDITION-DOES-NOT-INHERIT-PRICES-OR-EXACT-CREDITS', () => {
  for (const game of games.filter((g) => g.seedSource === 'ps1-regional-v2')) {
    assert.equal(game.recommendedPrice, null); assert.equal(game.pcId, null); assert.equal(game.hasEsPrice, false);
    assert(!details[game.id].individualCredits); assert(!details[game.id].companyCredits);
  }
});
check('REAL-RUNTIME-OVERLAY-CANNOT-RESTORE-OLD-REGION-OR-URL', () => {
  const game = resolved('SLES-02723').find((g) => g.regionCode === 'EU');
  const oldOverlay = { ...game, region: 'PAL España', languages: ['es'], marketRegion: 'Spain', canonicalSeoSlug: undefined, priceRegionVerified: true, coverUrl: '/covers/wrong.jpg' };
  const merged = mergeCatalogGameWithOverlay(game, oldOverlay);
  for (const field of ['region', 'marketRegion', 'languages', 'canonicalSeoSlug', 'priceRegionVerified', 'coverUrl']) assert.deepEqual(merged[field], game[field]);
});
check('FRANCE-WITH-SPANISH-AND-PACKAGING-CODE-IS-NOT-A-DISC-ALIAS', () => {
  const game = resolved('SLES-02458').find((g) => g.regionCode === 'FR');
  assert(game); assert(game.languages.includes('es'));
  assert.equal(profiles[game.id].serialScope, 'packaging');
  assert(profiles[game.id].components.every((c) => c.kind === 'back_cover'));
  assert(!resolved('SLES-02453').some((g) => g.id === game.id));
});
check('PRICING-OVERLAY-REQUIRES-EXACT-V2-EDITION-CONTRACT', () => {
  const game = resolved('SLES-02723').find((g) => g.regionCode === 'EU');
  const stale = { ...game, regionalStatus: undefined, marketRegion: 'Spain', recommendedPrice: 99, pcId: 123456, pcPath: 'wrong-edition', cexSellPrice: 75, priceRegionVerified: true };
  const guarded = mergeCatalogGameWithOverlay(game, stale);
  for (const field of ['recommendedPrice', 'pcId', 'pcPath', 'cexSellPrice']) assert.equal(guarded[field] ?? null, game[field] ?? null, field);
  const current = { ...game, recommendedPrice: 33, priceRegionVerified: true };
  assert.equal(mergeCatalogGameWithOverlay(game, current).recommendedPrice, 33);
});
check('UNRESOLVED-CODES-AND-COVERS-ARE-QUARANTINED', () => {
  for (const game of games.filter((g) => g.regionalStatus === 'review')) {
    assert.equal(details[game.id].reference, null, game.id);
    assert.equal(game.coverUrl, null, game.id);
    assert.equal(game.resolutionSerials.length, 0, game.id);
    assert.equal(game.recommendedPrice, null, game.id);
    assert.equal(game.estimatedPriceComplete ?? null, null, game.id);
    assert.equal(game.pcId, null, game.id);
  }
});
check('WORK-IDENTITY-DOES-NOT-MERGE-COMPILATIONS-OR-RENUMBERED-SEQUELS', () => {
  const audit = read('artifacts/ps1-region-migration/catalog-resolution.json');
  function workForCode(code) {
    const release = Object.values(audit.releases).find((r) => r.serials.includes(code) && !r.labels.length);
    assert(release, code); return audit.workForRelease[release.releaseId];
  }
  const ff = ['SLPM-86028', 'SLPM-86081', 'SLPM-86198'].map(workForCode);
  assert.equal(new Set(ff).size, 3, 'FF IV, V and VI must remain three works');
  assert.notEqual(workForCode('SLPS-00017'), workForCode('SLUS-00158'), "Japanese and US King's Field are different numbered games");
  assert.equal(workForCode('SLPS-00069'), workForCode('SLUS-00158'), "Japanese King's Field II is US King's Field");
});
check('NO-NEW-DUPLICATE-DOCUMENTED-EDITION', () => {
  const ids = games.filter((g) => g.regionalStatus === 'resolved').map((g) => profiles[g.id].releaseId);
  assert.equal(new Set(ids).size, ids.length);
});
const result = { status: 'passed', count: checks.length, checks };
fs.writeFileSync(path.join(root, 'artifacts/ps1-region-migration/integrity-tests.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
