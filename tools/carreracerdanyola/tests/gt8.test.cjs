const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/engine.js'),S=require('../src/scenarios.js'),B=require('../src/broadcast.js');
const nitro=require('../src/seed-nitro.json'),eco=require('../src/seed-eco.json');
const get=(c,id)=>c.rows.find(r=>r.pilot.id===id);
function partial(seed,positions={}){let s=E.createState(seed);for(const[id,pos]of Object.entries(positions))s=E.assignPosition(s,id,String(pos));return s;}
function calc(seed,positions){return E.calculate(seed,partial(seed,positions));}
function rng(seed=345123){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const rand=rng();
function shuffled(n){const a=Array.from({length:n},(_,i)=>i+1);for(let i=n-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function oracle(p,position,seed){const history=[...p.history,p.active&&p.qualifying&&p.eligible==='yes'&&!p.noClassification?position:null];const races=history.map((place,round)=>({place,round,pts:place==null?0:place>90?1:seed.points[place-1]}));if(p.pointsOverride!==''&&p.active&&p.qualifying&&p.eligible==='yes'&&!p.noClassification){races[2].pts=Number(p.pointsOverride);if(!races[2].pts)races[2].place=null;}
const sorted=[...races].sort((a,b)=>b.pts-a.pts||(a.place??1e9)-(b.place??1e9)||a.round-b.round),kept=sorted.slice(0,2),discard=sorted[2];return{id:p.id,total:kept.reduce((s,r)=>s+r.pts,0),wins:kept.filter(r=>r.place===1).length,seconds:kept.filter(r=>r.place===2).length,thirds:kept.filter(r=>r.place===3).length,discard,races};}
function compareOracle(a,b){for(const key of['total','wins','seconds','thirds'])if(a[key]!==b[key])return b[key]-a[key];if(a.discard.pts!==b.discard.pts)return b.discard.pts-a.discard.pts;if(a.discard.place!==b.discard.place)return(a.discard.place??1e9)-(b.discard.place??1e9);for(let r=2;r>=0;r--)if(a.races[r].place!==null&&b.races[r].place!==null)return a.races[r].place-b.races[r].place;return 0;}
function* permutations(a){if(!a.length){yield[];return;}for(let i=0;i<a.length;i++)for(const rest of permutations(a.filter((_,j)=>i!==j)))yield[a[i],...rest];}

test('40 source rows, two histories each, exact historical points and preserved records',()=>{
assert.equal(nitro.pilots.length,26);assert.equal(eco.pilots.length,14);
for(const seed of[nitro,eco]){const s=E.createState(seed);s.pilots.forEach(p=>p.active=false);const c=E.calculate(seed,s);assert.equal(c.complete,true);for(const p of seed.pilots){assert.equal(p.history.length,2);assert.equal(get(c,p.id).min,p.baselineTotal,p.name);assert.equal(get(c,p.id).exact.bonus,0);}}
assert.deepEqual(nitro.pilots.find(p=>p.id==='goncalo').history,[102,100]);assert.equal(eco.pilots.find(p=>p.id==='diego').baselineTotal,1);
});
test('GT8 never adds attendance points; same scorer retains original GT/F1 defaults',()=>{for(let n=0;n<=4;n++)assert.equal(E.bonusFor(n,[0,0,0,0]),0);assert.equal(E.bonusFor(4),150);const s=E.createState(eco),p=s.pilots.find(p=>p.id==='joao');const r=E.resultFor(p,1,'yes',eco.points,eco.rules);assert.equal(r.total,1280);assert.equal(r.races.length,3);assert.equal(r.kept.length,2);assert.equal(r.discard.points,613);assert.equal(r.bonus,0);});
test('Nitro title has exactly eleven candidates; podium thirteen',()=>{const c=calc(nitro,{});assert.deepEqual(new Set(c.podium[0].candidates.map(r=>r.pilot.id)),new Set(['cristian','raul-fernandez','raul-daras','marc','fabio','henrique','joao','david-gallegos','juan-carlos','oswaldo','eduard']));assert.equal(c.rows.filter(r=>r.rankMin<=3).length,13);});
test('ECO title exactly Joao, Cristian and Carles, not current third Daniel',()=>{assert.deepEqual(new Set(calc(eco,{}).podium[0].candidates.map(r=>r.pilot.id)),new Set(['joao','cristian','carles']));});
for(const id of['cristian','raul-daras'])test(`Nitro ${id} wins the title with just his first place`,()=>{const c=calc(nitro,{[id]:1});assert.equal(c.podium[0].certain[0].pilot.id,id);assert.equal(get(c,id).min,1280);assert.equal(c.complete,false);});
test('Four Nitro positions suffice for all top four, 22 positions still missing',()=>{const s=partial(nitro,{cristian:1,marc:2,'raul-daras':3,fabio:4}),c=E.calculate(nitro,s);assert.deepEqual(c.podium.map(p=>p.certain[0]?.pilot.id),['cristian','raul-daras','marc','fabio']);assert.equal(c.missing.length,22);assert.equal(c.finalReady,false);assert.equal(B.narrate(nitro,s,c).topFourCertain,true);});
test('ECO needs no full field; Franco fifth secures Franco fourth; seventh secures Daniel fourth in the example',()=>{let s=partial(eco,{carles:1,cristian:2,joao:3,daniel:4}),c=E.calculate(eco,s);assert.equal(c.podium[3].certain.length,0);assert.ok(B.narrate(eco,s,c).needed.some(p=>p.id==='francisco-franco'));s=E.assignPosition(s,'francisco-franco','5');c=E.calculate(eco,s);assert.equal(c.podium[3].certain[0].pilot.id,'francisco-franco');s=E.assignPosition(s,'francisco-franco','7');c=E.calculate(eco,s);assert.deepEqual(c.podium.map(p=>p.certain[0]?.pilot.id),['carles','joao','cristian','daniel']);assert.equal(c.complete,false);});
test('ECO: Carles winning guarantees the championship',()=>{assert.equal(calc(eco,{carles:1}).podium[0].certain[0].pilot.id,'carles');});
test('ECO: Cristian winner, Joao second => Joao wins by discard',()=>{const c=calc(eco,{cristian:1,joao:2});assert.equal(c.podium[0].certain[0].pilot.id,'joao');assert.equal(get(c,'cristian').min,1253);assert.equal(get(c,'joao').min,1253);assert.match(get(c,'joao').tieReason,/descarte/);});
test('ECO: Cristian winner, Joao third => Cristian by latest common C3',()=>{const c=calc(eco,{cristian:1,joao:3});assert.equal(c.podium[0].certain[0].pilot.id,'cristian');assert.match(get(c,'cristian').tieReason,/C3/);});
test('ECO Joao absent can be THIRD behind Cristian first and Carles second',()=>{let s=partial(eco,{cristian:1,carles:2});s.pilots.find(p=>p.id==='joao').active=false;const c=E.calculate(eco,s);assert.deepEqual(c.podium.slice(0,3).map(p=>p.certain[0]?.pilot.id),['cristian','carles','joao']);assert.equal(B.guide(eco,s).compatible,false);});
test('Nitro: Marc winning beats Cristian third and Daras fourth by discard',()=>{const c=calc(nitro,{marc:1,cristian:3,'raul-daras':4});assert.equal(c.podium[0].certain[0].pilot.id,'marc');assert.match(get(c,'marc').tieReason,/descarte/);});
test('Nitro: Fabio or Henrique win but Cristian second takes the title',()=>{for(const id of['fabio','henrique']){assert.equal(calc(nitro,{[id]:1,cristian:2}).podium[0].certain[0].pilot.id,'cristian');}});
test('Unique places: rejection atomic, numeric fractions invalid, swap atomic',()=>{const s=partial(nitro,{cristian:1,marc:2});assert.throws(()=>E.assignPosition(s,'joao','1'),/repetido/);assert.throws(()=>E.assignPosition(s,'joao','2.5'));assert.throws(()=>E.assignPosition(s,'joao','27'));const moved=E.stepPosition(s,'marc',-1);assert.equal(moved.pilots.find(p=>p.id==='marc').position,'1');assert.equal(moved.pilots.find(p=>p.id==='cristian').position,'2');assert.equal(s.pilots.find(p=>p.id==='cristian').position,'1');});
test('Ambiguous names rejected; accents and quick entry work',()=>{const s=E.createState(nitro);assert.ok(E.parseQuick('Raul 2',s.pilots).errors.length);assert.equal(E.parseQuick('Raúl Daras 2, Cristian 3',s.pilots).changes.length,2);assert.ok(E.parseQuick('David 1',s.pilots).errors.length);});
test('Cerdanyola backups do not mix categories, rules or history with Lleida',()=>{const s=E.createState(nitro);assert.equal(E.importState(s,nitro).eventId,'cerdanyola-gt8-2026');assert.throws(()=>E.importState(s,eco));const wrong=E.clone(s);wrong.eventId='lleida-2026';assert.throws(()=>E.importState(wrong,nitro));const changed=E.clone(s);changed.pilots[0].history[0]=2;assert.throws(()=>E.importState(changed,nitro));});
test('New drivers retain zero history; can fill a real position without borrowing GT/F1 points',()=>{const s=E.createState(nitro);s.pilots.push({...E.clone(s.pilots[0]),id:'custom-new',name:'Piloto Nuevo',shortName:'Piloto Nuevo',history:[null,null],baselineTotal:0,baselineRank:null,custom:true,position:'1'});const c=E.calculate(nitro,s);assert.equal(get(c,'custom-new').min,640);assert.equal(get(c,'custom-new').exact.bonus,0);assert.equal(E.importState(s,nitro).pilots.at(-1).custom,true);});
test('Ineligible drivers keep their physical slot and do not renumber others',()=>{const s=partial(eco,{carles:1,joao:2});s.pilots.find(p=>p.id==='carles').eligible='no';const c=E.calculate(eco,s);assert.equal(get(c,'carles').min,640);assert.equal(get(c,'carles').exact.rawPosition,1);assert.equal(get(c,'joao').exact.todayPoints,613);});
test('Official current correction and no-classification are explicit zero/override, not last place',()=>{let s=partial(nitro,{cristian:1});let p=s.pilots.find(p=>p.id==='cristian');p.pointsOverride='1';let c=E.calculate(nitro,s);assert.equal(get(c,'cristian').exact.todayPoints,1);assert.equal(get(c,'cristian').min,1112);p.noClassification=true;p.position='';p.pointsOverride='';c=E.calculate(nitro,s);assert.equal(get(c,'cristian').min,1112);assert.equal(get(c,'cristian').exact.todayPoints,0);});
test('Maximum matching respects one physical slot per missing driver',()=>{assert.equal(E.maximumMatching([[0],[0],[1,2]],3),2);assert.equal(E.maximumMatching([[0,1],[0],[2]],3),3);assert.equal(E.maximumMatching([],0),0);});
test('Exact partial bounds agree with enumeration for two six-driver subsets (720 each)',()=>{
 for(const base of[nitro,eco]){
  const seed=E.clone(base);seed.pilots=seed.pilots.slice(0,6);const state=E.createState(seed),bounds=E.calculate(seed,state),observed=new Map(seed.pilots.map(p=>[p.id,{min:Infinity,max:0}]));
  for(const order of permutations([1,2,3,4,5,6])){const rs=state.pilots.map((p,i)=>oracle(p,order[i],seed));for(const r of rs){const rank=1+rs.filter(x=>compareOracle(x,r)<0).length;const o=observed.get(r.id);o.min=Math.min(o.min,rank);o.max=Math.max(o.max,rank);}}
  for(const r of bounds.rows){assert.equal(r.rankMin,observed.get(r.pilot.id).min,r.pilot.id);assert.equal(r.rankMax,observed.get(r.pilot.id).max,r.pilot.id);}
 }
});
test('600 independent full-grid oracle comparisons (300/category) plus title paths constraints',()=>{
 for(const seed of[nitro,eco]){
  const start=E.createState(seed),paths=new Map(seed.pilots.map(p=>[p.id,S.titlePaths(seed,start,p.id)]));
  for(let trial=0;trial<300;trial++){
   const order=shuffled(seed.pilots.length),s=E.clone(start);s.pilots.forEach((p,i)=>p.position=String(order[i]));const c=E.calculate(seed,s),oracles=s.pilots.map(p=>oracle(p,Number(p.position),seed));
   assert.equal(c.finalReady,true);
   for(const r of c.rows){const o=oracles.find(x=>x.id===r.pilot.id);assert.equal(r.min,o.total);assert.equal(r.rankMin,1+oracles.filter(x=>compareOracle(x,o)<0).length);assert.equal(r.exact.bonus,0);}
   const winner=c.rows[0].pilot;
   for(const p of s.pilots){const path=paths.get(p.id).rows.find(r=>r.position===Number(p.position));const satisfied=!!path&&path.requirements.every(req=>req.places.includes(Number(s.pilots.find(x=>x.id===req.id).position)));assert.equal(satisfied,p.id===winner.id,seed.categoryId+' '+p.id+' '+trial);}
  }
 }
});
test('Partial min/max are safe for 200 random full-grid completions after four known results',()=>{
 for(const seed of[nitro,eco])for(let batch=0;batch<5;batch++){
  const original=shuffled(seed.pilots.length),s=E.createState(seed);s.pilots.slice(0,4).forEach((p,i)=>p.position=String(original[i]));const c=E.calculate(seed,s);
  for(let trial=0;trial<20;trial++){const missing=s.pilots.filter(p=>!p.position),used=new Set(s.pilots.filter(p=>p.position).map(p=>Number(p.position))),available=shuffled(seed.pilots.length).filter(p=>!used.has(p));const full=E.clone(s);missing.forEach((p,i)=>full.pilots.find(x=>x.id===p.id).position=String(available[i]));const computed=E.calculate(seed,full);for(const r of computed.rows){const b=get(c,r.pilot.id);assert.ok(r.rankMin>=b.rankMin&&r.rankMin<=b.rankMax,r.pilot.id);}}
 }
});
test('Title paths ignore current positions, honor roster changes, and reject unknown scoring',()=>{const s=partial(eco,{cristian:2,joao:3});assert.deepEqual(S.titlePaths(eco,s,'cristian'),S.titlePaths(eco,E.createState(eco),'cristian'));s.pilots.find(p=>p.id==='joao').active=false;assert.equal(S.titlePaths(eco,s,'cristian').rows[0].requirements.length,0);s.pilots.find(p=>p.id==='carles').eligible='unknown';assert.equal(S.titlePaths(eco,s,'cristian').ready,false);});
test('No result generation or finalization from only partial data',()=>{const s=partial(nitro,{cristian:1}),c=E.calculate(nitro,s);assert.equal(c.finalReady,false);assert.equal(c.missing.length,25);assert.equal(s.pilots.find(p=>p.id==='marc').position,'');});
