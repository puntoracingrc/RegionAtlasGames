const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('../src/live-core.js');
const E=require('../../carreracerdanyola/src/engine.js');
const eco=require('../../carreracerdanyola/src/seed-eco.json');
const track=require('../track/cerdanyola.json');

test('matches MyRCM surname-first names against the championship roster',()=>{
  assert.equal(L.matchPilot('ECHARRI CARLES',eco.pilots).id,'carles');
  assert.equal(L.matchPilot('NOCETE ROCA DANIEL',eco.pilots).id,'daniel');
  assert.equal(L.matchPilot('ALONSO CALVO SERGIO',eco.pilots).id,'sergio-alonso');
  assert.equal(L.matchPilot('GONZALEZ DANI',eco.pilots),null);
});

test('detects electric before generic GT wording',()=>{
  assert.equal(L.categoryFromMetadata({SECTIONNAME:'GT ECO'}),'ECO');
  assert.equal(L.categoryFromMetadata({SECTIONNAME:'1/8 GT Nitro'}),'NITRO');
});

test('normalizes a MyRCM event and preserves timing fields',()=>{
  const snapshot=L.normalizeEvent({EVENT:{METADATA:{NAME:'Cerdanyola',SECTIONNAME:'GT ECO',GROUP:'Final A',RACESTATE:'rsRunning'},DATA:[{INDEX:1,PILOT:'ECHARRI CARLES',LAPS:21,LAPTIME:'17.134',BESTTIME:'16.736',MEDIUMTIME:'17.130'}]}});
  assert.equal(snapshot.category,'ECO');
  assert.equal(snapshot.drivers[0].bestSeconds,16.736);
  assert.equal(L.raceStateLabel(snapshot.raceState),'En carrera');
});

test('unmatched live drivers occupy physical positions without scoring',()=>{
  const snapshot=L.normalizeEvent({EVENT:{METADATA:{SECTIONNAME:'GT ECO'},DATA:[
    {INDEX:1,PILOT:'GONZALEZ DANI',LAPS:20},{INDEX:2,PILOT:'ECHARRI CARLES',LAPS:20}
  ]}});
  const projected=L.stateFromSnapshot(E,eco,snapshot);
  assert.equal(projected.state.pilots.find(p=>p.id==='carles').position,'2');
  const guest=projected.state.pilots.find(p=>p.livePlaceholder);
  assert.equal(guest.position,'1');
  assert.equal(guest.eligible,'no');
  assert.equal(E.calculate(eco,projected.state).valid,true);
});

test('an official aggregate ranking defines the actual event roster',()=>{
  const snapshot=L.normalizeEvent({EVENT:{METADATA:{SECTIONNAME:'GT ECO'},DATA:[
    {INDEX:1,PILOT:'ECHARRI CARLES',LAPS:20},{INDEX:2,PILOT:'GONZALEZ DANI',LAPS:20}
  ]}});
  snapshot.authoritativeRoster=true;
  const projected=L.stateFromSnapshot(E,eco,snapshot);
  assert.equal(projected.state.pilots.find(p=>p.id==='carles').active,true);
  assert.equal(projected.state.pilots.find(p=>p.id==='joao').active,false);
  assert.equal(E.calculate(eco,projected.state).complete,true);
});

test('labels knockout and final phases from MyRCM group names',()=>{
  assert.equal(L.phaseFromGroup('1/4 Final B'),'Cuartos');
  assert.equal(L.phaseFromGroup('Semi Final A'),'Semifinales');
  assert.equal(L.phaseFromGroup('Final A'),'Finales');
});

test('derives orientative speed and distance from the measured 215.15 metre lap',()=>{
  assert.equal(track.status,'estimated');
  assert.equal(Math.round(L.averageSpeedKmh(16.736,track.lapLengthMeters)*100)/100,46.28);
  assert.ok(Math.abs(L.distanceKm(21,track.lapLengthMeters)-4.51815)<0.000001);
  assert.equal(L.averageSpeedKmh(0,track.lapLengthMeters),null);
  assert.equal(L.distanceKm(-1,track.lapLengthMeters),null);
});

test('groups only same-lap drivers separated by two seconds or less',()=>{
  const drivers=[
    {key:'a',position:1,name:'A',laps:20,gapPrevious:'0.000'},
    {key:'b',position:2,name:'B',laps:20,gapPrevious:'+0.606'},
    {key:'c',position:3,name:'C',laps:20,gapPrevious:'+1.125'},
    {key:'d',position:4,name:'D',laps:19,gapPrevious:'-1'},
    {key:'e',position:5,name:'E',laps:19,gapPrevious:'+2.001'}
  ];
  const battles=L.battleGroups(drivers,2);
  assert.equal(battles.length,1);
  assert.deepEqual(battles[0].drivers.map(driver=>driver.key),['a','b','c']);
  assert.ok(Math.abs(battles[0].spanSeconds-1.731)<0.000001);
  assert.equal(L.gapSeconds('-1'),null);
  assert.equal(L.gapSeconds('+0:01.234'),1.234);
});

test('estimates clean lap pace without using a refuelling outlier',()=>{
  const estimate=L.cleanLapEstimate([21.1,20.9,21.0,27.4,21.2,20.8],22.1,20.4);
  assert.ok(Math.abs(estimate-21)<0.001);
  assert.equal(L.cleanLapEstimate([],17.68,16.9),17.68);
  assert.ok(Math.abs(L.cleanLapEstimate([],24,20)-20.8)<0.001);
});

test('converts elapsed time since the transponder into bounded lap progress',()=>{
  assert.equal(L.estimatedLapProgress(10,20),50);
  assert.equal(L.estimatedLapProgress(30,20),99.5);
  assert.equal(L.estimatedLapProgress(-1,20),null);
  assert.equal(L.secondsSinceLastCrossing({raceState:'rsRunning',currentTime:'2:05.500'},{total:'2:01.250'}),4.25);
  assert.equal(L.secondsSinceLastCrossing({raceState:'rsIdle',currentTime:'2:05.500'},{total:'2:01.250'}),null);
});
