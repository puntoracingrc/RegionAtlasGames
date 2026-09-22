const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../src/replay-core.js');
const data=require('../demo/event-100645-nitro-final.json');
const replay=R.prepareReplay(data);

test('prepares the complete public Nitro final as a 30 minute replay',()=>{
  assert.equal(replay.drivers.length,10);
  assert.equal(replay.drivers.reduce((sum,driver)=>sum+driver.finalLaps,0),749);
  assert.equal(replay.scheduledSeconds,1800);
  assert.ok(replay.durationSeconds>1812&&replay.durationSeconds<1814);
});

test('keeps the first transponder pass as lap zero and starts the count on the second pass',()=>{
  const raul=replay.drivers.find(driver=>driver.name==='RAUL FERNANDEZ');
  const beforeLapZero=R.frame(replay,raul.startOffsetSeconds-.01).drivers.find(driver=>driver.name===raul.name);
  const afterLapZero=R.frame(replay,raul.startOffsetSeconds+.01).drivers.find(driver=>driver.name===raul.name);
  const before=R.frame(replay,raul.crossings[0].at-.01).drivers.find(driver=>driver.name===raul.name);
  const after=R.frame(replay,raul.crossings[0].at+.01).drivers.find(driver=>driver.name===raul.name);
  assert.equal(beforeLapZero.laps,0);
  assert.equal(beforeLapZero.startPhase,true);
  assert.equal(afterLapZero.laps,0);
  assert.equal(afterLapZero.startPhase,false);
  assert.equal(before.laps,0);
  assert.equal(after.laps,1);
  assert.ok(after.progress<1);
  assert.equal(after.lastLap,'27.913');
  assert.equal(after.best,'19.230');
});

test('detects a late start from the field pattern without inventing its cause',()=>{
  const jordi=replay.drivers.find(driver=>driver.name==='JORDI CANADELL');
  const marc=replay.drivers.find(driver=>driver.name==='MARC GARCIA CANADELL');
  const warningAt=replay.startBaselineSeconds+replay.startDelayThresholdSeconds+.01;
  const active=R.frame(replay,warningAt).drivers;
  const recovered=R.frame(replay,jordi.startOffsetSeconds+.01).drivers.find(driver=>driver.name===jordi.name);
  assert.equal(active.find(driver=>driver.name===jordi.name).startDelayActive,true);
  assert.equal(active.find(driver=>driver.name===marc.name).delayedStart,false);
  assert.equal(recovered.delayedStart,true);
  assert.equal(recovered.startDelayActive,false);
  assert.ok(recovered.startDelaySeconds>20);
});

test('keeps a non starter off track and marks it only when the replay has ended',()=>{
  const sample=R.prepareReplay({scheduledSeconds:30,drivers:[
    {name:'Starter',startOffsetSeconds:3,laps:[{lap:1,seconds:10}]},
    {name:'No sale',startOffsetSeconds:0,laps:[]}
  ]});
  const during=R.frame(sample,9).drivers.find(driver=>driver.name==='No sale');
  const ended=R.frame(sample,sample.durationSeconds).drivers.find(driver=>driver.name==='No sale');
  assert.equal(during.laps,0);
  assert.equal(during.startDelayActive,true);
  assert.equal(ended.didNotStart,true);
  assert.equal(ended.finished,false);
});

test('interpolates movement between real crossings without inventing another lap',()=>{
  const driver=replay.drivers[0],first=driver.crossings[0].at,second=driver.crossings[1].at;
  const state=R.frame(replay,(first+second)/2).drivers.find(item=>item.name===driver.name);
  assert.equal(state.laps,1);
  assert.ok(state.progress>49&&state.progress<51);
});

test('paces map movement by straights and corners while preserving real crossings',()=>{
  const uniform=R.motionTimeline([1,1,1,1]);
  assert.equal(R.pacedProgress(0,uniform),0);
  assert.equal(R.pacedProgress(50,uniform),50);
  assert.equal(R.pacedProgress(100,uniform),100);

  const straightThenCorner=R.motionTimeline([2,2,.5,.5]);
  assert.ok(R.pacedProgress(20,straightThenCorner)>45);
  assert.ok(R.pacedProgress(50,straightThenCorner)>60);
  assert.equal(R.pacedProgress(100,straightThenCorner),100);
});

test('keeps the timing order tied to recorded crossings while the map interpolates',()=>{
  const sample=R.prepareReplay({scheduledSeconds:30,drivers:[
    {name:'A',laps:[{lap:1,seconds:10},{lap:2,seconds:20}]},
    {name:'B',laps:[{lap:1,seconds:12},{lap:2,seconds:6}]}
  ]});
  const frame=R.frame(sample,16);
  assert.deepEqual(frame.drivers.map(driver=>driver.name),['A','B']);
  assert.ok(frame.drivers[0].progress<frame.drivers[1].progress);
  assert.equal(frame.drivers[1].gapPrevious,'+2.000');
});

test('warns, hides after 60 seconds without a crossing and restores the car on return',()=>{
  const sample=R.prepareReplay({scheduledSeconds:200,drivers:[
    {name:'Vuelve',laps:[{lap:1,seconds:10},{lap:2,seconds:10},{lap:3,seconds:90},{lap:4,seconds:10}]},
    {name:'Referencia',laps:Array.from({length:21},(_,index)=>({lap:index+1,seconds:10}))}
  ]});
  const stateAt=seconds=>R.frame(sample,seconds).drivers.find(driver=>driver.name==='Vuelve');
  assert.equal(stateAt(46).missingCrossing,true);
  assert.equal(stateAt(46).hiddenAfterNoCrossing,false);
  assert.equal(stateAt(81).hiddenAfterNoCrossing,true);
  assert.equal(stateAt(111).missingCrossing,false);
  assert.equal(stateAt(111).hiddenAfterNoCrossing,false);
  assert.equal(stateAt(111).laps,3);
});

test('does not raise signal-loss alerts for a normal classified finish',()=>{
  const final=R.frame(replay,replay.durationSeconds),raul=final.drivers.find(driver=>driver.name==='RAUL FERNANDEZ'),marc=final.drivers.find(driver=>driver.name==='MARC GARCIA CANADELL');
  assert.equal(raul.finished,true);
  assert.equal(raul.hiddenAfterNoCrossing,false);
  assert.equal(marc.finished,false);
  assert.equal(marc.hiddenAfterNoCrossing,true);
});

test('still detects and clears a long mid-race gap for a driver who later finishes',()=>{
  const during=R.frame(replay,390).drivers.find(driver=>driver.name==='FERNANDO CRIADO GARBAS'),returned=R.frame(replay,463).drivers.find(driver=>driver.name==='FERNANDO CRIADO GARBAS');
  assert.equal(during.missingCrossing,true);
  assert.equal(returned.missingCrossing,false);
  assert.equal(returned.laps,15);
});

test('reconstructs the published final order and retirement lap counts',()=>{
  const final=R.frame(replay,replay.durationSeconds);
  assert.deepEqual(final.drivers.map(driver=>driver.name),data.drivers.map(driver=>driver.name));
  assert.deepEqual(final.drivers.map(driver=>driver.laps),[95,91,87,83,81,79,74,68,53,38]);
  assert.equal(final.finished,true);
});
