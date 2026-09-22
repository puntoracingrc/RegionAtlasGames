const test=require('node:test');
const assert=require('node:assert/strict');
const registrations=require('../registrations/aecar-cerdanyola-provisional.json');
const L=require('../src/live-core.js');
const nitro=require('../../carreracerdanyola/src/seed-nitro.json');
const eco=require('../../carreracerdanyola/src/seed-eco.json');

test('AECAR snapshot keeps the current Nitro and ECO lists separate',()=>{
  assert.deepEqual(registrations.categories.NITRO.counts,{total:16,confirmed:4,unconfirmed:12});
  assert.deepEqual(registrations.categories.ECO.counts,{total:12,confirmed:4,unconfirmed:8});
  assert.equal(registrations.status,'open');
  assert.ok(registrations.categories.NITRO.entrants.every(entry=>entry.assumedParticipant));
  assert.ok(registrations.categories.ECO.entrants.every(entry=>entry.assumedParticipant));
});

test('snapshot does not retain contact, payment or equipment data',()=>{
  const serialized=JSON.stringify(registrations).toLowerCase();
  for(const forbidden of ['email','phone','telefono','teléfono','payment','pago','bizum','chassis','motor','battery','fuel']){
    assert.equal(serialized.includes(`"${forbidden}"`),false,forbidden);
  }
});

test('provisional roster activates every visible entrant and preserves the championship history',()=>{
  for(const [category,base] of [['NITRO',nitro],['ECO',eco]]){
    const source=registrations.categories[category];
    const seed=L.provisionalSeed(base,{...source,capturedAt:registrations.capturedAt});
    assert.equal(seed.pilots.filter(p=>p.originalToday).length,source.counts.total);
    assert.equal(seed.pilots.filter(p=>p.originalToday&&p.provisionalEntry).length,source.counts.total);
    for(const original of base.pilots){
      const updated=seed.pilots.find(p=>p.id===original.id);
      assert.deepEqual(updated.history,original.history,original.name);
      assert.equal(updated.baselineTotal,original.baselineTotal,original.name);
    }
  }
});

test('similar family names remain separate registration identities',()=>{
  const seed=L.provisionalSeed(nitro,registrations.categories.NITRO);
  const active=seed.pilots.filter(p=>p.originalToday).map(p=>L.normalize(p.name));
  assert.ok(active.includes('ALEJANDRO DARAS ANTON'));
  assert.ok(active.includes('RAUL DARAS ANTON'));
  assert.ok(active.includes('JORDI CANADELL GARCIA 40'));
  assert.ok(active.includes('MARC GARCIA CANADELL'));
});

test('licence status is informative and does not exclude a visible entrant from provisional scoring',()=>{
  const nitroSeed=L.provisionalSeed(nitro,registrations.categories.NITRO);
  const ecoSeed=L.provisionalSeed(eco,registrations.categories.ECO);
  const carlos=nitroSeed.pilots.find(p=>L.normalize(p.name).includes('CARLOS SIMAO'));
  const thiago=ecoSeed.pilots.find(p=>L.normalize(p.name).includes('THIAGO PENA'));
  assert.equal(carlos.originalToday,true);assert.equal(carlos.eligible,'yes');
  assert.equal(thiago.originalToday,true);assert.equal(thiago.eligible,'yes');
});
