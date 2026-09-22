/* Pure, conservative Nitro pit-window inference helpers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CerdanyolaPitAnalysis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
}
function median(values){
  const sorted=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!sorted.length)return null;
  const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function robustStats(values){
  const clean=values.map(Number).filter(value=>Number.isFinite(value)&&value>0),center=median(clean);
  if(center==null)return {median:null,mad:null,count:0,consistency:'unknown',reliability:0};
  const mad=median(clean.map(value=>Math.abs(value-center)))||0,ratio=mad/center;
  const consistency=ratio<=.018?'very-stable':ratio<=.032?'stable':ratio<=.06?'variable':'irregular';
  const reliability=Math.max(0,Math.min(1,(clean.length/20)*(1-Math.min(.8,ratio*8))));
  return {median:center,mad,count:clean.length,consistency,reliability};
}
function profileForName(profiles,name){
  const wanted=normalize(name),wantedTokens=wanted.split(' ').filter(Boolean);let best=null;
  for(const profile of profiles||[]){
    const candidates=[profile.name,...(profile.aliases||[])];
    for(const candidate of candidates){
      const value=normalize(candidate),tokens=value.split(' ').filter(Boolean);
      const shared=tokens.filter(token=>wantedTokens.includes(token)).length;
      const exact=value===wanted,subset=tokens.length>=2&&tokens.every(token=>wantedTokens.includes(token));
      const reverse=wantedTokens.length>=2&&wantedTokens.every(token=>tokens.includes(token));
      const score=exact?100:subset||reverse?70+shared:shared>=2?shared*10:0;
      if(score&&(!best||score>best.score))best={profile,score};
    }
  }
  return best&&best.score>=20?best.profile:null;
}
function cleanBaseline(laps,fallback){
  const values=(laps||[]).map(item=>Number(typeof item==='number'?item:item.time)).filter(value=>Number.isFinite(value)&&value>0);
  if(!values.length)return {baseline:Number(fallback&&fallback.baselineSeconds)||null,mad:Number(fallback&&fallback.madSeconds)||null,consistency:fallback&&fallback.consistency||'unknown',reliability:Number(fallback&&fallback.reliability)||0};
  const first=robustStats(values),limit=first.median+Math.max(3.5,(first.mad||0)*7),trimmed=values.filter(value=>value<=limit),stats=robustStats(trimmed);
  if(fallback&&Number(fallback.baselineSeconds)>0&&values.length<8){
    const weight=Math.min(.55,values.length/16),baseline=Number(fallback.baselineSeconds)*(1-weight)+stats.median*weight;
    return {...stats,baseline,mad:Math.max(Number(fallback.madSeconds)||0,stats.mad||0),reliability:Math.min(.95,Math.max(Number(fallback.reliability)||0,stats.reliability))};
  }
  return {...stats,baseline:stats.median};
}
function nextWindow(profile,completedLaps,lastStopLap){
  const interval=Number(profile&&profile.refuelIntervalLaps),anchor=Number(lastStopLap||profile&&profile.firstStopLap);
  if(!Number.isFinite(interval)||interval<5||!Number.isFinite(anchor)||anchor<1)return null;
  let next=anchor;
  while(next<=completedLaps)next+=interval;
  const margin=Math.max(1,Number(profile&&profile.windowMarginLaps)||1);
  return {from:Math.max(completedLaps+1,Math.round(next-margin)),center:Math.round(next),to:Math.round(next+margin)};
}
function classifyCompletedLap(laps,profile){
  const list=(laps||[]).map((item,index)=>typeof item==='number'?{lap:index+1,time:Number(item)}:{lap:Number(item.lap)||index+1,time:Number(item.time)}).filter(item=>Number.isFinite(item.time)&&item.time>0);
  if(!list.length)return {state:'unknown',confidence:'low'};
  const current=list[list.length-1],previous=list[list.length-2],stats=cleanBaseline(list.slice(0,-1),profile),baseline=stats.baseline||Number(profile&&profile.baselineSeconds);
  if(!baseline)return {state:'unknown',confidence:'low'};
  const mad=Math.max(.1,stats.mad||Number(profile&&profile.madSeconds)||.1),delta=current.time-baseline;
  const slowThreshold=Math.max(3.5,mad*7,baseline*.18),pitLoss=Number(profile&&profile.pitLossSeconds)||9;
  const window=nextWindow(profile,current.lap-1,null),inWindow=window&&current.lap>=window.from&&current.lap<=window.to;
  const previousDelta=previous?previous.time-baseline:0,consecutive=previousDelta>slowThreshold;
  if(delta<=slowThreshold)return {state:'pace',confidence:stats.reliability>=.55?'high':'medium',baseline,delta,window};
  if(consecutive||delta>Math.max(24,pitLoss*2.5))return {state:'incident',confidence:delta>Math.max(35,pitLoss*3)?'high':'medium',baseline,delta,window};
  if(inWindow&&delta>=Math.max(3.5,pitLoss*.42)&&delta<=Math.max(22,pitLoss*2.25))return {state:'pit',confidence:(profile&&profile.confidence)==='high'&&stats.consistency!=='irregular'?'high':'medium',baseline,delta,window};
  return {state:'loss',confidence:stats.consistency==='irregular'?'low':'medium',baseline,delta,window};
}
function liveSignal({completedLaps,laps,secondsSinceCrossing,profile,observedCrossings=0}){
  if(!profile)return {state:'learning',label:'Aprendiendo ritmo',confidence:'low'};
  if(!Number(profile.baselineSeconds)||!Number(profile.refuelIntervalLaps))return {state:'learning',label:'Calibrando consumo local',confidence:'low'};
  const completed=Number(completedLaps)||0,analysis=classifyCompletedLap(laps,profile),lastStop=(laps||[]).filter(item=>item&&item.state==='pit').map(item=>item.lap).pop();
  if(analysis.state==='incident')return {...analysis,label:'Posible incidencia'};
  if(analysis.state==='pit')return {...analysis,label:'Repostaje completado · estimado'};
  if(analysis.state==='loss')return {...analysis,label:'Pérdida atípica'};
  const window=nextWindow(profile,completed,lastStop),currentLap=completed+1;
  if(!window||currentLap<window.from||currentLap>window.to)return {...analysis,state:'pace',label:'Ritmo normal',window};
  const baseline=Number(analysis.baseline||profile.baselineSeconds),pitLoss=Number(profile.pitLossSeconds)||9,delay=Number(secondsSinceCrossing);
  const overdue=Number.isFinite(delay)&&delay>baseline+Math.max(3.5,pitLoss*.42);
  if(overdue)return {state:'pit-live',label:'Repostaje probable',confidence:observedCrossings>=2&&profile.confidence==='high'?'high':'medium',baseline,delta:delay-baseline,window};
  return {state:'window',label:'Ventana de repostaje',confidence:profile.confidence==='high'?'high':'medium',baseline,window};
}
function crossingThresholds({profile,expectedSeconds,completedLaps=0,lastStopLap=null,category='NITRO'}){
  const expected=Number(expectedSeconds)||Number(profile&&profile.baselineSeconds)||20;
  if(category!=='NITRO'){const warningSeconds=Math.max(25,expected*1.5);return {refuelStartSeconds:null,warningSeconds,incidentSeconds:warningSeconds,dockSeconds:60,inPitWindow:false};}
  const baseline=Number(profile&&profile.baselineSeconds)||expected,pitLoss=Number(profile&&profile.pitLossSeconds)||10;
  const baseWarning=baseline+Math.max(16,pitLoss*1.8),window=profile&&nextWindow(profile,Number(completedLaps)||0,lastStopLap),currentLap=(Number(completedLaps)||0)+1;
  const inPitWindow=Boolean(window&&currentLap>=window.from&&currentLap<=window.to);
  const refuelStartSeconds=inPitWindow?baseline+Math.max(3.5,pitLoss*.42):null;
  const warningSeconds=inPitWindow?Math.max(baseWarning,baseline+Math.max(45,pitLoss*4.5)):Math.max(32,baseWarning);
  const dockSeconds=inPitWindow?Math.max(120,warningSeconds+45):Math.max(90,warningSeconds+45);
  return {refuelStartSeconds,warningSeconds,incidentSeconds:warningSeconds,dockSeconds,inPitWindow,window};
}
function crossingStatus({profile,expectedSeconds,completedLaps=0,lastStopLap=null,secondsSinceCrossing,category='NITRO'}){
  const elapsed=Number(secondsSinceCrossing),thresholds=crossingThresholds({profile,expectedSeconds,completedLaps,lastStopLap,category});
  if(!Number.isFinite(elapsed)||elapsed<0)return {state:'normal',elapsed:null,...thresholds};
  if(elapsed>=thresholds.dockSeconds)return {state:'off-track',elapsed,...thresholds};
  if(elapsed>=thresholds.incidentSeconds)return {state:'incident',elapsed,...thresholds};
  if(thresholds.inPitWindow&&elapsed>=thresholds.refuelStartSeconds)return {state:'refueling',elapsed,...thresholds};
  return {state:'normal',elapsed,...thresholds};
}
function fallbackFuelProfile(lapSeconds,profiles){
  const pace=Number(lapSeconds);if(!Number.isFinite(pace)||pace<=0)return null;
  const references=(profiles||[]).filter(item=>Number(item.baselineSeconds)>0&&Number(item.refuelIntervalSeconds)>0&&!item.trackTransfer),referencePace=median(references.map(item=>Number(item.baselineSeconds))),referenceSeconds=median(references.map(item=>Number(item.refuelIntervalSeconds)));
  if(!referencePace||!referenceSeconds)return null;
  const paceRatio=Math.max(.85,Math.min(1.35,pace/referencePace)),economyAdjustment=Math.max(.97,Math.min(1.08,1+(paceRatio-1)*.35)),intervalSeconds=referenceSeconds*economyAdjustment,intervalLaps=Math.max(7,intervalSeconds/pace);
  return {baselineSeconds:pace,refuelIntervalSeconds:intervalSeconds,refuelIntervalLaps:intervalLaps,firstStopLap:intervalLaps,windowMarginLaps:2,pitLossSeconds:10,confidence:'low',consistency:'unknown',reliability:.25,estimatedFromField:true};
}
function fuelEstimate({completedLaps,lapProgress=0,laps=[],profile,confirmedStops=[]}){
  if(!profile)return {state:'learning',level:null,label:'Sin modelo',confidence:'low'};
  const interval=Number(profile.refuelIntervalLaps),firstStop=Number(profile.firstStopLap||interval);
  if(!Number.isFinite(interval)||interval<5||!Number.isFinite(firstStop)||firstStop<1)return {state:'learning',level:null,label:'Calibrando',confidence:'low'};
  const current=Math.max(0,Number(completedLaps)||0)+Math.max(0,Math.min(100,Number(lapProgress)||0))/100;
  const pitStops=[...(confirmedStops||[]),(laps||[]).filter(item=>item&&item.state==='pit').map(item=>Number(item.lap))].filter(value=>Number.isFinite(value)&&value>0&&value<=current).sort((a,b)=>a-b),lastStop=pitStops.length?pitStops[pitStops.length-1]:0,nextStop=lastStop?lastStop+interval:firstStop,cycle=Math.max(1,nextStop-lastStop),rawLevel=100-(current-lastStop)/cycle*100,level=Math.max(0,Math.min(100,rawLevel));
  const incidents=(laps||[]).filter(item=>item&&item.state==='incident'&&Number(item.lap)>lastStop&&Number(item.lap)<=current),latestIncident=incidents[incidents.length-1];
  if(latestIncident){
    const possibleAnchor=Number(latestIncident.lap),possibleLevel=Math.max(0,Math.min(100,100-(current-possibleAnchor)/interval*100)),low=Math.round(Math.min(level,possibleLevel)),high=Math.round(Math.max(level,possibleLevel));
    return {state:'uncertain',reason:'incident',level:Math.round((low+high)/2),low,high,label:'Combustible incierto',confidence:'low',nextStop,lastStop,estimated:Boolean(profile.estimatedFromField)};
  }
  const lapsToStop=nextStop-current,margin=Math.max(1,Number(profile.windowMarginLaps)||1),overdue=lapsToStop<-margin;
  if(overdue&&profile.estimatedFromField)return {state:'uncertain',reason:'unconfirmed-stop',level:50,low:0,high:100,label:'Parada por confirmar',confidence:'low',nextStop,lastStop,lapsToStop,estimated:true};
  const state=overdue?'overdue':lapsToStop<=margin?'critical':level<=35?'low':'normal',label=overdue?'Parada no confirmada':state==='critical'?'Entrada próxima':state==='low'?'Combustible bajo':'Combustible estimado';
  return {state,level:Math.round(level),label,confidence:profile.estimatedFromField?'low':profile.confidence||'low',nextStop,lastStop,lapsToStop,estimated:Boolean(profile.estimatedFromField)};
}
return {normalize,median,robustStats,profileForName,cleanBaseline,nextWindow,classifyCompletedLap,liveSignal,crossingThresholds,crossingStatus,fallbackFuelProfile,fuelEstimate};
});
