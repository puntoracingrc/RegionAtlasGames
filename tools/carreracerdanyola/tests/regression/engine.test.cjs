'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../src/engine.js'),seed=require('./seed.json');
const pilot=(s,id)=>s.pilots.find(p=>p.id===id);
const row=(r,id)=>r.rows.find(p=>p.pilot.id===id);
function scenario(fixed={}){
 const s=E.createState(seed),used=new Set(Object.values(fixed));
 for(const p of s.pilots){p.eligible='yes';if(p.active&&fixed[p.id]!=null)p.position=String(fixed[p.id]);}
 const free=Array.from({length:s.pilots.filter(p=>p.active).length},(_,i)=>i+1).filter(p=>!used.has(p));
 for(const p of s.pilots)if(p.active&&p.position==='')p.position=String(free.shift());
 return s;
}
const top=s=>E.calculate(seed,s).rows.slice(0,3).map(r=>r.pilot.id);
test('Base: 27 históricos + 12 altas; 32 en Lleida; Pol no se duplica',()=>{
 assert.equal(seed.pilots.length,39);assert.equal(seed.pilots.filter(p=>p.originalToday).length,32);
 assert.equal(seed.pilots.filter(p=>p.baselineRank).length,27);assert.equal(seed.pilots.filter(p=>p.id==='pol').length,1);
 assert.equal(seed.pilots.find(p=>p.id==='pol').entryRank,17);assert.equal(seed.pilots.find(p=>p.id==='oriol').originalToday,false);
});
test('Escala literal 1–90 y regla para el 91 y posteriores',()=>{
 assert.equal(seed.points.length,90);assert.deepEqual([1,2,3,10,17,32,90,91,120].map(n=>E.pointsFor(n,seed.points)),[640,613,587,433,318,161,2,1,1]);
 assert.throws(()=>E.pointsFor(0,seed.points));assert.throws(()=>E.pointsFor(1.5,seed.points));
});
test('Las 27 filas reproducen EXACTAMENTE la captura antes de Lleida',()=>{
 const s=E.createState(seed);s.pilots.forEach(p=>p.active=false);const c=E.calculate(seed,s);
 for(const p of seed.pilots.filter(p=>p.baselineRank)){assert.equal(row(c,p.id).exact.total,p.baselineTotal,p.name);assert.equal(row(c,p.id).rankMin,p.baselineRank,p.name);}
});
test('Bonificación independiente: 0/1/2/3/4 participaciones',()=>assert.deepEqual([0,1,2,3,4].map(E.bonusFor),[0,0,50,100,150]));
test('Oriol ausente conserva 2020; participante conserva 3 victorias y termina 2070',()=>{
 const s=E.createState(seed);assert.equal(row(E.calculate(seed,s),'oriol').min,2020);
 pilot(s,'oriol').active=true;pilot(s,'oriol').position='32';const r=row(E.calculate(seed,s),'oriol');assert.equal(r.min,2070);assert.equal(r.max,2070);
});
test('Máximos calculados, no doble bonificación',()=>{
 const c=E.calculate(seed,E.createState(seed));assert.deepEqual(['jordi','hector','joseba','alfonso','manuel-perez','aleix'].map(id=>row(c,id).max),[1964,1965,2016,1890,1820,1795]);
 assert.equal(c.podium[0].certain[0].pilot.id,'oriol');
});
test('Ejemplo parcial Alonso 4, Joseba 5: no inventa el puesto de Héctor',()=>{
 const s=E.createState(seed);pilot(s,'jordi').position='4';pilot(s,'joseba').position='5';const c=E.calculate(seed,s);
 assert.equal(c.complete,false);assert.equal(c.missing.length,30);assert.equal(row(c,'jordi').min,1911);assert.equal(row(c,'joseba').min,1914);
 assert.equal(row(c,'joseba').rankMin,2);assert.equal(row(c,'joseba').rankMax,3);assert.equal(c.podium[1].certain.length,0);
});
test('Héctor 2 y Joseba 4: 1938 empatados, gana Héctor por descarte',()=>{
 const c=E.calculate(seed,scenario({jordi:3,hector:2,joseba:4,alfonso:1}));
 assert.equal(row(c,'hector').exact.total,1938);assert.equal(row(c,'joseba').exact.total,1938);assert.equal(row(c,'hector').rankMin,2);assert.equal(row(c,'joseba').rankMin,3);
 assert.match(row(c,'hector').tieReason,/descarte/);
});
test('Jordi gana, Joseba segundo: Joseba subcampeón',()=>assert.deepEqual(top(scenario({jordi:1,joseba:2,hector:3,alfonso:4})),['oriol','joseba','jordi']));
test('Jordi puede acabar 4º de España aunque sea 2º hoy',()=>{
 const c=E.calculate(seed,scenario({hector:1,jordi:2,joseba:3,alfonso:4}));assert.equal(row(c,'jordi').rankMin,4);assert.deepEqual(c.rows.slice(0,3).map(r=>r.pilot.id),['oriol','hector','joseba']);
});
test('Alfonso gana, Héctor 4 y Joseba 7: bronce para Alfonso',()=>assert.deepEqual(top(scenario({alfonso:1,jordi:2,hector:4,joseba:7})),['oriol','jordi','alfonso']));
test('Alfonso 2, Héctor 17 y Joseba 8: decide Lleida a favor de Alfonso',()=>{
 const c=E.calculate(seed,scenario({jordi:1,alfonso:2,hector:17,joseba:8}));assert.equal(row(c,'alfonso').min,1863);assert.equal(row(c,'hector').min,1863);assert.equal(row(c,'alfonso').rankMin,3);assert.match(row(c,'alfonso').tieReason,/última carrera común: C4/);
});
test('Con Héctor 16 no gana Alfonso el desempate; con Héctor 18 sí',()=>{
 assert.deepEqual(top(scenario({jordi:1,alfonso:2,hector:16,joseba:8})),['oriol','jordi','hector']);
 assert.deepEqual(top(scenario({jordi:1,alfonso:2,hector:18,joseba:8})),['oriol','jordi','alfonso']);
});
test('Joseba 6 salva el bronce por UN punto aunque Alfonso gane',()=>{
 const c=E.calculate(seed,scenario({alfonso:1,jordi:2,hector:4,joseba:6}));assert.equal(row(c,'joseba').rankMin,3);assert.equal(row(c,'joseba').min-row(c,'alfonso').min,1);
});
test('Duplicados bloquean el cálculo, sin mostrar clasificación vieja',()=>{
 const s=E.createState(seed);pilot(s,'jordi').position='4';pilot(s,'joseba').position='4';const c=E.calculate(seed,s);assert.equal(c.valid,false);assert.equal(c.rows.length,0);assert.match(c.errors[0].message,/repetido/);
});
test('Cero, negativos, decimales, exponentes y puestos fuera de lista son inválidos',()=>{
 for(const value of ['0','-1','1.5','1e1','33','abc']){const s=E.createState(seed);pilot(s,'jordi').position=value;assert.equal(E.calculate(seed,s).valid,false,value);}
});
test('Casilla vacía no es ausencia y no permite cerrar',()=>{
 const s=E.createState(seed);const c=E.calculate(seed,s);assert.equal(c.finalReady,false);assert.equal(row(c,'jordi').min,1911);pilot(s,'jordi').active=false;assert.equal(row(E.calculate(seed,s),'jordi').min,1861);
});
test('No clasificación con participación indicada: cero puntos pero bonus revisable',()=>{
 const s=E.createState(seed),p=pilot(s,'jordi');p.noClassification=true;let r=row(E.calculate(seed,s),'jordi');assert.equal(r.min,1911);p.qualifying=false;r=row(E.calculate(seed,s),'jordi');assert.equal(r.min,1861);
});
test('Un abandono se calcula por su puesto; sin clasificatoria no otorga puntos hoy',()=>{
 const s=E.createState(seed),p=pilot(s,'hector');p.position='5';assert.equal(row(E.calculate(seed,s),'hector').min,1863);p.qualifying=false;assert.equal(row(E.calculate(seed,s),'hector').min,1813);
});
test('Alta de la lista gana: 640 puntos, ninguna bonificación previa',()=>{
 const s=scenario({kenneth:1});const c=E.calculate(seed,s);assert.equal(row(c,'kenneth').min,640);assert.equal(row(c,'kenneth').exact.bonus,0);
});
test('Fuera de puntuación ocupa puesto y NO promociona automáticamente a otros',()=>{
 const s=scenario({rui:1,jordi:2});pilot(s,'rui').eligible='no';const c=E.calculate(seed,s);assert.equal(row(c,'rui').min,0);assert.equal(row(c,'jordi').exact.todayPoints,613);assert.equal(row(c,'jordi').min,1937);
});
test('Las tres licencias Día quedan pendientes por separado',()=>{
 const c=E.calculate(seed,E.createState(seed));assert.deepEqual(new Set(c.eligibilityPending),new Set(['didac','jonatan','rui']));
 const s=scenario({rui:1});pilot(s,'rui').eligible='unknown';const c2=E.calculate(seed,s);assert.equal(c2.finalReady,false);assert.equal(row(c2,'rui').min,0);assert.equal(row(c2,'rui').max,640);
});
test('Pegado rápido, acentos, apellidos ambiguos, intercambio y nombres repetidos',()=>{
 const s=E.createState(seed);let p=E.parseQuick('Alonso va 4, Joseba 5; Héctor 2\nAlfonso 1',s.pilots);assert.equal(p.errors.length,0);assert.deepEqual(p.changes.map(x=>x.id),['jordi','joseba','hector','alfonso']);
 assert.equal(E.parseQuick('David 2',s.pilots).errors.length,1);assert.equal(E.parseQuick('Alonso 2; Jordi 3',s.pilots).errors.length,1);
 assert.equal(E.parseQuick('No Existe 2',s.pilots).errors.length,1);
});
test('Importación conserva historia, no confía en bandera final y rechaza manipulaciones',()=>{
 const s=scenario({jordi:1});s.mode='final';s.reviewed=true;const restored=E.importState(s,seed);assert.equal(restored.mode,'live');assert.equal(restored.reviewed,false);assert.equal(pilot(restored,'jordi').position,'1');
 const bad=E.clone(s);pilot(bad,'jordi').history=[1,1,1];assert.throws(()=>E.importState(bad,seed));
 const duplicate=E.clone(s);duplicate.pilots[1].id=duplicate.pilots[0].id;assert.throws(()=>E.importState(duplicate,seed));
 const missing=E.clone(s);missing.pilots.pop();assert.throws(()=>E.importState(missing,seed));
});
test('Empate múltiple circular: no usa sort inestable ni nombre como desempate',()=>{
 const source=E.createState(seed).pilots[0];
 const results=[[4,5,null],[null,4,5],[5,null,4]].map((history,i)=>E.resultFor({...source,id:'test-'+i,name:'test-'+i,history,active:false},null,'yes',seed.points));
 const ranked=E.rankComplete(results);assert.ok(ranked.every(r=>r.rank===1&&r.tieReview));
});
test('Desglose: suma C1-C4 − descarte + bonus = total para todos',()=>{
 const c=E.calculate(seed,scenario({joseba:1}));for(const r of c.rows){const s=r.exact;assert.equal(s.races.reduce((sum,r)=>sum+r.points,0)-s.discard.points+s.bonus,s.total);}
});
test('Cotas conservadoras incluyen 400 clasificaciones completas aleatorias compatibles',()=>{
 let rng=91217;function random(){rng=(Math.imul(1664525,rng)+1013904223)>>>0;return rng/4294967296;}
 const initial=E.createState(seed);pilot(initial,'jordi').position='4';pilot(initial,'joseba').position='5';
 const bounds=E.calculate(seed,initial);
 for(let trial=0;trial<400;trial++){
   const s=E.clone(initial),places=bounds.available.slice();
   for(let i=places.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[places[i],places[j]]=[places[j],places[i]];}
   for(const p of s.pilots)if(p.active){if(p.position==='')p.position=String(places.pop());if(p.eligible==='unknown')p.eligible=random()<.5?'yes':'no';}
   const c=E.calculate(seed,s);assert.equal(c.complete,true);
   for(const r of c.rows){const b=row(bounds,r.pilot.id);assert.ok(r.rankMin>=b.rankMin&&r.rankMax<=b.rankMax,`${r.pilot.id}: ${r.rankMin}, bounds ${b.rankMin}-${b.rankMax}`);assert.ok(r.min>=b.min&&r.max<=b.max);}
 }
});
