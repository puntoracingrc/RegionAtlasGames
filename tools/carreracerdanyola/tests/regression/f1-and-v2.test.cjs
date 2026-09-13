const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../src/engine.js'),B=require('./broadcast.js');
const f1=require('./seed-f1.json'),gt=require('./seed.json');
const get=(c,id)=>c.rows.find(r=>r.pilot.id===id);
function partial(seed,positions){let s=E.createState(seed);for(const [id,pos] of Object.entries(positions))s=E.assignPosition(s,id,String(pos));return s;}
function calc(positions){const s=partial(f1,positions);return E.calculate(f1,s);}
function oracle(pilot,today,scale){
 const races=pilot.history.map((place,index)=>({place,points:place===null?0:scale[place-1],index}));
 races.push({place:today??null,points:today?scale[today-1]:0,index:3});
 const ordered=[...races].sort((a,b)=>b.points-a.points||(a.place??999)-(b.place??999)||a.index-b.index);
 const kept=ordered.slice(0,3),discard=ordered[3];
 const n=races.filter(r=>r.place!==null).length;
 return {id:pilot.id,total:kept.reduce((s,r)=>s+r.points,0)+[0,0,50,100,150][n],wins:kept.filter(r=>r.place===1).length,seconds:kept.filter(r=>r.place===2).length,thirds:kept.filter(r=>r.place===3).length,discard,races};
}
function comparator(a,b){for(const key of ['total','wins','seconds','thirds'])if(a[key]!==b[key])return b[key]-a[key];if(a.discard.points!==b.discard.points)return b.discard.points-a.discard.points;for(let r=3;r>=0;r--)if(a.races[r].place!==null&&b.races[r].place!==null)return a.races[r].place-b.races[r].place;return 0;}
function* permutations(items){if(!items.length){yield [];return;}for(let i=0;i<items.length;i++)for(const rest of permutations(items.filter((_,j)=>i!==j)))yield [items[i],...rest];}

test('F1 seed: 14 identities, 7 entries, twelve exact historical totals',()=>{
 assert.equal(f1.pilots.length,14);assert.equal(f1.pilots.filter(p=>p.originalToday).length,7);
 const s=E.createState(f1);for(const p of s.pilots){const r=E.resultFor({...p,active:false},null,'yes',f1.points);assert.equal(r.total,p.baselineTotal,p.id);}
 assert.deepEqual(s.pilots.filter(p=>p.originalToday).map(p=>p.id).sort(),['alejandro','dani','joan','juan-rodriguez','lorenzo','pere','wouters']);
});
test('Identity preservation: 9999, Joan/Carles and Juan/Raul remain distinct',()=>{
 const ids=f1.pilots.map(p=>p.id);for(const id of ['unknown-9999','joan','carles','juan-rodriguez','raul-rodriguez'])assert.ok(ids.includes(id));
 assert.equal(f1.pilots.find(p=>p.id==='unknown-9999').name,'9999 (Piloto no encontrado)');
});
test('F1: only Dani and Joan can win; Ricardo is absent at 1864',()=>{
 const c=calc({});assert.deepEqual(new Set(c.podium[0].candidates.map(r=>r.pilot.id)),new Set(['dani','joan']));assert.equal(get(c,'ricardo').min,1864);assert.equal(get(c,'ricardo').max,1864);
 assert.equal(get(c,'dani').rankMax,2);assert.equal(get(c,'pere').rankMin,4);
});
test('Three F1 positions determine all top four with four others still blank',()=>{
 const c=calc({dani:1,joan:3,lorenzo:2});assert.equal(c.missing.length,4);assert.equal(c.complete,false);
 assert.deepEqual(c.podium.map(p=>p.certain[0]?.pilot.id),['dani','joan','lorenzo','ricardo']);
});
test('Joan second is enough for the championship, even when Dani wins',()=>{
 const c=calc({joan:2,dani:1});assert.equal(c.podium[0].certain[0].pilot.id,'joan');assert.equal(get(c,'joan').min,1993);assert.equal(get(c,'dani').min,1990);
});
test('Joan third beats Dani second, but not Dani first',()=>{
 assert.equal(calc({joan:3,dani:2}).podium[0].certain[0].pilot.id,'joan');assert.equal(calc({joan:3,dani:1}).podium[0].certain[0].pilot.id,'dani');
});
test('Joan fourth: Dani must finish in first two',()=>{
 assert.equal(calc({joan:4,dani:2}).podium[0].certain[0].pilot.id,'dani');assert.equal(calc({joan:4,dani:3}).podium[0].certain[0].pilot.id,'joan');
});
test('Lorenzo win and Joan sixth: Dani / Lorenzo / Joan / Ricardo',()=>{
 const c=calc({lorenzo:1,joan:6});assert.deepEqual(c.podium.map(p=>p.certain[0]?.pilot.id),['dani','lorenzo','joan','ricardo']);
});
test('Lorenzo second and Joan seventh: Lorenzo runner-up',()=>{
 const c=calc({lorenzo:2,joan:7});assert.equal(c.podium[1].certain[0].pilot.id,'lorenzo');
});
test('Lorenzo third misses Ricardo by three points',()=>{
 const c=calc({lorenzo:3});assert.equal(get(c,'lorenzo').max,1861);assert.equal(c.podium[2].certain[0].pilot.id,'ricardo');
});
test('Pere wins with Lorenzo fifth: Pere fourth in championship',()=>{
 const c=calc({pere:1,lorenzo:5});assert.equal(c.podium[3].certain[0].pilot.id,'pere');assert.equal(get(c,'pere').max,1821);
});
test('Pere second with Lorenzo sixth: Pere fourth; with Lorenzo fifth: Lorenzo fourth',()=>{
 assert.equal(calc({pere:2,lorenzo:6}).podium[3].certain[0].pilot.id,'pere');assert.equal(calc({pere:2,lorenzo:5}).podium[3].certain[0].pilot.id,'lorenzo');
});
test('No invented fourth when Pere can still change it',()=>{
 const c=calc({dani:1,joan:3,lorenzo:6});assert.equal(c.podium[3].certain.length,0);assert.deepEqual(new Set(c.podium[3].candidates.map(r=>r.pilot.id)),new Set(['lorenzo','pere']));
});
test('Category imports cannot mix GT and F1; old GT v1 remains compatible',()=>{
 const g=E.createState(gt),f=E.createState(f1);assert.throws(()=>E.importState(g,f1));assert.throws(()=>E.importState(f,gt));delete g.categoryId;assert.equal(E.importState(g,gt).categoryId,'GT');
});
test('Assign rejects duplicated position atomically and keeps state intact',()=>{
 const s=partial(gt,{jordi:4});const snapshot=JSON.stringify(s);assert.throws(()=>E.assignPosition(s,'hector','4'),/repetido/);assert.equal(JSON.stringify(s),snapshot);
});
test('Up/down swaps adjacent occupants atomically',()=>{
 const s=partial(f1,{dani:1,joan:2});const next=E.stepPosition(s,'joan',-1);assert.equal(next.pilots.find(p=>p.id==='joan').position,'1');assert.equal(next.pilots.find(p=>p.id==='dani').position,'2');assert.equal(E.validate(next).errors.length,0);assert.equal(s.pilots.find(p=>p.id==='joan').position,'2');
});
test('Empty position remains pending and category-specific initial guide is invalidated by extra F1 entry',()=>{
 const s=partial(f1,{joan:2});const t=E.assignPosition(s,'joan','');assert.equal(t.pilots.find(p=>p.id==='joan').position,'');assert.ok(B.guide(f1,t).compatible);
 t.pilots.push({...t.pilots[0],id:'custom-test',name:'Nuevo',history:[null,null,null],originalToday:false});assert.equal(B.guide(f1,t).compatible,false);
});
test('Narration top four is immediate and never requires every place',()=>{
 const s=partial(f1,{dani:1,joan:3,lorenzo:2}),c=E.calculate(f1,s),n=B.narrate(f1,s,c);assert.ok(n.topFourCertain);assert.ok(n.paragraphs.join(' ').includes('No hace falta rellenar'));assert.equal(n.needed.length,0);
});
test('Narration requests only relevant missing drivers, not whole field',()=>{
 const s=partial(f1,{dani:1,joan:3,lorenzo:6}),n=B.narrate(f1,s,E.calculate(f1,s));assert.deepEqual(n.needed.map(p=>p.id),['pere']);assert.equal(n.topFourCertain,false);
});
test('Static F1 guide suppressed when Ricardo is activated, live engine recalculates',()=>{
 const s=E.createState(f1);s.pilots.find(p=>p.id==='ricardo').active=true;assert.equal(B.guide(f1,s).compatible,false);assert.ok(E.calculate(f1,s).podium[0].candidates.some(r=>r.pilot.id==='ricardo'));
});
test('GT four entered aspirants resolve four national places without rest or day licenses',()=>{
 const s=partial(gt,{jordi:4,joseba:5,hector:2,alfonso:1}),c=E.calculate(gt,s);
 assert.equal(c.missing.length,28);assert.equal(c.eligibilityPending.length,3);assert.equal(c.podium.length,4);assert.deepEqual(c.podium.map(p=>p.certain[0]?.pilot.id),['oriol','hector','joseba','jordi']);
});
test('Exhaust all 5040 seven-pilot F1 finishes: independent scoring, title/podium/Pere conditions, five podiums',()=>{
 const active=f1.pilots.filter(p=>p.originalToday),podiums=new Set();let count=0;
 const partialCache=new Map();
 for(const places of permutations([1,2,3,4,5,6,7])){
  const position=Object.fromEntries(active.map((p,i)=>[p.id,places[i]]));
  const expected=f1.pilots.map(p=>oracle(p,position[p.id],f1.points)).sort(comparator);
  const state=E.createState(f1);for(const p of state.pilots)if(p.active)p.position=String(position[p.id]);
  const c=E.calculate(f1,state);assert.equal(c.complete,true);assert.deepEqual(c.rows.map(r=>[r.pilot.id,r.min]),expected.map(r=>[r.id,r.total]));
  const top=c.rows.map(r=>r.pilot.id),D=position.dani,J=position.joan,L=position.lorenzo,P=position.pere;
  const daniWins=D===1?J>=3:D===2?J>=4:J>=5;
  assert.equal(top[0],daniWins?'dani':'joan');assert.ok(top.indexOf('dani')<=1);
  assert.equal(top.indexOf('lorenzo')<=2,L<=2);
  assert.equal(top[1]==='lorenzo',(L===1&&J>=6)||(L===2&&J===7));
  assert.equal(top[2]==='ricardo',L>=3);
  assert.equal(top[3]==='pere',(P===1&&L>=5)||(P===2&&L>=6));
  podiums.add(top.slice(0,3).join('/'));
  // Every exact partial top-four assertion must hold in every completion.
  const cacheKey=`${D},${J},${L}`;
  if(!partialCache.has(cacheKey))partialCache.set(cacheKey,calc({dani:D,joan:J,lorenzo:L}));
  const partialResult=partialCache.get(cacheKey);
  for(const slot of partialResult.podium)if(slot.certain.length===1)assert.equal(top[slot.rank-1],slot.certain[0].pilot.id);
  count++;
 }
 assert.equal(count,5040);assert.deepEqual(podiums,new Set(['dani/joan/ricardo','dani/joan/lorenzo','dani/lorenzo/joan','joan/dani/ricardo','joan/dani/lorenzo']));
});
