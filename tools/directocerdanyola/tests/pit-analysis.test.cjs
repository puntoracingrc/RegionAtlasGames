const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../src/pit-analysis.js');
const calibration=require('../pit-analysis/event-100645-profiles.json');
const evidence=require('../pit-analysis/event-100645-laps.json');
const national=require('../pit-analysis/event-95551-national.json');
const arcaTrack=require('../track/arca.json');
const almussafesTrack=require('../track/almussafes.json');
const asogerTrack=require('../track/asoger.json');

test('matches registered national entrants with shorter MyRCM names',()=>{
  assert.equal(P.profileForName(calibration.profiles,'RAUL FERNANDEZ GUISADO').name,'RAUL FERNANDEZ');
  assert.equal(P.profileForName(calibration.profiles,'JORDI CANADELL GARCIA (+40)').name,'JORDI CANADELL');
});

test('warns before a learned refuelling window',()=>{
  const profile=calibration.profiles.find(item=>item.name==='JORDI CANADELL');
  const laps=Array.from({length:15},(_,index)=>({lap:index+1,time:19.45+(index%3)*.08}));
  const signal=P.liveSignal({completedLaps:16,laps,secondsSinceCrossing:10,profile,observedCrossings:15});
  assert.equal(signal.state,'window');
  assert.equal(signal.window.center,17);
});

test('marks an overdue crossing inside the window as probable pit stop',()=>{
  const profile=calibration.profiles.find(item=>item.name==='RAUL FERNANDEZ');
  const laps=Array.from({length:20},(_,index)=>({lap:index+1,time:18.0+(index%4)*.05}));
  const signal=P.liveSignal({completedLaps:20,laps,secondsSinceCrossing:25,profile,observedCrossings:20});
  assert.equal(signal.state,'pit-live');
  assert.equal(signal.confidence,'high');
});

test('gives a scheduled refuelling enough grace before showing an incident alert',()=>{
  const profile=calibration.profiles.find(item=>item.name==='EDUARD CHAMERO ESPINOSA');
  const ordinary=P.crossingThresholds({profile,expectedSeconds:profile.baselineSeconds,completedLaps:10,category:'NITRO'});
  const pitWindow=P.crossingThresholds({profile,expectedSeconds:profile.baselineSeconds,completedLaps:19,category:'NITRO'});
  assert.equal(ordinary.inPitWindow,false);
  assert.ok(ordinary.warningSeconds>36&&ordinary.warningSeconds<38);
  assert.equal(ordinary.dockSeconds,90);
  assert.equal(pitWindow.inPitWindow,true);
  assert.ok(pitWindow.warningSeconds>62.8);
  assert.equal(pitWindow.dockSeconds,120);
});

test('moves from probable refuelling to incident only after the expected window expires',()=>{
  const profile=calibration.profiles.find(item=>item.name==='RAUL FERNANDEZ');
  const thresholds=P.crossingThresholds({profile,expectedSeconds:profile.baselineSeconds,completedLaps:20,category:'NITRO'});
  const refueling=P.crossingStatus({profile,expectedSeconds:profile.baselineSeconds,completedLaps:20,secondsSinceCrossing:thresholds.refuelStartSeconds+.5,category:'NITRO'});
  const incident=P.crossingStatus({profile,expectedSeconds:profile.baselineSeconds,completedLaps:20,secondsSinceCrossing:thresholds.incidentSeconds+.5,category:'NITRO'});
  const offTrack=P.crossingStatus({profile,expectedSeconds:profile.baselineSeconds,completedLaps:20,secondsSinceCrossing:thresholds.dockSeconds+.5,category:'NITRO'});
  assert.equal(refueling.state,'refueling');
  assert.equal(incident.state,'incident');
  assert.equal(offTrack.state,'off-track');
});

test('does not turn ordinary variation from an irregular driver into a pit stop',()=>{
  const profile={baselineSeconds:22,madSeconds:1.6,consistency:'irregular',reliability:.35,firstStopLap:18,refuelIntervalLaps:18,pitLossSeconds:10,confidence:'low'};
  const laps=[22.1,24.8,21.6,23.7,22.3,25.2,21.9,23.1,22.5,25.5].map((time,index)=>({lap:index+1,time}));
  const result=P.classifyCompletedLap(laps,profile);
  assert.equal(result.state,'pace');
});

test('a second abnormal lap after a stop-shaped loss becomes an incident signal',()=>{
  const profile={baselineSeconds:18,madSeconds:.2,consistency:'very-stable',reliability:.95,firstStopLap:20,refuelIntervalLaps:19,pitLossSeconds:8,confidence:'high'};
  const laps=Array.from({length:19},(_,index)=>({lap:index+1,time:18+(index%2)*.1}));
  laps.push({lap:20,time:26},{lap:21,time:27});
  const result=P.classifyCompletedLap(laps,profile);
  assert.equal(result.state,'incident');
});

test('Marc retirement reference is not represented as a refuelling cadence',()=>{
  const marc=calibration.profiles.find(item=>item.name==='MARC GARCIA CANADELL');
  assert.equal(marc.retirementReference.laps,38);
  assert.ok(marc.retirementReference.laps<marc.retirementReference.winnerLaps*.5);
  assert.equal(marc.confidence,'medium');
});

test('stored profiles remain traceable to the captured MyRCM lap table',()=>{
  const final=evidence.reports.find(report=>report.reportKey==='1150');
  for(const name of ['RAUL FERNANDEZ','JORDI CANADELL','EDUARD CHAMERO ESPINOSA','MARC GARCIA CANADELL']){
    const profile=calibration.profiles.find(item=>item.name===name),laps=new Map(final.drivers[name].map(item=>[item.lap,item.seconds]));
    assert.ok(profile.evidenceStopLaps.every(lap=>laps.has(lap)),`${name} evidence laps`);
  }
  const marcQualifying=evidence.reports.filter(report=>report.reportType==='qualy').flatMap(report=>report.drivers['MARC GARCIA CANADELL']||[]).map(item=>item.seconds);
  assert.equal(marcQualifying.length,42);
  assert.ok(Math.abs(P.median(marcQualifying)-17.837)<.001);
});

test('cross-track profiles stay in calibration mode until local pace exists',()=>{
  const henrique=calibration.profiles.find(item=>item.name==='HENRIQUE ALMEIDA');
  assert.equal(henrique.trackTransfer,true);
  assert.equal(P.liveSignal({completedLaps:5,laps:[],secondsSinceCrossing:12,profile:henrique}).state,'learning');
});

test('ARCA comparison preserves track length and semifinal evidence',()=>{
  assert.equal(arcaTrack.lapLengthMeters,276.42);
  assert.equal(almussafesTrack.lapLengthMeters,290.56);
  assert.equal(asogerTrack.lapLengthMeters,287);
  const semi=national.reports.find(report=>report.reportKey==='9625');
  const marc=new Map(semi.drivers['MARC GARCIA CANADELL (GE)'].map(item=>[item.lap,item.seconds]));
  assert.ok(marc.get(16)>30&&marc.get(32)>30&&marc.get(46)>30);
  assert.ok(Math.abs(arcaTrack.lapLengthMeters/22.291*3.6-44.64)<.01);
});

test('fuel estimate drains towards the learned stop and resets only after a confirmed refuel',()=>{
  const profile=calibration.profiles.find(item=>item.name==='RAUL FERNANDEZ');
  const approaching=P.fuelEstimate({completedLaps:20,lapProgress:50,profile});
  assert.equal(approaching.state,'critical');
  assert.ok(approaching.level<10);
  const refuelled=P.fuelEstimate({completedLaps:21,lapProgress:10,profile,confirmedStops:[21]});
  assert.ok(refuelled.level>98);
});

test('a small loss does not refill the virtual tank',()=>{
  const profile={baselineSeconds:18,firstStopLap:20,refuelIntervalLaps:20,windowMarginLaps:2,confidence:'medium'};
  const estimate=P.fuelEstimate({completedLaps:10,profile,laps:[{lap:10,state:'loss'}]});
  assert.equal(estimate.state,'normal');
  assert.equal(estimate.level,50);
  assert.equal(estimate.lastStop,0);
});

test('a long incident makes fuel uncertain instead of assuming a full tank',()=>{
  const profile={baselineSeconds:18,firstStopLap:20,refuelIntervalLaps:20,windowMarginLaps:2,confidence:'high'};
  const estimate=P.fuelEstimate({completedLaps:13,profile,laps:[{lap:11,state:'incident'}]});
  assert.equal(estimate.state,'uncertain');
  assert.ok(estimate.low<estimate.high);
  assert.equal(estimate.confidence,'low');
});

test('field fuel model gives a slightly longer time window to a slower driver',()=>{
  const quick=P.fallbackFuelProfile(18,calibration.profiles),slow=P.fallbackFuelProfile(21,calibration.profiles);
  assert.ok(slow.refuelIntervalSeconds>quick.refuelIntervalSeconds);
  assert.ok(Math.abs(slow.refuelIntervalLaps-quick.refuelIntervalLaps)<3);
  assert.equal(slow.estimatedFromField,true);
  const overdue=P.fuelEstimate({completedLaps:25,profile:slow});
  assert.equal(overdue.state,'uncertain');
  assert.equal(overdue.reason,'unconfirmed-stop');
});
