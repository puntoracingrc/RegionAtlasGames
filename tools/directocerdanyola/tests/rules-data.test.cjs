const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../src/rules-data.js');

test('contains separate verified technical summaries for Nitro and ECO',()=>{
  assert.match(R.categories.NITRO.url,/Nitro.*2026\.pdf/);
  assert.match(R.categories.ECO.url,/el%C3%A9ctrico.*2026\.pdf/);
  assert.ok(R.categories.NITRO.specs.some(row=>row[0]==='Depósito'&&row[1].includes('150 ml')));
  assert.ok(R.categories.ECO.specs.some(row=>row[0]==='Batería'&&row[1].includes('17,4 V')));
});

test('keeps sporting decisions separate from automatic scoring',()=>{
  assert.match(R.championship.text,/dos mejores/i);
  assert.match(R.tieBreak.text,/mejor descarte/i);
  assert.match(R.incidents.technical.text,/criterio del director de carrera/i);
  assert.match(R.incidents.disqualification.text,/resultado corregido/i);
});
