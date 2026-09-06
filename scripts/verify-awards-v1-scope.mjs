import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const base = process.argv[2] ?? 'aa65457c7acc54e33745b1615c96a5997ceb0387';
const git = (...args) => execFileSync('git',args,{maxBuffer:256*1024*1024});
const before = path => git('show',`${base}:${path}`);
const read = path => JSON.parse(readFileSync(path,'utf8'));
const protectedPaths = ['data/catalog.json','data/game-details.json','data/meta.json','data/index/companies.json','data/research/person-study','data/research/company-study','data/users','data/marketplace','src/lib/collection-store.ts','src/lib/catalog-url.ts','public'];
const protectedFiles = git('ls-tree','-r','--name-only',base,'--',...protectedPaths).toString().trim().split('\n').filter(Boolean);
const changed = git('diff','--name-only',base,'--',...protectedPaths).toString().trim();
assert.equal(changed,'',`Out-of-scope data changes: ${changed}`);
const catalog = read('data/catalog.json');
const catalogIds = new Set(catalog.map(g => g.id));
assert.equal(catalogIds.size,catalog.length);
const identityPath = 'data/index/catalog-work-identities.json';
const oldKeys = JSON.parse(before(identityPath)).catalogIdToWorkKey;
const newKeys = read(identityPath).catalogIdToWorkKey;
for (const [id,key] of Object.entries(oldKeys)) assert.equal(newKeys[id],key,`Changed prior work identity: ${id}`);
const decisions = read('data/research/award-study/identity-decisions.json').records;
const approvedIds = new Set(decisions.map(d => d.catalogId));
const added = Object.keys(newKeys).filter(id => !(id in oldKeys));
for (const id of added) { assert.ok(catalogIds.has(id)); assert.ok(approvedIds.has(id)); }
const a = read('data/research/award-study/public.json');
const r = read('data/research/award-study/research.json');
const count = (rows,key) => rows.reduce((acc,row) => ({...acc,[row[key]]:(acc[row[key]]??0)+1}),{});
const companies = Object.keys(read('data/index/companies.json')).length;
console.log(JSON.stringify({base,protectedFiles:protectedFiles.length,catalogEntries:catalog.length,uniqueIds:catalogIds.size,catalogSha256:createHash('sha256').update(readFileSync('data/catalog.json')).digest('hex'),companies,priorWorkIdentities:Object.keys(oldKeys).length,addedVerifiedIdentityLinks:added.length,changedPriorIdentities:0,series:a.series.length,editions:a.editions.length,categories:a.categories.length,results:count(a.results,'resultType'),personalAwards:a.results.filter(r=>r.recipients.some(p=>p.type==='person')).length,workLinks:a.workLinks.length,personWorkLinks:a.personWorkLinks.length,companyWorkLinks:a.companyWorkLinks.length,legacy:count(r.legacyLinks,'classification'),pendingCatalogIdentities:read('data/research/award-study/backfill-review.json').records.length},null,2));
