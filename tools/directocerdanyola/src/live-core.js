/* Pure helpers for the MyRCM live dashboard. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CerdanyolaLiveCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
}
function tokens(value){return [...new Set(normalize(value).split(' ').filter(Boolean))];}
function sameTokens(a,b){return a.length===b.length&&a.every(token=>b.includes(token));}
function matchPilot(liveName,pilots){
  const live=tokens(liveName);
  if(live.length<2)return null;
  const scored=pilots.map(p=>{
    const full=tokens(p.name),short=tokens(p.shortName);
    const overlap=live.filter(token=>full.includes(token)).length;
    const subset=live.every(token=>full.includes(token));
    const reverseSubset=full.every(token=>live.includes(token));
    const exact=sameTokens(live,full)||sameTokens(live,short);
    const surnameWeight=live.length>1&&full.includes(live[0])?0.2:0;
    const score=exact?100:subset||reverseSubset?80+overlap:overlap>=2?overlap*10+surnameWeight:0;
    return {pilot:p,score,overlap};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||b.overlap-a.overlap);
  if(!scored.length||scored[0].score<20)return null;
  if(scored[1]&&scored[1].score===scored[0].score)return null;
  return scored[0].pilot;
}
function categoryFromMetadata(metadata){
  const value=normalize([metadata&&metadata.SECTIONNAME,metadata&&metadata.SECTIONCODE,metadata&&metadata.SECTION].filter(Boolean).join(' '));
  if(/\b(ECO|ELECTRIC|ELECTRICO|ELECTRICA|GTE|EP)\b/.test(value))return 'ECO';
  if(/\b(NITRO|GAS|IC)\b/.test(value))return 'NITRO';
  return null;
}
function timeSeconds(value){
  const raw=String(value||'').trim();
  if(!raw||raw==='0.000'||raw==='0:00.000')return null;
  const parts=raw.split(':').map(Number);
  if(parts.some(Number.isNaN))return null;
  if(parts.length===1)return parts[0];
  if(parts.length===2)return parts[0]*60+parts[1];
  return parts[0]*3600+parts[1]*60+parts[2];
}
function averageSpeedKmh(lapSeconds,lapLengthMeters){
  const seconds=Number(lapSeconds),meters=Number(lapLengthMeters);
  return Number.isFinite(seconds)&&seconds>0&&Number.isFinite(meters)&&meters>0?meters/seconds*3.6:null;
}
function distanceKm(laps,lapLengthMeters){
  const count=Number(laps),meters=Number(lapLengthMeters);
  return Number.isFinite(count)&&count>=0&&Number.isFinite(meters)&&meters>0?count*meters/1000:null;
}
function gapSeconds(value){
  const raw=String(value||'').trim().replace(',','.');
  if(!/^\+?(?:\d+:){0,2}\d+(?:\.\d+)?$/.test(raw))return null;
  const parsed=timeSeconds(raw.replace(/^\+/,''));
  return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}
function median(values){
  const ordered=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!ordered.length)return null;
  const middle=Math.floor(ordered.length/2);
  return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
}
function cleanLapEstimate(lapTimes,averageSeconds,bestSeconds){
  const recent=(lapTimes||[]).map(Number).filter(value=>Number.isFinite(value)&&value>0).slice(-12);
  if(recent.length>=3){
    const centre=median(recent),mad=median(recent.map(value=>Math.abs(value-centre)))||0;
    const upper=centre+Math.max(.8,mad*3.5),lower=Math.max(1,centre-Math.max(1.2,mad*4));
    const clean=recent.filter(value=>value>=lower&&value<=upper);
    if(clean.length>=2)return median(clean);
  }
  const average=Number(averageSeconds),best=Number(bestSeconds);
  if(Number.isFinite(average)&&average>0&&Number.isFinite(best)&&best>0&&average<=best*1.18)return average;
  if(Number.isFinite(best)&&best>0)return best*1.04;
  return Number.isFinite(average)&&average>0?average:null;
}
function estimatedLapProgress(secondsSinceCrossing,expectedLapSeconds){
  const elapsed=Number(secondsSinceCrossing),expected=Number(expectedLapSeconds);
  if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(expected)||expected<=0)return null;
  return Math.max(0,Math.min(99.5,elapsed/expected*100));
}
function secondsSinceLastCrossing(snapshot,driver){
  if(!snapshot||!driver||!normalize(snapshot.raceState).includes('RUN'))return null;
  const current=timeSeconds(snapshot.currentTime),completed=timeSeconds(driver.total);
  if(current==null||completed==null)return null;
  const elapsed=current-completed;
  return Number.isFinite(elapsed)&&elapsed>=0?elapsed:null;
}
function battleGroups(drivers,thresholdSeconds=2){
  const threshold=Number(thresholdSeconds),ordered=(drivers||[]).slice().sort((a,b)=>Number(a.position)-Number(b.position)),groups=[];let active=null;
  if(!Number.isFinite(threshold)||threshold<=0)return groups;
  for(let index=1;index<ordered.length;index++){
    const ahead=ordered[index-1],behind=ordered[index],gap=gapSeconds(behind.gapPrevious),sameLap=samePhysicalLap(ahead,behind),close=sameLap&&gap!=null&&gap<=threshold;
    if(close){
      if(!active){active={startPosition:Number(ahead.position),endPosition:Number(behind.position),drivers:[ahead,behind],gaps:[gap]};}
      else{active.endPosition=Number(behind.position);active.drivers.push(behind);active.gaps.push(gap);}
    }else if(active){groups.push({...active,spanSeconds:active.gaps.reduce((sum,value)=>sum+value,0)});active=null;}
  }
  if(active)groups.push({...active,spanSeconds:active.gaps.reduce((sum,value)=>sum+value,0)});
  return groups;
}
function battleDriverId(driver){return String(driver&&driver.key||normalize(driver&&driver.name)||'');}
function samePhysicalLap(ahead,behind){
  const aheadDistance=Number(ahead&&ahead.replayDistance),behindDistance=Number(behind&&behind.replayDistance);
  if(Number.isFinite(aheadDistance)&&Number.isFinite(behindDistance))return Math.abs(aheadDistance-behindDistance)<1;
  return Number(ahead&&ahead.laps)>0&&Number(ahead&&ahead.laps)===Number(behind&&behind.laps);
}
function battleNarrativeTransitions(drivers,groups,previousState={},elapsedSeconds=0,releaseThresholdSeconds=3){
  const elapsed=Math.max(0,Number(elapsedSeconds)||0),release=Math.max(2,Number(releaseThresholdSeconds)||3),ordered=(drivers||[]).slice().sort((a,b)=>Number(a.position)-Number(b.position)),byId=new Map(ordered.map(driver=>[battleDriverId(driver),driver])),state={...previousState},events=[],activeKeys=new Set();
  for(const group of groups||[])for(let index=1;index<group.drivers.length;index++){
    const ahead=group.drivers[index-1],behind=group.drivers[index],aheadId=battleDriverId(ahead),behindId=battleDriverId(behind),key=[aheadId,behindId].sort().join('|'),gap=gapSeconds(behind.gapPrevious);
    if(!key||gap==null)continue;activeKeys.add(key);const previous=state[key];
    if(!previous){state[key]={aheadId,behindId,initialGap:gap,minGap:gap,continued:false,resolved:'',startedAt:elapsed,lastSeenAt:elapsed};events.push({type:'start',key,ahead,behind,position:Number(ahead.position),gap});continue;}
    if(previous.aheadId!==aheadId&&!previous.resolved){events.push({type:'pass',key,ahead,behind,position:Number(ahead.position),gap});state[key]={...previous,aheadId,behindId,minGap:Math.min(previous.minGap,gap),resolved:'pass',lastSeenAt:elapsed};continue;}
    const meaningfulGain=Math.max(.15,previous.initialGap*.2),continued=!previous.resolved&&!previous.continued&&gap<=previous.initialGap-meaningfulGain;
    if(continued)events.push({type:'continue',key,ahead,behind,position:Number(ahead.position),gap,fromGap:previous.initialGap});
    state[key]={...previous,aheadId,behindId,minGap:Math.min(previous.minGap,gap),continued:previous.continued||continued,lastSeenAt:elapsed};
  }
  for(const [key,previous] of Object.entries(state)){
    if(activeKeys.has(key))continue;const first=byId.get(previous.aheadId),second=byId.get(previous.behindId);if(!first||!second){delete state[key];continue;}
    const [ahead,behind]=Number(first.position)<Number(second.position)?[first,second]:[second,first],swapped=battleDriverId(ahead)!==previous.aheadId,adjacent=Math.abs(Number(first.position)-Number(second.position))===1,gap=adjacent?gapSeconds(behind.gapPrevious):null;
    if(!previous.resolved&&swapped){events.push({type:'pass',key,ahead,behind,position:Number(ahead.position),gap});delete state[key];continue;}
    if(!previous.resolved&&adjacent&&samePhysicalLap(ahead,behind)&&gap!=null&&gap>=release){events.push({type:'held',key,ahead,behind,position:Number(ahead.position),gap});delete state[key];continue;}
    if(previous.resolved||elapsed-previous.lastSeenAt>=30)delete state[key];
  }
  return {state,events};
}
function hasPreviousChampionshipResults(seed){
  return Boolean(seed&&Array.isArray(seed.pilots)&&seed.pilots.some(pilot=>Array.isArray(pilot.history)&&pilot.history.some(position=>position!==null&&position!==''&&Number.isFinite(Number(position))&&Number(position)>0)));
}
function gridPositionLabel(index){
  if(index===0)return 'Pole';
  const labels=['segunda','tercera','cuarta','quinta','sexta','séptima','octava','novena','décima','undécima','duodécima','decimotercera','decimocuarta','decimoquinta','decimosexta'];
  return labels[index-1]?`${labels[index-1]} posición`:`posición ${index+1}`;
}
function startingGridNarrative(drivers,chunkSize=5){
  const ordered=(drivers||[]).filter(driver=>driver&&driver.name).slice().sort((a,b)=>(Number(a.position)||Infinity)-(Number(b.position)||Infinity));
  const size=Math.max(1,Number(chunkSize)||5),chunks=[];
  for(let offset=0;offset<ordered.length;offset+=size){
    const entries=ordered.slice(offset,offset+size).map((driver,index)=>`${gridPositionLabel(offset+index)}, ${driver.name}`);
    if(entries.length)chunks.push(`${offset===0?'Parrilla de salida. ':'Continúa la parrilla. '}${entries.join('. ')}.`);
  }
  return chunks;
}
function normalizeEvent(message){
  const event=message&&message.EVENT;
  if(!event||!event.METADATA)return null;
  const metadata=event.METADATA;
  const drivers=(Array.isArray(event.DATA)?event.DATA:[]).map((row,index)=>({
    key:String(row.TRANSPONDER||row.PILOT||index),position:Number(row.INDEX)||index+1,start:Number(row.VEHICLE)||null,
    number:row.PILOTNUMBER??'',name:String(row.PILOT||[row.LASTNAME,row.FIRSTNAME].filter(Boolean).join(' ')),
    firstName:String(row.FIRSTNAME||''),lastName:String(row.LASTNAME||''),transponder:String(row.TRANSPONDER||''),
    laps:Number(row.LAPS)||0,lastLap:String(row.LAPTIME||''),lastLapSeconds:timeSeconds(row.LAPTIME),
    total:String(row.ABSOLUTTIME||''),best:String(row.BESTTIME||''),bestSeconds:timeSeconds(row.BESTTIME),
    average:String(row.MEDIUMTIME||''),averageSeconds:timeSeconds(row.MEDIUMTIME),forecast:String(row.FORECAST||''),
    gapFirst:String(row.DELAYTIMEFIRST||''),gapPrevious:String(row.DELAYTIMEPREVIOUS||''),
    trend:Number(row.TREND)||0,positionChange:Number(row.POSITIONIMPROVEMENT)||0,stateColor:Number(row.COLOR)||0,
    progress:Number(row.PROGRESS)||0
  })).sort((a,b)=>a.position-b.position);
  return {
    name:String(metadata.NAME||''),section:String(metadata.SECTIONNAME||metadata.SECTIONCODE||metadata.SECTION||''),
    sectionCode:String(metadata.SECTIONCODE||''),category:categoryFromMetadata(metadata),group:String(metadata.GROUP||''),
    groupKey:metadata.GROUPKEY??null,raceState:String(metadata.RACESTATE||''),raceTime:String(metadata.RACETIME_SHORT||metadata.RACETIME||''),
    currentTime:String(metadata.CURRENTTIME_SHORT||metadata.CURRENTTIME||''),remaining:String(metadata.REMAININGTIME_SHORT||metadata.REMAININGTIME||''),
    countdown:String(metadata.COUNTDOWN_SHORT||metadata.COUNTDOWN||''),percentage:Number(metadata.PERCENTAGE)||0,
    update:String(event.UPDATE||''),connections:Number(event.CONNECTIONS)||0,drivers
  };
}
function enrichDrivers(snapshot,pilots){
  const times=snapshot.drivers.map(d=>d.averageSeconds||d.bestSeconds).filter(Boolean);
  const quickest=times.length?Math.min(...times):null,slowest=times.length?Math.max(...times):null;
  return snapshot.drivers.map(driver=>{
    const matched=matchPilot(driver.name,pilots);
    const paceTime=driver.averageSeconds||driver.bestSeconds;
    const pace=paceTime&&quickest?Math.max(8,Math.min(100,100-(paceTime-quickest)/Math.max(.001,(slowest||quickest)-quickest)*68)):0;
    return {...driver,matchedPilot:matched||null,pace};
  });
}
function stateFromSnapshot(engine,seed,snapshot){
  const state=engine.createState(seed);
  const enriched=enrichDrivers(snapshot,state.pilots);
  const occupied=new Set();
  state.pilots.forEach(p=>{p.position='';if(snapshot.authoritativeRoster)p.active=false;});
  enriched.forEach(driver=>{
    const pilot=driver.matchedPilot&&state.pilots.find(p=>p.id===driver.matchedPilot.id);
    if(pilot&&!occupied.has(driver.position)){
      pilot.active=true;pilot.qualifying=true;pilot.position=String(driver.position);occupied.add(driver.position);
    }
  });
  enriched.forEach((driver,index)=>{
    if(driver.matchedPilot||occupied.has(driver.position))return;
    state.pilots.push({
      id:`custom-live-${index}-${normalize(driver.name).toLowerCase().replace(/\s+/g,'-').slice(0,60)}`,
      name:driver.name,shortName:driver.name,history:Array((seed.rules&&seed.rules.totalRounds||3)-1).fill(null),
      baselineTotal:0,baselineRank:null,originalToday:false,entryRank:null,category:'Invitado MyRCM',
      licenseNote:'Piloto recibido desde MyRCM',eligible:'no',favorite:false,historicalSource:'MyRCM Live Timing',
      active:true,qualifying:true,noClassification:false,position:String(driver.position),pointsOverride:'',custom:true,livePlaceholder:true
    });
    occupied.add(driver.position);
  });
  return {state,enriched};
}
function provisionalSeed(seed,categoryData){
  const output=JSON.parse(JSON.stringify(seed));
  const entrants=Array.isArray(categoryData&&categoryData.entrants)?categoryData.entrants:[];
  const registrationIdentity=value=>normalize(value).replace(/\b(?:40|JUN)\b/g,'').replace(/\s+/g,' ').trim();
  output.rosterMode='aecar-open-provisional';
  output.registrationSnapshot={
    capturedAt:categoryData&&categoryData.capturedAt||'',
    closesAt:categoryData&&categoryData.closesAt||'',
    sourceUrl:categoryData&&categoryData.sourceUrl||'',
    total:entrants.length
  };
  output.pilots.forEach(pilot=>{pilot.originalToday=false;});
  entrants.forEach((entry,index)=>{
    let pilot=output.pilots.find(item=>registrationIdentity(item.name)===registrationIdentity(entry.name));
    const eligibility='yes';
    const note=`Preinscripción AECAR ${entry.sourceStatus==='confirmed'?'confirmada':'por confirmar'} · licencia ${entry.licenceStatus||'sin dato'} · captura provisional`;
    if(!pilot){
      const slug=normalize(entry.name).toLowerCase().replace(/\s+/g,'-').slice(0,72)||`piloto-${index+1}`;
      pilot={
        id:`aecar-${slug}`,name:entry.name,shortName:entry.name.replace(/\s*\((?:\+?40|JUN)\)\s*/gi,' ').trim(),
        history:Array((seed.rules&&seed.rules.totalRounds||3)-1).fill(null),baselineTotal:0,baselineRank:null,
        originalToday:true,entryRank:entry.rank===999?null:entry.rank,category:'Preinscripción AECAR',eligible:eligibility,
        licenseNote:note,favorite:false,historicalSource:categoryData.sourceUrl||'AECAR',historyNotes:'',provisionalEntry:true,
        registrationStatus:entry.sourceStatus,registrationZone:entry.zone||''
      };
      output.pilots.push(pilot);
    }else{
      pilot.originalToday=true;pilot.entryRank=entry.rank===999?pilot.entryRank:entry.rank;pilot.licenseNote=note;
      pilot.provisionalEntry=true;pilot.registrationStatus=entry.sourceStatus;pilot.registrationZone=entry.zone||'';
      pilot.eligible='yes';
    }
  });
  return output;
}
function raceStateLabel(value){
  const state=normalize(value);
  if(state.includes('RUN'))return 'En carrera';
  if(state.includes('FINISH'))return 'Finalizada';
  if(state.includes('WAIT')||state.includes('IDLE'))return 'En espera';
  if(state.includes('PAUSE'))return 'Pausada';
  return value||'Conectado';
}
function phaseFromGroup(value){
  const group=normalize(value);
  if(/\b(QUARTER|QUARTERFINAL|CUARTO|1 4)\b/.test(group))return 'Cuartos';
  if(/\b(SEMI|SEMIFINAL|1 2)\b/.test(group))return 'Semifinales';
  if(/\b(FINAL|FINALS)\b/.test(group))return 'Finales';
  if(/\b(QUALY|QUALIFY|QUALIFYING|CLASIFICATORIA)\b/.test(group))return 'Clasificación';
  if(/\b(PRACTICE|PRACTICA|ENTRENAMIENTO)\b/.test(group))return 'Entrenamientos';
  return value||'Manga activa';
}
return {normalize,tokens,matchPilot,categoryFromMetadata,timeSeconds,averageSpeedKmh,distanceKm,gapSeconds,median,cleanLapEstimate,estimatedLapProgress,secondsSinceLastCrossing,battleGroups,battleNarrativeTransitions,hasPreviousChampionshipResults,startingGridNarrative,normalizeEvent,enrichDrivers,stateFromSnapshot,provisionalSeed,raceStateLabel,phaseFromGroup};
});
