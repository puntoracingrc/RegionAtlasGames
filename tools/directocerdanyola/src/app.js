'use strict';
(()=>{
const E=window.RaceDeskEngine,S=window.RaceDeskScenarios,B=window.RaceDeskBroadcast,L=window.CerdanyolaLiveCore,D=window.CerdanyolaReplayCore,P=window.CerdanyolaPitAnalysis,R=window.CerdanyolaRules;
const baseSeeds=JSON.parse(document.getElementById('seedData').textContent),historyData=JSON.parse(document.getElementById('historyData').textContent),registrationsData=JSON.parse(document.getElementById('registrationsData').textContent),trackData=JSON.parse(document.getElementById('trackData').textContent),pitProfilesData=JSON.parse(document.getElementById('pitProfilesData').textContent),builtInReplayData=JSON.parse(document.getElementById('demoReplayData').textContent),$=id=>document.getElementById(id);
const seeds=Object.fromEntries(Object.entries(baseSeeds).map(([key,seed])=>[key,L.provisionalSeed(seed,{...registrationsData.categories[key],capturedAt:registrationsData.capturedAt})]));
const historyPilots=[...new Set(historyData.championshipPodiums.flatMap(entry=>entry.podium))].map((name,index)=>({id:`history-${index}`,name,shortName:name}));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ordinal=value=>`${value}.º`,range=(a,b)=>a===b?ordinal(a):`${ordinal(a)}–${ordinal(b)}`;
const decimal=(value,digits=1)=>Number(value).toLocaleString('es-ES',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const svgNs='http://www.w3.org/2000/svg';
const numberAttribute=(node,name)=>Number(node&&node.getAttribute(name))||0;
function captureCircuit(base=trackData){
  const svg=$('trackMap'),start=svg.querySelector('.start-grid'),startLabel=start&&start.querySelector('text'),timing=svg.querySelector('.timing-line'),timingLine=timing&&timing.querySelector('line'),timingLabel=timing&&timing.querySelector('text'),pit=svg.querySelector('.pit-lane');
  return {id:String(base.id||base.slug||'cerdanyola'),name:String(base.circuit||base.name||'Circuito'),lapLengthMeters:Number(base.lapLengthMeters)||1,precisionNote:String(base.precisionNote||''),map:{viewBox:svg.getAttribute('viewBox')||'0 0 1000 390',title:$('trackMapSvgTitle').textContent||'',description:$('trackMapSvgDesc').textContent||'',guidePath:$('circuitGuide').getAttribute('d')||'',infieldPaths:[...svg.querySelectorAll('.track-infields path')].map(path=>path.getAttribute('d')||'').filter(Boolean),pitPath:pit&&pit.querySelector('path')&&pit.querySelector('path').getAttribute('d')||'',pitLabels:pit?[...pit.querySelectorAll('text')].map(label=>({x:numberAttribute(label,'x'),y:numberAttribute(label,'y'),text:label.textContent||''})):[],startGrid:start?{transform:start.getAttribute('transform')||'',lines:[...start.querySelectorAll('line')].map(line=>({x1:numberAttribute(line,'x1'),y1:numberAttribute(line,'y1'),x2:numberAttribute(line,'x2'),y2:numberAttribute(line,'y2')})),label:{x:numberAttribute(startLabel,'x'),y:numberAttribute(startLabel,'y'),text:startLabel&&startLabel.textContent||''}}:null,directionPaths:[...svg.querySelectorAll('.direction-guide path')].map(path=>path.getAttribute('d')||'').filter(Boolean),timingLine:timing?{transform:timing.getAttribute('transform')||'',x1:numberAttribute(timingLine,'x1'),y1:numberAttribute(timingLine,'y1'),x2:numberAttribute(timingLine,'x2'),y2:numberAttribute(timingLine,'y2'),labelX:numberAttribute(timingLabel,'x'),labelY:numberAttribute(timingLabel,'y'),label:timingLabel&&timingLabel.textContent||''}:null}};
}
function svgElement(name,attributes={}){const node=document.createElementNS(svgNs,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
function applyCircuit(circuit){
  if(!circuit||!circuit.map||!circuit.map.guidePath)return;activeCircuit=circuit;const map=circuit.map,svg=$('trackMap');svg.setAttribute('viewBox',map.viewBox||'0 0 1000 390');$('trackMapSvgTitle').textContent=map.title||circuit.name;$('trackMapSvgDesc').textContent=map.description||`Trazado archivado de ${circuit.name}.`;$('circuitGuide').setAttribute('d',map.guidePath);
  const infields=svg.querySelector('.track-infields');infields.replaceChildren(...(map.infieldPaths||[]).map(d=>svgElement('path',{d})));
  const pit=svg.querySelector('.pit-lane'),pitPaths=pit?[...pit.querySelectorAll('path')]:[];pitPaths.forEach(path=>path.setAttribute('d',map.pitPath||''));if(pit){[...pit.querySelectorAll('text')].forEach(node=>node.remove());for(const label of map.pitLabels||[]){const node=svgElement('text',{x:label.x,y:label.y});node.textContent=label.text||'';pit.append(node);}}
  const start=svg.querySelector('.start-grid');if(start){start.setAttribute('transform',map.startGrid&&map.startGrid.transform||'');start.replaceChildren();for(const line of map.startGrid&&map.startGrid.lines||[])start.append(svgElement('line',line));if(map.startGrid&&map.startGrid.label){const node=svgElement('text',{x:map.startGrid.label.x,y:map.startGrid.label.y,'text-anchor':'middle'});node.textContent=map.startGrid.label.text||'';start.append(node);}}
  const directions=svg.querySelector('.direction-guide');directions.replaceChildren(...(map.directionPaths||[]).map(d=>svgElement('path',{d,'marker-end':'url(#directionArrow)'})));
  const timing=svg.querySelector('.timing-line');if(timing){timing.replaceChildren();if(map.timingLine){timing.setAttribute('transform',map.timingLine.transform||'');timing.append(svgElement('line',{x1:map.timingLine.x1,y1:map.timingLine.y1,x2:map.timingLine.x2,y2:map.timingLine.y2}));const node=svgElement('text',{x:map.timingLine.labelX,y:map.timingLine.labelY,'text-anchor':'end'});node.textContent=map.timingLine.label||'TRANSPONDER';timing.append(node);}}
  trackMotionProfile=null;const reference=$('trackReference');reference.textContent=`Cuerda estimada: ${decimal(circuit.lapLengthMeters,2)} m · velocidades y distancias orientativas`;reference.title=circuit.precisionNote||'';
}
const defaultCircuit=captureCircuit(trackData);let activeCircuit=defaultCircuit;
let demoReplay=D.prepareReplay({...builtInReplayData,circuit:defaultCircuit});
const battleThresholdSeconds=2;
const speedLabel=seconds=>{const value=L.averageSpeedKmh(seconds,activeCircuit.lapLengthMeters);return value==null?'—':`${decimal(value,1)} km/h`;};
const distanceLabel=laps=>{const value=L.distanceKm(laps,activeCircuit.lapLengthMeters);return value==null?'—':`${decimal(value,2)} km`;};
let category='ECO',socket=null,shouldReconnect=false,reconnectTimer=null,rankingTimer=null,pitClock=null,lapClock=null,lastRankingFetch=0,paused=false,queuedSnapshot=null,snapshot=null,enriched=[],officialRanking=[],officialRuns=[],officialSectionKey='',officialFinalComplete=false,rankingStatus='pending',projectedState=null,result=null,possibilityResult=null,broadcast=null,toastTimer=null,scenarioCache=new Map(),incidents=[],pitReportBusy=false,demoMode=false,demoStartedAt=0,demoElapsedBase=0,demoSpeed=1,demoPlaying=false,demoCountdownTimer=null,demoCountdownValue=0,demoFrameProgress=new Map(),demoPreviousPositions=new Map(),demoSignature='',demoReturnState=null,demoHeavyAt=0,demoTimingAt=0,demoUiSecond=-1,fuelVisualAt=0,fastestLapFlashTimer=null,fastestLapActiveScope='',replayArchiveSummaries=[],archiveQueues=new Map(),archiveFlushTimer=null,archiveBusy=false,archiveLastSignature='',archiveSavedRace='',archiveFinalizedRace='',archiveReportFinalizedRace='',liveLowerPanel='general',liveNarrativeContext='',liveNarrativeEntries=[];
const liveNarrativeLast=new Map();
const fastestLapBaselines=new Map();
const pitStorageKey='puntoracing.directocerdanyola.pit-v1';
const mapCollapseKey='puntoracing.directocerdanyola.map-collapsed-v1';
const pitHistories=new Map(loadPitHistories());
const lapTrackers=new Map();
const trackColours=['#31dfca','#ffb536','#ff5875','#7da7ff','#c58cff','#7ee787','#ff8b52','#f2d96b','#70d7ff','#f78bd4','#a9b8ca','#ffffff'];
const trackColourAssignments=new Map();let nextTrackColour=0,trackMotionProfile=null;
const loadedPitReports=new Set([...pitHistories.values()].filter(record=>record.eventKey&&record.sectionKey&&record.reportKey).map(record=>[record.eventKey,record.sectionKey,record.reportKey].join('|')));
const urlEvent=new URLSearchParams(location.search).get('event');
if(/^\d{1,12}$/.test(urlEvent||''))$('eventKey').value=urlEvent;

function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function setConnection(state,label){$('connectionPill').dataset.state=state;$('connectionLabel').textContent=label;$('streamStatus').textContent=label;}
function setView(view){
  const next=view==='analysis'?'analysis':'live';document.body.dataset.view=next;
  document.querySelectorAll('[data-view-button]').forEach(button=>{const selected=button.dataset.viewButton===next;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));});
  window.scrollTo(0,0);
}
function setLiveLowerPanel(panel){
  liveLowerPanel=panel==='story'?'story':'general';const story=liveLowerPanel==='story';
  $('liveGeneralTab').classList.toggle('selected',!story);$('liveGeneralTab').setAttribute('aria-selected',String(!story));$('liveStoryTab').classList.toggle('selected',story);$('liveStoryTab').setAttribute('aria-selected',String(story));
  $('liveGeneralPanel').hidden=story;$('liveStoryPanel').hidden=!story;
}
function resetLiveNarrative(context=''){
  liveNarrativeContext=context;liveNarrativeEntries=[];liveNarrativeLast.clear();renderLiveNarrative();
}
function narrativeClock(){
  if(demoMode&&snapshot)return snapshot.currentTime||D.formatClock(demoCurrentElapsed());
  return new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function recordLiveNarrative(items){
  if(!snapshot||!enriched.length)return;const context=[demoMode?'replay':'live',$('eventKey').value.trim(),snapshot.sectionCode||snapshot.section,snapshot.groupKey||snapshot.group,category].join('|');
  if(context!==liveNarrativeContext)resetLiveNarrative(context);
  const now=Date.now();
  for(const item of items){
    if(!item||!item.text)continue;const previous=liveNarrativeLast.get(item.key),cooldown=Number(item.cooldown)||0;if(previous&&previous.text===item.text)continue;if(previous&&cooldown&&now-previous.at<cooldown)continue;
    liveNarrativeLast.set(item.key,{text:item.text,at:now});liveNarrativeEntries.push({kind:item.kind||'DIRECTO',text:item.text,time:narrativeClock(),lap:item.lap||0});
  }
  if(liveNarrativeEntries.length>80)liveNarrativeEntries.splice(0,liveNarrativeEntries.length-80);renderLiveNarrative();
}
function renderLiveNarrative(){
  $('liveStoryCount').textContent=String(liveNarrativeEntries.length);$('liveStoryStatus').textContent=liveNarrativeEntries.length?`${liveNarrativeEntries.length} apuntes de esta manga`:'Esperando la carrera';
  $('liveNarrativeFeed').innerHTML=liveNarrativeEntries.length?[...liveNarrativeEntries].reverse().map(item=>`<article class="live-story-entry"><time>${esc(item.time)}${item.lap?` · V${item.lap}`:''}</time><div><span>${esc(item.kind)}</span><p>${esc(item.text)}</p></div></article>`).join(''):'<div class="empty-compact">Las claves de la carrera aparecerán aquí en orden cronológico.</div>';
}
function setMapCollapsed(collapsed){
  const value=Boolean(collapsed),card=document.querySelector('.track-map-card');if(!card)return;
  card.dataset.collapsed=String(value);document.body.dataset.mapCollapsed=String(value);$('trackMapToggle').textContent=value?'+ Desplegar mapa':'− Contraer mapa';$('trackMapToggle').setAttribute('aria-expanded',String(!value));
  try{localStorage.setItem(mapCollapseKey,value?'1':'0');}catch{}
}
function toggleMap(){const card=document.querySelector('.track-map-card');setMapCollapsed(card&&card.dataset.collapsed!=='true');}
function archiveFrame(source){
  return {capturedAt:new Date().toISOString(),name:source.name||'',section:source.section||'',sectionCode:String(source.sectionCode||''),category:source.category==='ECO'?'ECO':source.category==='NITRO'?'NITRO':null,group:source.group||'',groupKey:String(source.groupKey||''),raceState:source.raceState||'',raceTime:source.raceTime||'',currentTime:source.currentTime||'',remaining:source.remaining||'',percentage:Number(source.percentage)||0,update:String(source.update||''),drivers:(source.drivers||[]).map(driver=>({key:String(driver.key||driver.name||''),position:Number(driver.position)||0,name:driver.name||'',laps:Number(driver.laps)||0,lastLap:driver.lastLap||'',lastLapSeconds:Number(driver.lastLapSeconds)||null,total:driver.total||'',best:driver.best||'',bestSeconds:Number(driver.bestSeconds)||null,average:driver.average||'',averageSeconds:Number(driver.averageSeconds)||null,gapFirst:driver.gapFirst||'',gapPrevious:driver.gapPrevious||'',trend:Number(driver.trend)||0,positionChange:Number(driver.positionChange)||0,stateColor:Number(driver.stateColor)||0,progress:Number(driver.progress)||0}))};
}
function archiveKey(source){return [source.sectionCode||source.section,source.groupKey||source.group].join('|');}
function archiveFrameSignature(frame){return [archiveKey(frame),frame.currentTime,frame.raceState,frame.update,...frame.drivers.map(driver=>`${driver.key}:${driver.position}:${driver.laps}:${driver.lastLap}`)].join('|');}
function archiveFrameFinished(frame){return /FINISH|COMPLET|FINALIZ/i.test(frame.raceState)||(/IDLE/i.test(frame.raceState)&&L.timeSeconds(frame.currentTime)===0&&frame.drivers.some(driver=>driver.laps>0));}
function queueRaceArchive(source){
  if(demoMode||!source||!source.drivers||!source.drivers.length)return;const eventKey=$('eventKey').value.trim();if(!/^\d{1,12}$/.test(eventKey))return;
  const frame=archiveFrame(source),signature=archiveFrameSignature(frame);if(signature===archiveLastSignature)return;archiveLastSignature=signature;
  const key=archiveKey(frame),queue=archiveQueues.get(key)||[];queue.push(frame);archiveQueues.set(key,queue.slice(-24));
  clearTimeout(archiveFlushTimer);const finished=archiveFrameFinished(frame);archiveFlushTimer=setTimeout(()=>void flushRaceArchives(finished?key:''),finished?100:7000);
}
async function postRaceArchive(payload,keepalive=false){
  const response=await fetch('/api/myrcm/archive',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),keepalive});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();
}
async function flushRaceArchives(completeKey=''){
  if(archiveBusy)return;const entries=[...archiveQueues.entries()];if(!entries.length&&!(completeKey&&snapshot))return;archiveBusy=true;clearTimeout(archiveFlushTimer);
  try{
    if(!entries.length&&completeKey&&snapshot)entries.push([completeKey,[archiveFrame(snapshot)]]);
    for(const [key,frames] of entries){
      if(!frames.length)continue;archiveQueues.delete(key);const complete=key===completeKey,payload={eventKey:$('eventKey').value.trim(),circuit:activeCircuit,frames,complete};
      try{const data=await postRaceArchive(payload,true);archiveSavedRace=data.archive&&data.archive.raceId||archiveSavedRace;if(complete&&archiveFinalizedRace!==key){archiveFinalizedRace=key;toast('Manga finalizada y guardada para su repetición.');}}
      catch(error){archiveQueues.set(key,[...(archiveQueues.get(key)||[]),...frames].slice(-24));console.warn('No se pudo archivar este tramo de la manga',error);}
    }
  }finally{archiveBusy=false;if(archiveQueues.size)archiveFlushTimer=setTimeout(()=>void flushRaceArchives(),9000);}
}
function switchCategory(next,{manual=false}={}){
  if(!seeds[next])return;if(manual&&demoMode)stopDemo(false);category=next;document.body.dataset.category=next;
  if(manual)resetLiveNarrative();
  if(!demoMode){document.querySelectorAll('.category-switch [data-category]').forEach(button=>{const selected=button.dataset.category===next;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));});$('demoTab').classList.remove('selected');$('demoTab').setAttribute('aria-selected','false');}
  scenarioCache.clear();
  if(manual&&snapshot&&snapshot.category&&snapshot.category!==next){officialRanking=[];officialRuns=[];officialFinalComplete=false;rankingStatus='category-mismatch';}
  if(manual&&snapshot)applySnapshot(snapshot,false);else{if(result)renderChampionship();renderRules();renderRegistrations();renderPitStrategy();}
}
function closeSocket(){shouldReconnect=false;clearTimeout(reconnectTimer);clearTimeout(rankingTimer);if(socket){socket.onclose=null;socket.close();socket=null;}}
function connect(){
  if(demoMode)stopDemo(false);
  const eventKey=$('eventKey').value.trim();
  if(!/^\d{1,12}$/.test(eventKey)){toast('El identificador de MyRCM debe contener solo números.',true);return;}
  closeSocket();resetLiveNarrative();officialRanking=[];officialRuns=[];officialSectionKey='';officialFinalComplete=false;rankingStatus='pending';lastRankingFetch=0;shouldReconnect=true;setConnection('connecting','Conectando con MyRCM');$('lastUpdate').textContent=`Evento ${eventKey} · abriendo canal público`;
  try{socket=new WebSocket('wss://www.myrcm.ch/websocket');}catch(error){setConnection('error','No se pudo abrir MyRCM');toast(error.message,true);return;}
  socket.onopen=()=>{setConnection('live','MyRCM conectado');socket.send(JSON.stringify({EventKey:eventKey,Language:'en',Format:'JSON'}));history.replaceState(null,'',`${location.pathname}?event=${encodeURIComponent(eventKey)}`);};
  socket.onmessage=event=>{try{const normalized=L.normalizeEvent(JSON.parse(event.data));if(!normalized)return;if(paused){queuedSnapshot=normalized;return;}applySnapshot(normalized,true);}catch(error){console.warn('Actualización MyRCM ignorada',error);}};
  socket.onerror=()=>setConnection('error','Error de conexión MyRCM');
  socket.onclose=()=>{socket=null;if(!shouldReconnect)return;setConnection('connecting','Reconectando con MyRCM');reconnectTimer=setTimeout(connect,3500);};
}
function applySnapshot(next,autoCategory){
  if(demoMode){queuedSnapshot=next;return;}
  recordLapSnapshot(next);
  recordPitSnapshot(next);
  queueRaceArchive(next);
  snapshot=next;
  if(autoCategory&&next.category&&next.category!==category)switchCategory(next.category);
  enriched=L.enrichDrivers(next,E.createState(seeds[category]).pilots);
  rebuildProjection();
  renderRaceHeader();renderTiming();renderMetrics();renderChampionship();renderBroadcast();renderScenarioSelector();renderStories();renderIntelligence();renderPhases();renderEventImpact();renderRules();renderHistory();renderRegistrations();renderPitStrategy();
  $('lastUpdate').textContent=`Actualizado ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · evento ${$('eventKey').value}`;
  setConnection(paused?'paused':'live',paused?'Pantalla pausada':'MyRCM conectado');
  scheduleRankingFetch();
}
function loadPitHistories(){try{const value=JSON.parse(localStorage.getItem(pitStorageKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function savePitHistories(){try{localStorage.setItem(pitStorageKey,JSON.stringify([...pitHistories.entries()].slice(-100)));}catch{}}
function pitHistoryKey(source,driver){return [$('eventKey').value.trim(),source.sectionCode||source.section,source.groupKey||source.group,P.normalize(driver.name)].join('|');}
function lapTrackerKey(source,driver){return [$('eventKey').value.trim(),source.sectionCode||source.section,source.groupKey||source.group,driver.key||L.normalize(driver.name)].join('|');}
function recordLapSnapshot(next){
  const now=Date.now(),running=L.normalize(next.raceState).includes('RUN');
  for(const driver of next.drivers){
    const key=lapTrackerKey(next,driver);let record=lapTrackers.get(key);
    if(!record||driver.laps<record.lastCompleted){record={lastCompleted:driver.laps,lastCrossingAt:null,lapTimes:[]};lapTrackers.set(key,record);}
    const gained=driver.laps-record.lastCompleted;
    if(gained===1&&driver.lastLapSeconds)record.lapTimes.push(driver.lastLapSeconds);
    if(record.lapTimes.length>16)record.lapTimes.splice(0,record.lapTimes.length-16);
    if(gained>0){record.lastCompleted=driver.laps;record.lastCrossingAt=now;}
    if(running){
      const elapsed=L.secondsSinceLastCrossing(next,driver),expected=L.cleanLapEstimate(record.lapTimes,driver.averageSeconds,driver.bestSeconds);
      if(elapsed!=null&&(!expected||elapsed<=expected*3))record.lastCrossingAt=now-elapsed*1000;
    }else record.lastCrossingAt=null;
  }
}
function lapProgressState(driver,now=Date.now()){
  if(demoMode)return demoFrameProgress.get(String(driver.key))||null;
  if(!snapshot||!L.normalize(snapshot.raceState).includes('RUN'))return null;
  const record=lapTrackers.get(lapTrackerKey(snapshot,driver));if(!record||!record.lastCrossingAt)return null;
  const expected=L.cleanLapEstimate(record.lapTimes,driver.averageSeconds,driver.bestSeconds),elapsed=Math.max(0,(now-record.lastCrossingAt)/1000),progress=L.estimatedLapProgress(elapsed,expected);
  if(progress==null)return null;const profile=P.profileForName(pitProfilesData.profiles,driver.name)||P.fallbackFuelProfile(expected,pitProfilesData.profiles),pitRecord=category==='NITRO'&&snapshot?pitHistories.get(pitHistoryKey(snapshot,driver)):null,lastStopLap=pitRecord&&(pitRecord.laps||[]).filter(item=>item.state==='pit').map(item=>item.lap).pop(),crossing=P.crossingStatus({profile,expectedSeconds:expected,completedLaps:driver.laps,lastStopLap,secondsSinceCrossing:elapsed,category}),refueling=crossing.state==='refueling',missingCrossing=crossing.state==='incident'||crossing.state==='off-track',hiddenAfterNoCrossing=crossing.state==='off-track';
  return {progress,elapsed,expected,delayed:elapsed>expected*1.12,refueling,crossingState:crossing.state,missingCrossing,hiddenAfterNoCrossing,visibleOnMap:!hiddenAfterNoCrossing,refuelStartSeconds:crossing.refuelStartSeconds,signalAlertSeconds:crossing.incidentSeconds,incidentDockSeconds:crossing.dockSeconds,inPitWindow:crossing.inPitWindow};
}
function trackColour(driver){const key=L.normalize(driver.name)||String(driver.key);if(!trackColourAssignments.has(key)){trackColourAssignments.set(key,trackColours[nextTrackColour%trackColours.length]);nextTrackColour++;}return trackColourAssignments.get(key);}
function driverInitials(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);if(!parts.length)return '?';
  return parts.slice(0,2).map(part=>part[0]).join('').toUpperCase();
}
function buildTrackMotionProfile(path){
  if(trackMotionProfile)return trackMotionProfile;
  const segmentCount=240,length=path&&path.getTotalLength?path.getTotalLength():0;if(!length)return null;
  const points=Array.from({length:segmentCount+1},(_,index)=>path.getPointAtLength(length*index/segmentCount));
  let speeds=Array.from({length:segmentCount},(_,index)=>{
    const previous=points[(index-2+segmentCount)%segmentCount],current=points[index],next=points[Math.min(segmentCount,index+2)];
    const ax=current.x-previous.x,ay=current.y-previous.y,bx=next.x-current.x,by=next.y-current.y,al=Math.hypot(ax,ay)||1,bl=Math.hypot(bx,by)||1;
    const angle=Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/(al*bl))));
    return D.clamp(1.42-angle*3.8,.42,1.42);
  });
  for(let pass=0;pass<3;pass++)speeds=speeds.map((_,index)=>{let total=0;for(let offset=-3;offset<=3;offset++)total+=speeds[(index+offset+segmentCount)%segmentCount];return total/7;});
  for(let pass=0;pass<2;pass++){
    for(let index=1;index<segmentCount;index++)speeds[index]=Math.min(speeds[index],speeds[index-1]+.055);
    for(let index=segmentCount-2;index>=0;index--)speeds[index]=Math.min(speeds[index],speeds[index+1]+.085);
  }
  trackMotionProfile=D.motionTimeline(speeds);return trackMotionProfile;
}
function pacedTrackProgress(progress,path){const profile=buildTrackMotionProfile(path);return profile?D.pacedProgress(progress,profile):progress;}
function demoCurrentElapsed(now=Date.now()){
  if(!demoMode)return 0;
  return Math.min(demoReplay.durationSeconds,demoElapsedBase+(demoPlaying?(now-demoStartedAt)/1000*demoSpeed:0));
}
function demoSnapshotFromFrame(frame){
  const previous=demoPreviousPositions;
  const drivers=frame.drivers.map(driver=>({...driver,positionChange:previous.has(driver.key)?previous.get(driver.key)-driver.position:0}));
  const replayCategory=demoReplay.category==='ECO'?'ECO':'NITRO';
  return {name:demoReplay.eventName||'Carrera archivada',section:demoReplay.sectionName||`GT8 ${replayCategory}`,sectionCode:demoReplay.sectionKey||'',category:replayCategory,group:demoReplay.label||demoReplay.group||'Repetición',groupKey:demoReplay.reportKey||'',raceState:frame.finished?'FINISHED':'RUNNING',raceTime:D.formatClock(frame.durationSeconds),currentTime:D.formatClock(frame.elapsed),remaining:D.formatClock(Math.max(0,frame.scheduledSeconds-frame.elapsed)),countdown:'',percentage:frame.percentage,update:'REPLAY',connections:0,drivers};
}
function replayTotalLaps(){return demoReplay.drivers.reduce((sum,driver)=>sum+Number(driver.finalLaps||driver.crossings&&driver.crossings.length||0),0);}
function replayReportUrl(){
  if(demoReplay.sourceUrl)return demoReplay.sourceUrl;
  if(!demoReplay.eventKey||!demoReplay.sectionKey||!demoReplay.reportKey)return '';
  const query=new URLSearchParams({reportKey:String(demoReplay.reportKey),reportType:String(demoReplay.reportType||'final')});return `https://www.myrcm.ch/en/report/${encodeURIComponent(demoReplay.eventKey)}/${encodeURIComponent(demoReplay.sectionKey)}?${query}`;
}
function updateReplayMeta(){
  const label=demoReplay.label||demoReplay.group||'Carrera archivada',eventKey=demoReplay.eventKey||$('eventKey').value.trim(),eventName=demoReplay.eventName||'Jornada archivada';$('demoRaceLabel').textContent=`${eventName} · ${label} · MyRCM ${eventKey}`;
  const link=replayReportUrl();$('demoReportLink').hidden=!link;if(link)$('demoReportLink').href=link;
}
function updateDemoControls(frame){
  if(!demoMode)return;
  const elapsed=frame?frame.elapsed:demoCurrentElapsed(),finished=elapsed>=demoReplay.durationSeconds;
  $('demoClockSummary').textContent=`${D.formatClock(elapsed)} / ${D.formatClock(demoReplay.durationSeconds)} · ${Math.round(elapsed/Math.max(1,demoReplay.durationSeconds)*100)}%`;
  $('demoPlayPause').textContent=demoCountdownValue?'Cancelar':finished?'▶ Repetir':demoPlaying?'❚❚ Pausar':elapsed>0?'▶ Continuar':'▶ Reproducir';
  $('demoSpeed').value=String(demoSpeed);$('demoSeek').max=String(demoReplay.durationSeconds);$('demoSeek').value=String(elapsed);$('demoSeekElapsed').textContent=D.formatClock(elapsed);$('demoSeekDuration').textContent=D.formatClock(demoReplay.durationSeconds);
}
function cancelDemoCountdown(){
  clearInterval(demoCountdownTimer);demoCountdownTimer=null;demoCountdownValue=0;$('demoCountdown').hidden=true;if(demoMode)updateDemoControls();
}
function resetDemoTimeline({clearStory=true}={}){
  cancelDemoCountdown();resetFastestLapWatcher('demo');demoElapsedBase=0;demoStartedAt=0;demoPlaying=false;demoSignature='';demoPreviousPositions.clear();demoFrameProgress.clear();demoHeavyAt=0;demoTimingAt=0;demoUiSecond=-1;fuelVisualAt=0;if(clearStory)resetLiveNarrative();
}
function beginDemoPlayback(){
  cancelDemoCountdown();demoStartedAt=Date.now();demoPlaying=true;setConnection('live','Reproduciendo carrera');updateDemoControls();
}
function startDemoCountdown(){
  cancelDemoCountdown();demoCountdownValue=3;$('demoCountdownValue').textContent='3';$('demoCountdown').hidden=false;setConnection('paused','La repetición empieza en 3…');updateDemoControls();
  demoCountdownTimer=setInterval(()=>{demoCountdownValue-=1;if(demoCountdownValue<=0){beginDemoPlayback();return;}$('demoCountdownValue').textContent=String(demoCountdownValue);setConnection('paused',`La repetición empieza en ${demoCountdownValue}…`);updateDemoControls();},1000);
}
function renderDemoFrame(force=false){
  if(!demoMode)return;
  const now=Date.now(),frame=D.frame(demoReplay,demoCurrentElapsed(now)),nextSnapshot=demoSnapshotFromFrame(frame);
  demoFrameProgress=new Map(frame.drivers.map(driver=>{
    const expected=driver.averageSeconds||driver.bestSeconds||driver.currentLapSeconds||20,profile=P.profileForName(pitProfilesData.profiles,driver.name)||P.fallbackFuelProfile(expected,pitProfilesData.profiles),confirmedStops=profile&&profile.evidenceStopLaps||[],lastStopLap=confirmedStops.filter(lap=>lap<=driver.laps).at(-1),since=driver.sinceLastCrossing||0,potentialLoss=driver.missingCrossing||driver.hiddenAfterNoCrossing,crossing=P.crossingStatus({profile,expectedSeconds:expected,completedLaps:driver.laps,lastStopLap,secondsSinceCrossing:since,category}),refueling=crossing.state==='refueling',missingCrossing=potentialLoss&&(crossing.state==='incident'||crossing.state==='off-track'),hiddenAfterNoCrossing=potentialLoss&&crossing.state==='off-track';
    return [String(driver.key),{progress:driver.progress,elapsed:since,expected,delayed:false,demo:true,startPhase:driver.startPhase,visibleOnMap:driver.laps>0&&!hiddenAfterNoCrossing,startDelaySeconds:driver.startDelaySeconds,delayedStart:driver.delayedStart,startDelayActive:driver.startDelayActive,didNotStart:driver.didNotStart,sinceLastCrossing:since,refueling,crossingState:crossing.state,refuelStartSeconds:crossing.refuelStartSeconds,signalAlertSeconds:crossing.incidentSeconds,incidentDockSeconds:crossing.dockSeconds,inPitWindow:crossing.inPitWindow,missingCrossing,hiddenAfterNoCrossing}];
  }));
  snapshot=nextSnapshot;enriched=L.enrichDrivers(snapshot,E.createState(seeds[category]).pilots);
  const signature=enriched.map(driver=>{const state=demoFrameProgress.get(String(driver.key));return `${driver.key}:${driver.position}:${driver.laps}:${driver.lastLap}:${Boolean(state&&state.startDelayActive)}:${Boolean(state&&state.didNotStart)}:${Boolean(state&&state.refueling)}:${Boolean(state&&state.missingCrossing)}:${Boolean(state&&state.hiddenAfterNoCrossing)}`;}).join('|');
  if(force||(signature!==demoSignature&&now-demoTimingAt>=500)){
    renderTiming();renderMetrics();demoSignature=signature;demoTimingAt=now;
    demoPreviousPositions=new Map(enriched.map(driver=>[driver.key,driver.position]));
  }else updateLapVisuals();
  if(force){
    rebuildProjection();renderMetrics();renderChampionship();renderBroadcast();renderScenarioSelector();renderStories();renderIntelligence();renderPhases();renderEventImpact();renderRules();renderHistory();renderRegistrations();renderPitStrategy();demoHeavyAt=now;
  }else if(now-demoHeavyAt>=10000){
    rebuildProjection();renderMetrics();renderChampionship();renderBroadcast();renderStories();renderIntelligence();renderEventImpact();demoHeavyAt=now;
  }
  const uiSecond=Math.floor(frame.elapsed);if(force||uiSecond!==demoUiSecond){renderRaceHeader();updateDemoControls(frame);$('lastUpdate').textContent=`Repetición MyRCM · ${frame.drivers.reduce((sum,driver)=>sum+driver.laps,0)} vueltas contabilizadas de ${replayTotalLaps()}`;demoUiSecond=uiSecond;}
  if(frame.finished&&demoPlaying){demoElapsedBase=demoReplay.durationSeconds;demoPlaying=false;demoStartedAt=0;updateDemoControls(frame);setConnection('paused','Repetición finalizada');}
}
function toggleDemoPlayback(){
  if(!demoMode)return;
  if(demoCountdownValue){cancelDemoCountdown();setConnection('paused','Repetición preparada');return;}
  if(demoCurrentElapsed()>=demoReplay.durationSeconds){restartDemo();startDemoCountdown();return;}
  if(demoPlaying){demoElapsedBase=demoCurrentElapsed();demoPlaying=false;demoStartedAt=0;setConnection('paused','Repetición pausada');}
  else startDemoCountdown();
  updateDemoControls();
}
function restartDemo(){if(!demoMode)return;resetDemoTimeline();setConnection('paused','Repetición preparada');renderDemoFrame(true);}
function setDemoSpeed(value){if(!demoMode)return;demoElapsedBase=demoCurrentElapsed();demoStartedAt=demoPlaying?Date.now():0;demoSpeed=[1,4,10].includes(Number(value))?Number(value):1;renderDemoFrame(true);}
function seekDemo(value){
  if(!demoMode)return;cancelDemoCountdown();demoElapsedBase=Math.max(0,Math.min(demoReplay.durationSeconds,Number(value)||0));demoStartedAt=demoPlaying?Date.now():0;if(demoElapsedBase>=demoReplay.durationSeconds){demoPlaying=false;demoStartedAt=0;}demoSignature='';demoPreviousPositions.clear();demoFrameProgress.clear();demoHeavyAt=0;demoTimingAt=0;demoUiSecond=-1;fuelVisualAt=0;resetLiveNarrative();renderDemoFrame(true);
}
function stopDemo(refresh=true){
  if(!demoMode)return;
  cancelDemoCountdown();clearFastestLapFlash();fastestLapActiveScope='';
  const saved=demoReturnState;demoMode=false;demoPlaying=false;demoStartedAt=0;demoElapsedBase=0;demoFrameProgress.clear();demoPreviousPositions.clear();demoSignature='';demoHeavyAt=0;demoTimingAt=0;demoUiSecond=-1;demoReturnState=null;$('demoControls').hidden=true;$('demoTab').classList.remove('selected');$('demoTab').setAttribute('aria-selected','false');
  if(saved){category=saved.category;document.body.dataset.category=category;snapshot=saved.snapshot;enriched=saved.enriched;officialRanking=saved.officialRanking;officialRuns=saved.officialRuns;officialSectionKey=saved.officialSectionKey;officialFinalComplete=saved.officialFinalComplete;rankingStatus=saved.rankingStatus;projectedState=saved.projectedState;result=saved.result;possibilityResult=saved.possibilityResult;broadcast=saved.broadcast;applyCircuit(saved.circuit||defaultCircuit);}
  document.querySelectorAll('.category-switch [data-category]').forEach(button=>{const selected=button.dataset.category===category;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));});
  if(!refresh)return;
  if(queuedSnapshot){const next=queuedSnapshot;queuedSnapshot=null;applySnapshot(next,true);return;}
  if(snapshot){renderRaceHeader();renderTiming();renderMetrics();renderChampionship();renderBroadcast();renderScenarioSelector();renderStories();renderIntelligence();renderPhases();renderEventImpact();renderRules();renderHistory();renderRegistrations();renderPitStrategy();scheduleRankingFetch();}
}
function replayOptionLabel(summary){const state=summary.status==='complete'?'Finalizada':'En curso';return `${summary.category||'GT8'} · ${summary.section||'Categoría'} · ${summary.group||'Manga'} · ${state}`;}
async function refreshReplayArchiveOptions(){
  const eventKey=$('eventKey').value.trim(),select=$('archiveRaceSelect');replayArchiveSummaries=[];select.innerHTML='';
  if(eventKey==='100645'){const option=document.createElement('option');option.value='builtin';option.textContent='Final Nitro · archivo original';select.append(option);}
  try{const response=await fetch(`/api/myrcm/archive?event=${encodeURIComponent(eventKey)}`,{headers:{Accept:'application/json'}});if(response.ok){const data=await response.json();replayArchiveSummaries=Array.isArray(data.archives)?data.archives.filter(item=>item.replayAvailable):[];if(data.jornada&&data.jornada.title)$('eventHelp').textContent=`Jornada archivada: ${data.jornada.title} · ${data.jornada.raceCount} mangas guardadas.`;for(const summary of replayArchiveSummaries){const option=document.createElement('option');option.value=summary.raceId;option.textContent=replayOptionLabel(summary);select.append(option);}}}catch(error){console.warn('No se pudo consultar el archivo de la jornada',error);}
  $('archiveRacePicker').hidden=select.options.length===0;const complete=replayArchiveSummaries.find(item=>item.status==='complete');return complete&&complete.raceId||select.options[0]&&select.options[0].value||'';
}
async function loadReplaySource(source){
  if(source==='builtin'){applyCircuit(defaultCircuit);demoReplay=D.prepareReplay({...builtInReplayData,circuit:defaultCircuit});updateReplayMeta();return true;}
  const eventKey=$('eventKey').value.trim();try{const response=await fetch(`/api/myrcm/archive?event=${encodeURIComponent(eventKey)}&race=${encodeURIComponent(source)}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(!data.archive||!data.archive.replay)throw new Error('La manga todavía no tiene suficientes vueltas para reproducirse.');const circuit=data.archive.replay.circuit||data.archive.circuit;if(circuit)applyCircuit(circuit);demoReplay=D.prepareReplay({...data.archive.replay,circuit:circuit||activeCircuit});updateReplayMeta();return true;}catch(error){toast(error.message||'No se pudo abrir la repetición.',true);return false;}
}
async function changeReplaySource(source){
  if(!await loadReplaySource(source))return;$('archiveRaceSelect').value=source;
  if(demoMode){category=demoReplay.category==='ECO'?'ECO':'NITRO';document.body.dataset.category=category;resetDemoTimeline();renderDemoFrame(true);setConnection('paused','Manga cargada · pulsa Play');toast('Manga cargada. Pulsa Play para iniciar la repetición.');}
}
async function startDemo(){
  if(demoMode)return;
  const returnCircuit=activeCircuit,source=await refreshReplayArchiveOptions();if(!source){toast('Todavía no hay una carrera archivada para este evento.',true);return;}if(!await loadReplaySource(source))return;$('archiveRaceSelect').value=source;
  resetFastestLapWatcher('demo');
  demoReturnState={category,snapshot,enriched,officialRanking,officialRuns,officialSectionKey,officialFinalComplete,rankingStatus,projectedState,result,possibilityResult,broadcast,circuit:returnCircuit};clearTimeout(rankingTimer);
  demoMode=true;paused=false;$('pauseButton').textContent='Pausar pantalla';category=demoReplay.category==='ECO'?'ECO':'NITRO';document.body.dataset.category=category;officialRanking=[];officialRuns=[];officialSectionKey='';officialFinalComplete=false;rankingStatus='replay';demoSpeed=Number($('demoSpeed').value)||1;resetDemoTimeline();
  document.querySelectorAll('.category-switch [data-category]').forEach(button=>{button.classList.remove('selected');button.setAttribute('aria-selected','false');});$('demoTab').classList.add('selected');$('demoTab').setAttribute('aria-selected','true');$('demoControls').hidden=false;updateReplayMeta();renderDemoFrame(true);setConnection('paused','Manga cargada · pulsa Play');toast('Repetición preparada. Selecciona la manga y pulsa Play.');
}
function basePitProfile(driver){return P.profileForName(pitProfilesData.profiles,driver.name);}
function pitProfile(driver){
  const base=basePitProfile(driver);if(!base)return null;const currentEvent=$('eventKey').value.trim(),related=[...pitHistories.values()].filter(record=>record.eventKey===currentEvent&&P.profileForName([base],record.driverName));
  const recent=related.slice(-4).flatMap(record=>record.laps||[]).slice(-100),stats=P.cleanBaseline(recent,base),profile={...base};
  if(recent.length>=8&&stats.baseline){profile.baselineSeconds=stats.baseline;profile.madSeconds=stats.mad;profile.consistency=stats.consistency;profile.reliability=Math.max(base.reliability*.55,stats.reliability);profile.adaptedLaps=recent.length;if(profile.trackTransfer&&!Number(profile.refuelIntervalLaps)){profile.refuelIntervalLaps=Math.max(7,Number(profile.refuelIntervalSeconds)/stats.baseline);profile.firstStopLap=profile.refuelIntervalLaps;profile.windowMarginLaps=2;}}
  const stopRuns=related.slice().reverse().map(record=>(record.laps||[]).filter(lap=>lap.state==='pit').map(lap=>lap.lap)).filter(stops=>stops.length),currentStops=stopRuns[0]||[];
  if(currentStops.length===1){profile.firstStopLap=currentStops[0];profile.confidence=profile.confidence==='low'?'medium':profile.confidence;}
  if(currentStops.length>=2){const intervals=currentStops.slice(1).map((lap,index)=>lap-currentStops[index]).filter(value=>value>=7&&value<=28),learned=P.median(intervals);if(learned){profile.refuelIntervalLaps=learned;profile.firstStopLap=currentStops[0];profile.confidence=intervals.length>=2?'high':'medium';}}
  return profile;
}
function recordPitSnapshot(next){
  if(next.category!=='NITRO')return;const now=Date.now();
  for(const driver of next.drivers){
    const key=pitHistoryKey(next,driver),profile=pitProfile(driver);let record=pitHistories.get(key);
    if(!record){record={eventKey:$('eventKey').value.trim(),sectionKey:next.sectionCode||next.section,driverName:driver.name,group:next.group,lastCompleted:driver.laps,lastCrossingAt:now,observedCrossings:0,laps:[]};pitHistories.set(key,record);savePitHistories();continue;}
    const gained=driver.laps-record.lastCompleted;
    if(gained===1&&driver.lastLapSeconds){
      const entry={lap:driver.laps,time:driver.lastLapSeconds};const analysis=P.classifyCompletedLap([...record.laps,entry],profile);
      entry.state=analysis.state;entry.confidence=analysis.confidence;record.laps.push(entry);if(record.laps.length>80)record.laps.shift();record.observedCrossings++;
    }
    if(gained>0){record.lastCompleted=driver.laps;record.lastCrossingAt=now;savePitHistories();}
  }
}
function pitSignal(driver){
  if(category!=='NITRO'||!snapshot)return null;const profile=pitProfile(driver);if(!profile)return null;
  const record=pitHistories.get(pitHistoryKey(snapshot,driver)),since=record?(Date.now()-record.lastCrossingAt)/1000:null;
  const signal=P.liveSignal({completedLaps:driver.laps,laps:record&&record.laps||[],secondsSinceCrossing:since,profile,observedCrossings:record&&record.observedCrossings||0}),lastStopLap=record&&(record.laps||[]).filter(item=>item.state==='pit').map(item=>item.lap).pop(),crossing=P.crossingStatus({profile,expectedSeconds:driver.averageSeconds||driver.bestSeconds,completedLaps:driver.laps,lastStopLap,secondsSinceCrossing:since,category});
  if(crossing.state==='incident'||crossing.state==='off-track')return {...signal,state:'incident-live',label:crossing.inPitWindow?'Incidencia tras ventana de repostaje':'Posible incidencia',confidence:crossing.inPitWindow?'medium':signal.confidence,crossing};
  if(crossing.state==='refueling')return {...signal,state:'pit-live',label:'REPOSTANDO · probable',crossing};
  return signal;
}
function fuelProfile(driver){
  const known=pitProfile(driver);if(known&&Number(known.refuelIntervalLaps)&&Number(known.firstStopLap))return known;
  const pace=driver.averageSeconds||driver.bestSeconds&&driver.bestSeconds*1.06;
  const fallback=P.fallbackFuelProfile(pace,pitProfilesData.profiles);return fallback?{...known,...fallback,evidenceStopLaps:known&&known.evidenceStopLaps||[]}:known;
}
function demoFuelLaps(driver,profile){
  const source=demoReplay.drivers.find(item=>P.normalize(item.name)===P.normalize(driver.name));if(!source)return [];
  const evidence=new Set((profile.evidenceStopLaps||[]).map(Number)),analysed=[];
  for(const lap of source.crossings||[]){if(lap.lap>driver.laps)break;const entry={lap:Number(lap.lap),time:Number(lap.seconds)},classification=P.classifyCompletedLap([...analysed,entry],profile);entry.state=evidence.has(entry.lap)?'pit':classification.state;entry.delta=classification.delta;analysed.push(entry);}
  return analysed;
}
function fuelState(driver){
  if(category!=='NITRO')return null;const profile=fuelProfile(driver);if(!profile)return {state:'learning',level:null,label:'Calibrando',confidence:'low'};
  const progress=lapProgressState(driver),fuelProgress=progress&&!progress.startPhase?progress.progress:0,record=!demoMode&&snapshot?pitHistories.get(pitHistoryKey(snapshot,driver)):null,laps=demoMode?demoFuelLaps(driver,profile):record&&record.laps||[],confirmedStops=demoMode&&!profile.estimatedFromField?profile.evidenceStopLaps||[]:[],estimate=P.fuelEstimate({completedLaps:driver.laps,lapProgress:fuelProgress,laps,profile,confirmedStops});
  if(!demoMode&&record&&record.observedCrossings<2&&driver.laps>Number(profile.firstStopLap||Infinity))return {...estimate,state:'uncertain',reason:'late-join',level:50,low:0,high:100,label:'Historial incompleto',confidence:'low'};
  if(progress&&progress.refueling)return {...estimate,state:'refueling',level:Math.min(8,estimate.level??8),label:'Repostando probable',confidence:profile.confidence||'low'};
  if(progress&&progress.missingCrossing)return {...estimate,state:'uncertain',reason:'live-incident',level:50,low:0,high:100,label:'Combustible incierto',confidence:'low'};
  const signal=!demoMode?pitSignal(driver):null;if(signal&&signal.state==='pit-live')return {...estimate,state:'refueling',level:Math.min(8,estimate.level??8),label:'Repostando probable',confidence:signal.confidence};
  if(signal&&signal.state==='incident-live')return {...estimate,state:'uncertain',reason:'live-incident',level:50,low:0,high:100,label:'Combustible incierto',confidence:'low'};
  return estimate;
}
function pitRowClass(signal){return !signal?'':signal.state==='window'?'pit-window':signal.state==='pit'||signal.state==='pit-live'?'pit-probable':signal.state==='incident'||signal.state==='incident-live'?'pit-incident':'';}
function projectionSnapshot(){
  if(officialRanking.length){
    return {...snapshot,authoritativeRoster:true,drivers:officialRanking.map(row=>({key:`official-${row.position}-${row.name}`,position:row.position,start:null,number:'',name:row.name,firstName:'',lastName:'',transponder:'',laps:0,lastLap:'',lastLapSeconds:null,total:'',best:'',bestSeconds:null,average:'',averageSeconds:null,forecast:'',gapFirst:'',gapPrevious:'',trend:0,positionChange:0,stateColor:4,progress:100}))};
  }
  const categoryMatches=!snapshot.category||snapshot.category===category;
  const finalHeat=categoryMatches&&category==='NITRO'&&/\bFINAL\b/i.test(snapshot.group)&&!/SEMI/i.test(snapshot.group);
  return {...snapshot,drivers:finalHeat?snapshot.drivers:[]};
}
function rebuildProjection(){
  if(!snapshot)return;
  const projection=L.stateFromSnapshot(E,seeds[category],projectionSnapshot());projectedState=projection.state;
  result=E.calculate(seeds[category],projectedState);broadcast=B.narrate(seeds[category],projectedState,result);
  possibilityResult=result;
  if(category==='ECO'&&officialRanking.length&&!officialFinalComplete){
    const open=E.clone(projectedState);open.pilots.forEach(p=>{if(p.active&&!p.noClassification)p.position='';});
    possibilityResult=E.calculate(seeds[category],open);
  }
}
function scheduleRankingFetch(){
  if(demoMode)return;
  const elapsed=Date.now()-lastRankingFetch;if(elapsed<12000){clearTimeout(rankingTimer);rankingTimer=setTimeout(loadOfficialRanking,12000-elapsed);return;}loadOfficialRanking();
}
async function loadOfficialRanking(){
  if(demoMode||!snapshot)return;lastRankingFetch=Date.now();
  if(snapshot.category&&snapshot.category!==category){rankingStatus='category-mismatch';return;}
  try{
    const params=new URLSearchParams({event:$('eventKey').value.trim(),section:snapshot.section});
    const response=await fetch(`/api/myrcm/ranking?${params}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();if(demoMode)return;rankingStatus=data.status||'pending';officialRanking=Array.isArray(data.ranking)?data.ranking:[];officialRuns=Array.isArray(data.runs)?data.runs:[];officialSectionKey=data.section&&data.section.key||'';
    const finals=officialRuns.filter(run=>String(run.type).toLowerCase()==='final');officialFinalComplete=finals.length>0&&finals.every(run=>/available|finalizado|finished|completed/.test(String(run.status).toLowerCase()));
    rebuildProjection();renderMetrics();renderChampionship();renderBroadcast();renderScenarioSelector();renderStories();renderIntelligence();renderPhases();renderEventImpact();renderRules();renderHistory();renderPitStrategy();
    void loadOnePitReport();void finalizeRaceArchiveFromMyRcm();
  }catch(error){rankingStatus='unavailable';console.warn('Ranking agregado de MyRCM no disponible',error);}
  clearTimeout(rankingTimer);rankingTimer=setTimeout(loadOfficialRanking,15000);
}
function reportStorageKey(eventKey,sectionKey,reportKey){return [eventKey,sectionKey,reportKey].join('|');}
function reportAvailable(run){return /available|finalizado|finished|completed/.test(String(run.status).toLowerCase());}
async function loadOnePitReport(){
  if(category!=='NITRO'||pitReportBusy||!officialSectionKey)return;
  const eventKey=$('eventKey').value.trim(),supported=new Set(['final','qualy','timedPractice','controlledPractice']);
  const raceFinal=run=>run.type==='final'&&!/\bpractice\b/i.test(String(run.label));
  const candidates=officialRuns.filter(run=>reportAvailable(run)&&supported.has(String(run.type))&&!loadedPitReports.has(reportStorageKey(eventKey,officialSectionKey,run.key))).sort((a,b)=>(raceFinal(a)?0:1)-(raceFinal(b)?0:1));
  const run=candidates[0];if(!run)return;pitReportBusy=true;
  try{
    const params=new URLSearchParams({event:eventKey,section:officialSectionKey,report:run.key,type:run.type});
    const response=await fetch(`/api/myrcm/laps?${params}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json(),reportId=reportStorageKey(eventKey,officialSectionKey,run.key),sourceDrivers=Array.isArray(data.drivers)?data.drivers:[];
    if(!sourceDrivers.some(driver=>Array.isArray(driver.laps)&&driver.laps.length))return;
    for(const driver of sourceDrivers){
      const base=basePitProfile(driver);if(!base||!Array.isArray(driver.laps)||!driver.laps.length)continue;
      const raw=driver.laps.map(entry=>({lap:Number(entry.lap),time:Number(entry.seconds)})).filter(entry=>Number.isFinite(entry.lap)&&Number.isFinite(entry.time)&&entry.time>0),stats=P.cleanBaseline(raw,base),working={...base};
      if(raw.length>=8&&stats.baseline){working.baselineSeconds=stats.baseline;working.madSeconds=stats.mad;working.consistency=stats.consistency;working.reliability=Math.max(Number(base.reliability)||0,stats.reliability);}
      if(working.trackTransfer&&!Number(working.refuelIntervalLaps)&&stats.baseline){working.refuelIntervalLaps=Math.max(7,Number(working.refuelIntervalSeconds)/stats.baseline);working.firstStopLap=working.refuelIntervalLaps;working.windowMarginLaps=2;}
      const laps=[];
      for(const entry of raw){const item={...entry};if(raceFinal(run)){const analysis=P.classifyCompletedLap([...laps,item],working);item.state=analysis.state;item.confidence=analysis.confidence;}else{item.state='pace';item.confidence=stats.reliability>=.55?'high':'medium';}laps.push(item);}
      const key=[eventKey,officialSectionKey,`report-${run.key}`,P.normalize(driver.name)].join('|');
      pitHistories.set(key,{eventKey,sectionKey:officialSectionKey,reportKey:run.key,reportType:run.type,driverName:driver.name,group:[run.phase,run.group,run.label].filter(Boolean).join(' · '),lastCompleted:raw.at(-1).lap,lastCrossingAt:0,observedCrossings:raw.length,laps:laps.slice(-120)});
    }
    loadedPitReports.add(reportId);savePitHistories();renderPitStrategy();renderTiming();renderBroadcast();
  }catch(error){console.warn('Informe de vueltas MyRCM no disponible',error);}finally{pitReportBusy=false;}
}
async function finalizeRaceArchiveFromMyRcm(){
  if(demoMode||!snapshot||!officialSectionKey)return;const key=archiveKey(snapshot);if(archiveReportFinalizedRace===key)return;
  const supported=new Set(['final','qualy','timedPractice','controlledPractice']),snapshotGroup=L.normalize(snapshot.group),available=officialRuns.filter(run=>reportAvailable(run)&&supported.has(String(run.type))),exact=available.find(run=>String(run.key)===String(snapshot.groupKey)),raceNumber=Number(snapshotGroup.match(/(?:CARRERA|RUN|MANGA)\s*(\d+)/)?.[1]),numberMatch=Number.isFinite(raceNumber)&&raceNumber>0?available.find(run=>Number(L.normalize(run.label).match(/(?:CARRERA|RUN|MANGA)\s*(\d+)/)?.[1])===raceNumber&&(!snapshotGroup.includes('FINAL')||String(run.type)==='final')):null,textMatch=available.find(run=>snapshotGroup&&[run.phase,run.group,run.label].some(value=>{const normalized=L.normalize(value);return normalized&&(snapshotGroup.includes(normalized)||normalized.includes(snapshotGroup));})),finals=available.filter(run=>String(run.type)==='final'),run=exact||numberMatch||textMatch||(snapshotGroup.includes('FINAL')&&finals.length===1?finals[0]:null);
  if(!run)return;
  try{
    const eventKey=$('eventKey').value.trim(),params=new URLSearchParams({event:eventKey,section:officialSectionKey,report:run.key,type:run.type}),response=await fetch(`/api/myrcm/laps?${params}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json(),drivers=(Array.isArray(data.drivers)?data.drivers:[]).filter(driver=>Array.isArray(driver.laps)&&driver.laps.length);if(!drivers.length)return;
    const replay={eventKey,eventName:snapshot.name||'',sectionKey:officialSectionKey,sectionName:snapshot.section||'',category:category==='ECO'?'ECO':'NITRO',group:[run.phase,run.group,run.label].filter(Boolean).join(' · ')||snapshot.group||'Manga',reportKey:String(run.key),reportType:String(run.type),scheduledSeconds:L.timeSeconds(snapshot.raceTime)||1800,circuit:activeCircuit,drivers:drivers.map(driver=>({name:driver.name,startOffsetSeconds:0,laps:driver.laps}))};
    await postRaceArchive({eventKey,circuit:activeCircuit,frames:[archiveFrame(snapshot)],complete:true,finalRanking:officialRanking,replay},true);archiveReportFinalizedRace=key;archiveFinalizedRace=key;toast('Resultado final y vueltas MyRCM guardados para repetición.');
  }catch(error){console.warn('No se pudo completar el archivo con el informe final de MyRCM',error);}
}
function renderRaceHeader(){
  const fullEventName=snapshot.name||'Jornada MyRCM en directo';
  const compactEventName=/4\s*[ªA]?\s*PRUEBA.*(?:CAMPEONATO|CAMPIONAT).*CATALUNYA.*GT8/i.test(fullEventName)?'4ª - Camp. Catalunya 1/8 GT Nitro/Eco':fullEventName;
  const eventName=$('eventName');eventName.textContent=compactEventName;eventName.title=fullEventName;eventName.setAttribute('aria-label',fullEventName);$('raceCategory').textContent=demoMode?`REPETICIÓN · GT8 ${category}`:snapshot.section||category;
  $('appEventLabel').textContent=`${activeCircuit.name} · ${fullEventName}`;document.title=`${fullEventName} · RCTimes`;
  $('groupName').textContent=snapshot.group||'Manga pendiente';$('raceState').textContent=demoMode?(snapshot.raceState==='FINISHED'?'FINALIZADA':demoPlaying?'REPETICIÓN':'PAUSADA'):L.raceStateLabel(snapshot.raceState).toUpperCase();
  $('remainingTime').textContent=demoMode?snapshot.currentTime||'0:00':snapshot.remaining||'--:--';$('raceClockLabel').textContent=demoMode?`de ${D.formatClock(demoReplay.durationSeconds)} · reproducción ${demoSpeed}×`:'tiempo restante';$('raceProgress').style.width=`${Math.max(0,Math.min(100,snapshot.percentage||0))}%`;
}
function renderRegistrations(){
  const data=registrationsData.categories[category],counts=data.counts,format=value=>new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}).format(new Date(value));
  $('registrationTitle').textContent=`Parrilla provisional ${category==='ECO'?'GT8 Eléctrico':'GT8 Nitro'}`;
  $('registrationTotal').textContent=counts.total;$('registrationConfirmed').textContent=counts.confirmed;$('registrationPending').textContent=counts.unconfirmed;
  $('registrationClosure').textContent=`Inscripción abierta hasta ${format(data.closesAt)}`;
  $('registrationCaptured').textContent=`Captura AECAR: ${format(registrationsData.capturedAt)}`;$('registrationLink').href=data.sourceUrl;
  $('registrationAssumption').textContent='Todos los nombres visibles ocupan plaza y pueden puntuar en las simulaciones. La lista sigue abierta; el estado de licencia es informativo y puede regularizarse sin que AECAR lo refleje todavía.';
  $('registrationRoster').innerHTML=data.entrants.map(entry=>{
    const confirmed=entry.sourceStatus==='confirmed',licenceOk=L.normalize(entry.licenceStatus)==='OK';
    return `<article><div><strong>${esc(entry.name)}</strong><small>${esc(entry.zone)}${entry.rank&&entry.rank!==999?` · ranking ${entry.rank}`:''}</small></div><span class="registration-badge ${confirmed?'confirmed':'pending'}">${confirmed?'Confirmado':'Por confirmar'}</span>${licenceOk?'':`<span class="registration-badge review">Licencia ${esc(entry.licenceStatus)}</span>`}</article>`;
  }).join('');
}
function lapStateValue(state){return !state?'—':state.didNotStart?'SIN SALIDA':state.hiddenAfterNoCrossing?'FUERA':state.missingCrossing?'INCID.':state.refueling?'BOXES?':state.startPhase?'SALIDA':`${Math.round(state.progress)}%`;}
function lapStateTitle(state){
  if(!state)return 'Esperando una manga activa y un cruce de transpondedor';if(state.didNotStart)return 'No consta un primer paso registrado en el cronometraje.';if(state.hiddenAfterNoCrossing)return `Fuera del mapa tras ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} segundos sin un nuevo paso por el transpondedor.`;if(state.missingCrossing)return `Posible incidencia: la parada ha superado el margen previsto y lleva ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} segundos sin cruce.`;if(state.refueling)return `Repostando probablemente: la ausencia de cruce coincide con su ventana y patrón de parada (${Math.floor(state.sinceLastCrossing||state.elapsed||0)} s).`;if(state.startPhase)return 'Tramo de salida: se aproxima al primer paso por el transpondedor; la vuelta 0 no suma.';
  return `${state.demo?'Repetición visual':'Posición estimada'}: ${Math.round(state.progress)}% de la vuelta · unos ${Math.round(activeCircuit.lapLengthMeters*state.progress/100)} m desde el último cruce · ritmo limpio previsto ${decimal(state.expected,2)} s`;
}
function lapMeterMarkup(driver){
  const state=lapProgressState(driver),value=lapStateValue(state),title=lapStateTitle(state);
  return `<div class="pilot-meter"><span>RITMO</span><b class="pace-track" title="Ritmo relativo de carrera"><i style="width:${driver.pace}%"></i></b></div><div class="pilot-meter lap-position ${state&&state.delayed&&!state.missingCrossing?'delayed':''}" title="${esc(title)}"><span>VUELTA <em data-lap-value>${value}</em></span><b class="lap-track"><i style="width:${state?state.progress:0}%"></i></b></div>`;
}
function renderTrackMap(){
  const markers=$('trackMarkers'),legend=$('trackLegend'),incidentDock=$('trackIncidentDock');if(!markers||!legend)return;
  const roster=enriched.map(driver=>String(driver.key)).sort().join('|');
  if(markers.dataset.roster!==roster){markers.innerHTML=enriched.map(driver=>`<g class="track-driver" data-track-driver="${esc(driver.key)}" style="--driver-colour:${trackColour(driver)}" role="img" aria-label="Posición ${driver.position}, ${esc(driver.name)}"><circle class="driver-disc" r="18"></circle><text class="driver-initials" text-anchor="middle" dominant-baseline="central">${driverInitials(driver.name)}</text><circle class="driver-rank" cx="-15" cy="-15" r="9"></circle><text class="driver-rank-text" x="-15" y="-15" text-anchor="middle" dominant-baseline="central">${driver.position}</text><title>${driver.position}. ${esc(driver.name)}</title></g>`).join('');markers.dataset.roster=roster;}
  else enriched.forEach(driver=>{const marker=markers.querySelector(`[data-track-driver="${CSS.escape(String(driver.key))}"]`);if(marker){const rank=marker.querySelector('.driver-rank-text'),initials=marker.querySelector('.driver-initials'),title=marker.querySelector('title');if(rank)rank.textContent=driver.position;if(initials)initials.textContent=driverInitials(driver.name);if(title)title.textContent=`${driver.position}. ${driver.name}`;marker.setAttribute('aria-label',`Posición ${driver.position}, ${driver.name}`);}});
  if(legend.dataset.roster!==roster){legend.innerHTML=enriched.map(driver=>`<article data-track-legend="${esc(driver.key)}"><i style="background:${trackColour(driver)}"></i><strong>${driver.position}. ${esc(driver.name)}</strong><span data-track-value>—</span></article>`).join('')||'<div class="empty-compact">Esperando pilotos en pista.</div>';legend.dataset.roster=roster;}
  else{const entries=new Map([...legend.querySelectorAll('[data-track-legend]')].map(node=>[node.dataset.trackLegend,node]));for(const driver of enriched){const entry=entries.get(String(driver.key));if(!entry)continue;const label=entry.querySelector('strong');if(label)label.textContent=`${driver.position}. ${driver.name}`;legend.appendChild(entry);}}
  if(incidentDock)incidentDock.dataset.roster=roster;updateLapVisuals();
}
function updateLapVisuals(){
  const now=Date.now(),driverMap=new Map(enriched.map(driver=>[String(driver.key),driver])),refreshFuel=category==='NITRO'&&now-fuelVisualAt>=500;
  document.querySelectorAll('.timing-row[data-driver]').forEach(row=>{
    const driver=driverMap.get(row.dataset.driver),state=driver&&lapProgressState(driver,now),bar=row.querySelector('.lap-track i'),value=row.querySelector('[data-lap-value]'),meter=row.querySelector('.lap-position'),tracking=row.querySelector('.tracking-chip');
    if(bar)bar.style.width=`${state?state.progress:0}%`;if(value)value.textContent=lapStateValue(state);if(meter){meter.classList.toggle('delayed',Boolean(state&&state.delayed&&!state.missingCrossing));meter.classList.toggle('refueling',Boolean(state&&state.refueling));}
    if(meter)meter.title=lapStateTitle(state);if(tracking&&state){const trackingState=state.hiddenAfterNoCrossing?'hidden':state.missingCrossing?'warning':state.refueling?'refueling':'';if(!trackingState)tracking.remove();else{tracking.className=`tracking-chip ${trackingState}`;tracking.textContent=`${state.hiddenAfterNoCrossing?'FUERA DEL MAPA':state.refueling?'REPOSTANDO':'INCIDENCIA'} · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} S`;}}
    if(refreshFuel&&driver)syncFuelTank(row.querySelector('.driver-cell'),fuelState(driver));
  });
  if(refreshFuel)fuelVisualAt=now;
  const path=$('circuitGuide'),length=path&&path.getTotalLength?path.getTotalLength():0,markers=new Map([...document.querySelectorAll('[data-track-driver]')].map(node=>[node.dataset.trackDriver,node])),legends=new Map([...document.querySelectorAll('[data-track-legend]')].map(node=>[node.dataset.trackLegend,node])),alertDrivers=[];
  for(const driver of enriched){
    const state=lapProgressState(driver,now),marker=markers.get(String(driver.key)),legend=legends.get(String(driver.key));
    const offTrack=Boolean(state&&state.hiddenAfterNoCrossing),visible=Boolean(state&&length&&state.visibleOnMap!==false&&!offTrack);
    if(state&&(state.refueling||state.missingCrossing||offTrack))alertDrivers.push({driver,state,offTrack});
    if(marker){marker.classList.toggle('visible',visible);marker.classList.toggle('delayed',Boolean(visible&&state.delayed));marker.classList.toggle('signal-lost',Boolean(visible&&state.missingCrossing));if(visible){const mapProgress=pacedTrackProgress(state.progress,path),point=path.getPointAtLength(length*mapProgress/100);marker.setAttribute('transform',`translate(${point.x} ${point.y})`);marker.dataset.mapProgress=mapProgress.toFixed(2);}}
    const value=legend&&legend.querySelector('[data-track-value]');if(value)value.textContent=state?(state.didNotStart?'sin salida registrada':state.hiddenAfterNoCrossing?`fuera del mapa · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} s`:state.missingCrossing?`incidencia · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} s sin cruce`:state.refueling?`repostando probable · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} s`:state.visibleOnMap===false?'esperando 1.ª vuelta':`${state.demo?'repetición · ':''}${Math.round(state.progress)}% · ${Math.round(activeCircuit.lapLengthMeters*state.progress/100)} m`):'en espera';
  }
  alertDrivers.sort((a,b)=>(b.state.sinceLastCrossing||b.state.elapsed||0)-(a.state.sinceLastCrossing||a.state.elapsed||0));
  const incidentDock=$('trackIncidentDock');if(incidentDock){incidentDock.hidden=!alertDrivers.length;incidentDock.innerHTML=alertDrivers.length?`<strong><i></i> BOXES / INCIDENCIAS</strong><div>${alertDrivers.map(({driver,state,offTrack})=>{const css=offTrack?'off-track':state.refueling?'refueling':'warning',label=offTrack?'fuera del trazado virtual':state.refueling?'REPOSTANDO · probable':'INCIDENCIA · margen superado';return `<article class="${css}" style="--driver-colour:${trackColour(driver)}"><b>${driverInitials(driver.name)}</b><span><em>${driver.position}. ${esc(driver.name)}</em><small>${Math.floor(state.sinceLastCrossing||state.elapsed||0)} s · ${label}</small></span></article>`;}).join('')}</div>`:'';}
  const status=$('trackLiveStatus');if(status)status.textContent=demoMode?`RITMO POR CURVAS · ${decimal(activeCircuit.lapLengthMeters,2)} m`:snapshot&&L.normalize(snapshot.raceState).includes('RUN')?`Aceleración estimada · ${decimal(activeCircuit.lapLengthMeters,2)} m`:`${activeCircuit.name} · ${decimal(activeCircuit.lapLengthMeters,2)} m`;
}
function fuelTankTitle(fuel){
  if(!fuel||fuel.level==null)return 'Sin datos suficientes para estimar el combustible.';
  if(fuel.state==='uncertain'&&fuel.reason==='unconfirmed-stop')return 'Parada por confirmar: el modelo de grupo ya esperaba un repostaje, pero los tiempos no permiten asegurar si se produjo.';
  if(fuel.state==='uncertain'&&fuel.reason==='late-join')return 'Historial incompleto: la conexión comenzó con la carrera avanzada y no se conoce el último repostaje.';
  if(fuel.state==='uncertain')return `Combustible incierto: entre ${fuel.low}% y ${fuel.high}%. Una incidencia larga pudo incluir una reparación y repostaje.`;
  const model=fuel.estimated?'Modelo de baja confianza basado en el ritmo y la estrategia media del grupo.':'Estimación basada en el patrón de repostaje aprendido del piloto.';
  return `${fuel.label}: ${fuel.level}%. ${model}`;
}
function fuelTankMarkup(fuel){
  if(category!=='NITRO')return '';const state=fuel&&fuel.state||'learning',level=fuel&&fuel.level!=null?fuel.level:50,value=state==='uncertain'?'?':fuel&&fuel.level!=null?`${fuel.level}%`:'CAL',estimated=fuel&&fuel.estimated?' estimated':'';
  return `<div class="fuel-widget ${esc(state)}${estimated}" data-fuel-widget title="${esc(fuelTankTitle(fuel))}" aria-label="${esc(fuelTankTitle(fuel))}"><span>COMB.</span><b class="fuel-tank"><i data-fuel-fill style="height:${level}%"></i><em data-fuel-symbol>${esc(state==='uncertain'?'?':'')}</em></b><small data-fuel-value>${esc(value)}</small></div>`;
}
function syncFuelTank(driverCell,fuel){
  if(!driverCell)return;let widget=driverCell.querySelector('[data-fuel-widget]');
  if(category!=='NITRO'){if(widget)widget.remove();driverCell.classList.remove('with-fuel');return;}
  driverCell.classList.add('with-fuel');if(!widget){driverCell.insertAdjacentHTML('beforeend',fuelTankMarkup(fuel));return;}
  const state=fuel&&fuel.state||'learning',level=fuel&&fuel.level!=null?fuel.level:50,title=fuelTankTitle(fuel);widget.className=`fuel-widget ${state}${fuel&&fuel.estimated?' estimated':''}`;widget.title=title;widget.setAttribute('aria-label',title);
  const fill=widget.querySelector('[data-fuel-fill]'),symbol=widget.querySelector('[data-fuel-symbol]'),value=widget.querySelector('[data-fuel-value]');if(fill)fill.style.height=`${level}%`;if(symbol)symbol.textContent=state==='uncertain'?'?':'';if(value)value.textContent=state==='uncertain'?'?':fuel&&fuel.level!=null?`${fuel.level}%`:'CAL';
}
function timingMeta(driver,index,battleMap){
  const trend=driver.positionChange||driver.trend,trendText=trend>0?`▲ ${Math.abs(trend)}`:trend<0?`▼ ${Math.abs(trend)}`:'',trendClass=trend<0?'down':'',signal=demoMode?null:pitSignal(driver),fuel=fuelState(driver),battle=battleMap.get(driver.key),state=lapProgressState(driver);
  const startChip=demoMode&&state&&state.didNotStart?'<small class="start-delay-chip">SIN PRIMER PASO REGISTRADO</small>':'';
  const trackingChip=state&&state.hiddenAfterNoCrossing?`<small class="tracking-chip hidden">FUERA DEL MAPA · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} S</small>`:state&&state.missingCrossing?`<small class="tracking-chip warning">INCIDENCIA · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} S SIN CRUCE</small>`:state&&state.refueling?`<small class="tracking-chip refueling">REPOSTANDO · ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} S</small>`:'';
  const pitChip=signal&&signal.state!=='pace'&&signal.state!=='learning'&&!(state&&(state.refueling||state.missingCrossing))?`<small class="pit-chip ${esc(signal.state)}">${esc(signal.label)} · ${esc(signal.confidence)}</small>`:'',battleClass=battle?`battle-active battle-${battle.index===0?'start':battle.index===battle.group.drivers.length-1?'end':'middle'}`:'',battleGap=Boolean(battle&&battle.index>0),battleGapLabel=battleGap?'LUCHA':'';
  const gap=index===0?'LÍDER':driver.gapFirst||driver.gapPrevious||'—',previousSeconds=index?L.gapSeconds(driver.gapPrevious):null,previousLaps=index&&/^-[0-9]+$/.test(String(driver.gapPrevious||''))?Math.abs(Number(driver.gapPrevious)):null,previousGap=index===0?'':previousSeconds!=null?`+${decimal(previousSeconds,3)} s`:previousLaps?`${previousLaps} v.`:'—',validBests=enriched.map(item=>Number(item.bestSeconds)).filter(value=>Number.isFinite(value)&&value>0),sessionBest=validBests.length?Math.min(...validBests):null,sessionFastest=sessionBest!=null&&Math.abs(Number(driver.bestSeconds)-sessionBest)<.0005,rowClass=state&&state.missingCrossing?'pit-incident':state&&state.refueling?'pit-probable':pitRowClass(signal);
  return {driver,index,trendText,trendClass,signal,fuel,battleClass,battleGap,battleGapLabel,chips:`${pitChip}${startChip}${trackingChip}`,gap,previousGap,sessionFastest,rowClass,matched:driver.matchedPilot?`Campeonato: ${driver.matchedPilot.shortName}`:'Fuera de la general cargada'};
}
function precedingGapMarkup(previousGap,battleGap,battleGapLabel){return `<strong>${esc(previousGap||'—')}</strong><small>${esc(battleGap?battleGapLabel:'al anterior')}</small>`;}
function timingRowMarkup(meta){const {driver,index,trendText,trendClass,fuel,battleClass,battleGap,battleGapLabel,chips,gap,previousGap,sessionFastest,rowClass}=meta;return `<article class="timing-row ${index===0?'leader':''} ${rowClass} ${battleClass}" data-driver="${esc(driver.key)}"><div class="position-cell"><strong>${driver.position}</strong>${trendText?`<em class="${trendClass}">${trendText}</em>`:''}</div><div class="driver-cell ${category==='NITRO'?'with-fuel':''}"><div class="driver-copy"><strong>${esc(driver.name)}</strong>${chips}${lapMeterMarkup(driver)}</div>${fuelTankMarkup(fuel)}</div><div class="timing-value gap-col"><strong class="${index===0?'gap-leader':''}">${esc(gap)}</strong><small>al líder</small></div><div class="timing-value preceding-col ${previousGap==='—'||!previousGap?'unavailable':''} ${battleGap?'battle-gap':''}">${precedingGapMarkup(previousGap,battleGap,battleGapLabel)}</div><div class="timing-value last-col"><strong>${esc(driver.lastLap||'—')}</strong><small>última · ${esc(speedLabel(driver.lastLapSeconds))}</small></div><div class="timing-value best-col ${sessionFastest?'session-fastest':''}"><strong>${esc(driver.best||'—')}</strong><small>mejor · ${esc(speedLabel(driver.bestSeconds))}</small></div><div class="laps-cell">${driver.laps}<small>${esc(distanceLabel(driver.laps))}</small></div></article>`;}
function syncTimingRow(row,meta){
  const {driver,index,trendText,trendClass,fuel,battleClass,battleGap,battleGapLabel,chips,gap,previousGap,sessionFastest,rowClass}=meta;row.className=`timing-row ${index===0?'leader':''} ${rowClass} ${battleClass}`.trim();
  const connector=row.querySelector('.battle-connector');if(connector)connector.remove();
  const position=row.querySelector('.position-cell');if(position)position.innerHTML=`<strong>${driver.position}</strong>${trendText?`<em class="${trendClass}">${trendText}</em>`:''}`;
  const driverCell=row.querySelector('.driver-cell');if(driverCell){const copy=driverCell.querySelector('.driver-copy')||driverCell,name=copy.querySelector(':scope > strong');if(name)name.textContent=driver.name;copy.querySelectorAll('.battle-chip,.pit-chip,.start-delay-chip,.tracking-chip').forEach(node=>node.remove());const meter=copy.querySelector('.pilot-meter');if(meter&&chips)meter.insertAdjacentHTML('beforebegin',chips);const pace=copy.querySelector('.pace-track i');if(pace)pace.style.width=`${driver.pace}%`;syncFuelTank(driverCell,fuel);}
  const gapNode=row.querySelector('.gap-col strong');if(gapNode){gapNode.textContent=gap;gapNode.classList.toggle('gap-leader',index===0);}const preceding=row.querySelector('.preceding-col');if(preceding){preceding.innerHTML=precedingGapMarkup(previousGap,battleGap,battleGapLabel);preceding.classList.toggle('unavailable',previousGap==='—'||!previousGap);preceding.classList.toggle('battle-gap',battleGap);}const last=row.querySelector('.last-col'),best=row.querySelector('.best-col'),laps=row.querySelector('.laps-cell');
  if(last)last.innerHTML=`<strong>${esc(driver.lastLap||'—')}</strong><small>última · ${esc(speedLabel(driver.lastLapSeconds))}</small>`;if(best){best.innerHTML=`<strong>${esc(driver.best||'—')}</strong><small>mejor · ${esc(speedLabel(driver.bestSeconds))}</small>`;best.classList.toggle('session-fastest',sessionFastest);}if(laps)laps.innerHTML=`${driver.laps}<small>${esc(distanceLabel(driver.laps))}</small>`;
}
function renderTiming(){
  const tower=$('timingTower'),old=new Map([...tower.querySelectorAll('[data-driver]')].map(row=>[row.dataset.driver,row.getBoundingClientRect()])),battleMap=new Map();
  if(!enriched.length){tower.innerHTML='<div class="empty-state">MyRCM está conectado, pero todavía no ha publicado pilotos para esta manga.</div>';tower.dataset.roster='';return;}
  for(const group of L.battleGroups(enriched,battleThresholdSeconds))group.drivers.forEach((driver,index)=>battleMap.set(driver.key,{group,index,gap:index?group.gaps[index-1]:null}));
  const metas=enriched.map((driver,index)=>timingMeta(driver,index,battleMap)),roster=enriched.map(driver=>String(driver.key)).sort().join('|');
  if(tower.dataset.roster!==roster){tower.innerHTML=metas.map(timingRowMarkup).join('');tower.dataset.roster=roster;}
  else{const rows=new Map([...tower.querySelectorAll('[data-driver]')].map(row=>[row.dataset.driver,row]));for(const meta of metas){const row=rows.get(String(meta.driver.key));if(!row)continue;syncTimingRow(row,meta);tower.appendChild(row);}}
  renderTrackMap();
  requestAnimationFrame(()=>tower.querySelectorAll('[data-driver]').forEach(row=>{const before=old.get(row.dataset.driver);if(!before)return;const after=row.getBoundingClientRect(),dy=before.top-after.top;if(Math.abs(dy)>1){row.style.transform=`translateY(${dy}px)`;row.style.transition='none';requestAnimationFrame(()=>{row.style.transition='transform .5s cubic-bezier(.22,1,.36,1),background .25s,opacity .25s';row.style.transform='';});}}));
  const matched=enriched.filter(driver=>driver.matchedPilot).length;$('matchStatus').textContent=`${matched} de ${enriched.length} pilotos vinculados con la general ${category}.`;
}
function renderPitStrategy(){
  const card=$('pitStrategyCard');card.hidden=category!=='NITRO';if(category!=='NITRO')return;
  const registered=registrationsData.categories.NITRO.entrants.map(entry=>entry.name),profiles=pitProfilesData.profiles.filter(profile=>registered.some(name=>P.profileForName([profile],name)));
  const rows=profiles.map(profile=>{
    const driver=enriched.find(item=>P.profileForName([profile],item.name)),active=driver?pitProfile(driver):profile,signal=driver?pitSignal(driver):null,interval=Number(active.refuelIntervalLaps)?Math.round(active.refuelIntervalLaps):null,minutes=decimal(active.refuelIntervalSeconds/60,1);
    let status=interval?`cada ${interval} vueltas`:`referencia ${minutes} min`,detail=active.trackTransfer&&!active.adaptedLaps?'Otro circuito · ritmo y consumo local pendientes':`aprox. ${minutes} min · ritmo base ${Number(active.baselineSeconds)?`${decimal(active.baselineSeconds,3)} s`:'adaptándose'}`,css='';
    if(driver&&signal&&signal.window){status=`v. ${signal.window.from}–${signal.window.to}`;detail=`${signal.label} · confianza ${signal.confidence} · patrón ${interval} vueltas`;css=signal.state==='window'?'warning':signal.state==='pit'||signal.state==='pit-live'?'probable':signal.state==='incident'?'incident':'';}
    else if(driver){status=`vuelta ${driver.laps}`;detail=interval?`Próxima ventana pendiente · patrón inicial ${interval} vueltas`:`Se necesitan 8 cruces limpios para adaptar la referencia a ${activeCircuit.name}`;}
    return `<article class="pit-profile ${css}"><div><strong>${esc(profile.nextEventName||profile.name)}</strong><small>${esc(detail)}</small></div><span>${esc(status)}<small>${profile.evidenceStopLaps.length} señales previas</small></span></article>`;
  });
  $('pitStrategyFeed').innerHTML=rows.join('')||'<div class="empty-compact">Todavía no hay perfiles coincidentes con la parrilla provisional.</div>';
}
function fastestLapScope(){return [demoMode?'demo':'live',$('eventKey').value.trim(),snapshot&&snapshot.sectionCode||category,snapshot&&snapshot.groupKey||snapshot&&snapshot.group||'pending'].join('|');}
function clearFastestLapFlash(){clearTimeout(fastestLapFlashTimer);fastestLapFlashTimer=null;const card=$('metricFastestCard');if(card)card.classList.remove('fastest-lap-flash');}
function resetFastestLapWatcher(mode){clearFastestLapFlash();fastestLapActiveScope='';for(const key of fastestLapBaselines.keys())if(!mode||key.startsWith(`${mode}|`))fastestLapBaselines.delete(key);}
function watchFastestLap(fastest){
  const scope=fastestLapScope(),card=$('metricFastestCard');
  if(scope!==fastestLapActiveScope){clearFastestLapFlash();fastestLapActiveScope=scope;}
  if(!fastest||!Number.isFinite(fastest.bestSeconds))return;
  const current=fastest.bestSeconds,previous=fastestLapBaselines.get(scope);
  if(previous==null){fastestLapBaselines.set(scope,current);return;}
  if(current>=previous-.0005)return;
  fastestLapBaselines.set(scope,current);clearFastestLapFlash();void card.offsetWidth;card.classList.add('fastest-lap-flash');fastestLapFlashTimer=setTimeout(()=>{card.classList.remove('fastest-lap-flash');fastestLapFlashTimer=null;},4800);
}
function renderMetrics(){
  const leader=enriched[0],fastest=[...enriched].filter(d=>d.bestSeconds).sort((a,b)=>a.bestSeconds-b.bestSeconds)[0],pace=[...enriched].filter(d=>d.averageSeconds).sort((a,b)=>a.averageSeconds-b.averageSeconds)[0];
  $('metricLeader').textContent=leader?leader.name:'—';$('metricLeaderDetail').textContent=leader?`${leader.laps} vueltas · ${distanceLabel(leader.laps)} · ${leader.total||'sin tiempo total'}`:'Sin datos';
  $('metricFastest').textContent=fastest?fastest.best:'—';$('metricFastestDetail').textContent=fastest?`${fastest.name} · ${speedLabel(fastest.bestSeconds)}`:'Sin datos';
  watchFastestLap(fastest);
  $('metricPace').textContent=pace?speedLabel(pace.averageSeconds):'—';$('metricPaceDetail').textContent=pace?`${pace.average} por vuelta · ${pace.name}`:'Calculada sobre la vuelta media';
  const championshipView=category==='ECO'&&!officialFinalComplete?possibilityResult:result;
  const champion=championshipView&&championshipView.valid&&championshipView.podium[0]&&championshipView.podium[0].certain.length===1?championshipView.podium[0].certain[0]:null;
  $('metricChampionship').textContent=champion?champion.pilot.shortName:'Por decidir';$('metricChampionshipDetail').textContent=champion?`${champion.min} puntos proyectados`:`${result&&result.podium[0]?result.podium[0].candidates.length:0} candidatos posibles`;
}
function renderChampionship(){
  if(!result)return;
  const labels=['CAMPEÓN','SUBCAMPEÓN','TERCERO','CUARTO'];
  $('championshipPodium').innerHTML=result.podium.slice(0,4).map((slot,index)=>{const certain=slot.certain.length===1?slot.certain[0]:null;return `<article class="champ-card"><span class="rank-ghost">${index+1}</span><span>${labels[index]}</span><strong>${certain?esc(certain.pilot.shortName):'Por decidir'}</strong><small>${certain?`${range(certain.rankMin,certain.rankMax)} · ${certain.min} pts`:`${slot.candidates.length} candidatos`}</small></article>`;}).join('');
  const rows=result.rows.filter(row=>!row.pilot.livePlaceholder).slice(0,12);
  $('standingsBody').innerHTML=rows.map(row=>{const p=row.pilot,today=!p.active?'No corre':p.position?ordinal(Number(p.position)):'Pendiente';return `<div class="standing-row"><strong>${range(row.rankMin,row.rankMax)}</strong><div class="driver">${esc(p.shortName)}<small>${p.position?'Posición recibida de MyRCM':'Resultado aún abierto'}</small></div><span>${esc(today)}</span><span class="points">${row.min===row.max?row.min:`${row.min}–${row.max}`}</span><span class="range">${row.rankMin===row.rankMax?'Definido':'En juego'}</span></div>`;}).join('');
  const projectionStatus=officialRanking.length?(category==='ECO'&&!officialFinalComplete?'Agregado ECO provisional':'Ranking agregado MyRCM'):category==='NITRO'&&snapshot.category===category&&/\bFINAL\b/i.test(snapshot.group)?'Final Nitro en directo':'Parrilla provisional AECAR';
  $('projectionLabel').textContent=projectionStatus;$('liveGeneralStatus').textContent=projectionStatus;
  $('liveGeneralRows').innerHTML=rows.slice(0,8).map(row=>{const p=row.pilot,today=!p.active?'—':p.position?ordinal(Number(p.position)):'…',points=row.min===row.max?row.min:`${row.min}–${row.max}`,baseline=Number(p.baselineRank),movement=baseline&&row.rankMin===row.rankMax?baseline-row.rankMin:0,trend=movement>0?`▲${movement}`:movement<0?`▼${Math.abs(movement)}`:'';return `<div class="live-general-row"><strong>${range(row.rankMin,row.rankMax)}</strong><div><b>${esc(p.shortName)}</b>${trend?`<small class="${movement<0?'down':''}">${trend}</small>`:''}</div><span>${esc(today)}</span><em>${esc(points)}</em></div>`;}).join('')||'<div class="empty-compact">La general sigue pendiente de resultados.</div>';
}
function renderBroadcast(){
  if(!broadcast)return;$('broadcastTitle').textContent=broadcast.title;
  const activeIncidents=incidents.filter(item=>item.category===category);
  $('broadcastText').innerHTML=broadcast.paragraphs.slice(0,4).map(text=>`<p>${esc(text)}</p>`).join('')+activeIncidents.map(item=>`<p><strong>Reglamento · ${esc(item.pilot)}:</strong> ${esc(item.rule.title)}. ${esc(item.consequence)}</p>`).join('');
  const insights=[];const leader=enriched[0],fastest=[...enriched].filter(d=>d.bestSeconds).sort((a,b)=>a.bestSeconds-b.bestSeconds)[0];
  if(leader)insights.push(`${leader.name} lidera con ${leader.laps} vueltas${leader.gapPrevious?` y ${leader.gapPrevious} sobre el segundo`:''}.`);
  const historicLeader=leader&&L.matchPilot(leader.name,historyPilots),leaderTitles=historicLeader&&historyData.computedTitleCounts[historicLeader.name];
  if(leaderTitles)insights.push(`${historicLeader.name} cuenta con ${leaderTitles} título${leaderTitles===1?'':'s'} de España en el historial nacional de Rally Game / GT8.`);
  if(fastest)insights.push(`La mejor vuelta es de ${fastest.name}: ${fastest.best}, equivalente a ${speedLabel(fastest.bestSeconds)} de media sobre la cuerda estimada.`);
  if(leader&&leader.laps)insights.push(`${leader.name} ha completado aproximadamente ${distanceLabel(leader.laps)} en esta manga.`);
  const movers=enriched.filter(d=>d.positionChange||d.trend).sort((a,b)=>Math.abs(b.positionChange||b.trend)-Math.abs(a.positionChange||a.trend));
  if(movers[0])insights.push(`${movers[0].name} es el movimiento a vigilar en la torre de tiempos.`);
  const closeBattle=L.battleGroups(enriched,battleThresholdSeconds)[0];
  if(closeBattle){const names=closeBattle.drivers.map(driver=>driver.name),label=names.length===2?names.join(' y '):`${names.slice(0,-1).join(', ')} y ${names.at(-1)}`;insights.push(`Lucha por el puesto ${closeBattle.startPosition}: ${label} ruedan en la misma vuelta dentro de un grupo de ${decimal(closeBattle.spanSeconds,3)} s.`);}
  const trackingLost=enriched.find(driver=>{const state=lapProgressState(driver);return state&&state.hiddenAfterNoCrossing;}),trackingWarning=!trackingLost&&enriched.find(driver=>{const state=lapProgressState(driver);return state&&state.missingCrossing;});
  if(trackingLost)insights.push(`${trackingLost.name} lleva más de un minuto sin un nuevo cruce y se ha retirado temporalmente del mapa. Reaparecerá si vuelve a pasar por el transpondedor.`);
  else if(trackingWarning){const state=lapProgressState(trackingWarning);insights.push(`${trackingWarning.name} lleva ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} segundos sin registrar un cruce: posible incidencia en pista.`);}
  if(demoMode){const noStart=enriched.find(driver=>{const state=lapProgressState(driver);return state&&state.didNotStart;});if(noStart)insights.push(`${noStart.name} figura sin salida registrada en el cronometraje.`);}
  let urgentStrategy=null;
  if(category==='NITRO'){
    const strategy=enriched.map(driver=>({driver,signal:pitSignal(driver),profile:pitProfile(driver)})).filter(item=>item.signal&&item.profile);
    const urgent=strategy.find(item=>item.signal.state==='pit-live'||item.signal.state==='pit'||item.signal.state==='incident')||strategy.find(item=>item.signal.state==='window');urgentStrategy=urgent||null;
    if(urgent){
      const window=urgent.signal.window,lapText=window?` en torno a las vueltas ${window.from}–${window.to}`:'';
      if(urgent.signal.state==='incident')insights.push(`${urgent.driver.name} encadena una pérdida que ya no encaja con una parada aislada: posible incidencia, con confianza ${urgent.signal.confidence}.`);
      else if(urgent.signal.state==='pit-live'||urgent.signal.state==='pit')insights.push(`${urgent.driver.name}: repostaje probable${lapText}; el retraso al transponder coincide con su patrón aprendido.`);
      else insights.push(`${urgent.driver.name} se aproxima a su ventana de repostaje${lapText}. Conviene vigilar su próximo cruce.`);
    }
  }
  insights.push(`${enriched.filter(d=>d.matchedPilot).length} pilotos están enlazados automáticamente con la clasificación del campeonato.`);
  $('liveInsights').innerHTML=insights.map(text=>`<div class="insight">${esc(text)}</div>`).join('');
  const narrative=[];
  for(const text of broadcast.paragraphs.slice(0,2))narrative.push({key:`championship:${text}`,kind:'CAMPEONATO',text});
  if(leader&&leader.laps)narrative.push({key:`leader:${leader.key||leader.name}:${leader.laps}`,kind:'CARRERA',lap:leader.laps,text:`${leader.name} lidera con ${leader.laps} vuelta${leader.laps===1?'':'s'}${leader.gapPrevious?` y ${leader.gapPrevious} sobre el segundo`:''}.`});
  if(fastest)narrative.push({key:`fastest:${fastest.key||fastest.name}:${fastest.bestSeconds}`,kind:'VUELTA RÁPIDA',lap:fastest.laps,text:`${fastest.name} marca la mejor vuelta: ${fastest.best}, a ${speedLabel(fastest.bestSeconds)} de media.`});
  if(movers[0])narrative.push({key:`mover:${movers[0].key||movers[0].name}:${movers[0].position}:${movers[0].positionChange||movers[0].trend}`,kind:'POSICIONES',lap:movers[0].laps,text:`${movers[0].name} es el movimiento a vigilar en la clasificación.`});
  if(closeBattle){const names=closeBattle.drivers.map(driver=>driver.name),label=names.length===2?names.join(' y '):`${names.slice(0,-1).join(', ')} y ${names.at(-1)}`;narrative.push({key:`battle:${closeBattle.drivers.map(driver=>driver.key||driver.name).join('|')}`,kind:'LUCHA',lap:Math.max(...closeBattle.drivers.map(driver=>driver.laps||0)),cooldown:20000,text:`Lucha por el puesto ${closeBattle.startPosition}: ${label}, separados por ${decimal(closeBattle.spanSeconds,3)} s.`});}
  if(trackingLost)narrative.push({key:`off-track:${trackingLost.key||trackingLost.name}`,kind:'INCIDENCIA',lap:trackingLost.laps,text:`${trackingLost.name} supera un minuto sin cruce y sale temporalmente del mapa.`});
  else if(trackingWarning){const state=lapProgressState(trackingWarning);narrative.push({key:`tracking:${trackingWarning.key||trackingWarning.name}:${Math.floor((state.sinceLastCrossing||state.elapsed||0)/10)}`,kind:'AVISO',lap:trackingWarning.laps,cooldown:10000,text:`${trackingWarning.name} lleva ${Math.floor(state.sinceLastCrossing||state.elapsed||0)} segundos sin registrar un cruce.`});}
  if(urgentStrategy){const {driver,signal}=urgentStrategy,window=signal.window,lapText=window?` entre las vueltas ${window.from} y ${window.to}`:'';narrative.push({key:`strategy:${driver.key||driver.name}:${signal.state}`,kind:signal.state==='incident'?'INCIDENCIA':'ESTRATEGIA',lap:driver.laps,cooldown:15000,text:signal.state==='incident'?`${driver.name} acumula una pérdida que ya no encaja con un repostaje aislado.`:signal.state==='pit-live'||signal.state==='pit'?`${driver.name} está probablemente repostando${lapText}; su retraso encaja con el patrón previsto.`:`${driver.name} se aproxima a su ventana de repostaje${lapText}.`});}
  for(const item of activeIncidents)narrative.push({key:`rule:${item.pilot}:${item.type}:${item.time}`,kind:'REGLAMENTO',text:`${item.pilot}: ${item.rule.title}. ${item.consequence}`});
  if(!demoMode||demoPlaying||demoCurrentElapsed()>0)recordLiveNarrative(narrative);
}
function renderScenarioSelector(){
  if(!result)return;const select=$('scenarioPilot'),current=select.value;
  const candidates=result.rows.filter(row=>row.pilot.active&&!row.pilot.livePlaceholder&&row.rankMin<=8).slice(0,12);
  select.innerHTML=candidates.map(row=>`<option value="${esc(row.pilot.id)}">${esc(row.pilot.shortName)}</option>`).join('');
  if(candidates.some(row=>row.pilot.id===current))select.value=current;renderObjectives();
}
function scenarioAnalysis(pilotId){
  const cacheKey=`${category}:${pilotId}`;if(scenarioCache.has(cacheKey))return scenarioCache.get(cacheKey);
  const seed=seeds[category],base=E.createState(seed),pilot=base.pilots.find(p=>p.id===pilotId);if(!pilot)return null;
  const count=base.pilots.filter(p=>p.active&&!p.noClassification).length,targets=[];
  for(let target=1;target<=4;target++){
    let possible=0,secure=0;
    for(let position=1;position<=count;position++){
      const state=E.clone(base);state.pilots.find(p=>p.id===pilotId).position=String(position);const calculated=E.calculate(seed,state),row=calculated.rows.find(r=>r.pilot.id===pilotId);
      if(row.rankMin<=target)possible=position;if(row.rankMax<=target)secure=position;
    }
    targets.push({target,possible,secure});
  }
  const value={pilot,targets,title:S.titlePaths(seed,base,pilotId)};scenarioCache.set(cacheKey,value);return value;
}
function renderObjectives(){
  const value=scenarioAnalysis($('scenarioPilot').value);if(!value){$('objectiveGrid').innerHTML='<div class="empty-state">Sin escenarios disponibles.</div>';return;}
  const labels=['Campeón','Top 2','Top 3','Top 4'];
  $('objectiveGrid').innerHTML=value.targets.map((item,index)=>`<article><span>${labels[index]}</span><strong>${item.possible?`Opciones hasta ${ordinal(item.possible)}`:'Sin combinación'}</strong><small>${item.secure?`Lo asegura terminando ${ordinal(item.secure)} o mejor.`:item.possible?'Depende de los resultados de sus rivales.':'No alcanza este objetivo con la parrilla actual.'}</small></article>`).join('');
  const paths=value.title;
  $('titlePaths').innerHTML=!paths.ready?`<p>${esc(paths.reason)}</p>`:paths.rows.length?paths.rows.slice(0,8).map(row=>`<p><strong>Si termina ${ordinal(row.position)}:</strong> ${row.unconditional?'sería campeón sin depender de nadie.':row.requirements.map(req=>req.contiguous?`${req.name}, ${ordinal(req.from)} o peor`:`${req.name} en ${req.places.map(ordinal).join(', ')}`).join(' · ')}</p>`).join(''):`<p>${esc(paths.reason)}</p>`;
  renderRivalThresholds(value.pilot.id,Number($('scenarioTarget').value)||1);
}

function contiguousThreshold(places,validPlaces){
  if(!places.length)return null;const set=new Set(places);
  for(const place of validPlaces)if(validPlaces.filter(value=>value>=place).every(value=>set.has(value)))return place;
  return null;
}
function renderRivalThresholds(pilotId,target){
  const seed=seeds[category],base=E.createState(seed),own=base.pilots.find(p=>p.id===pilotId),live=projectedState&&projectedState.pilots.find(p=>p.id===pilotId);
  if(!own){$('rivalThresholds').innerHTML='<div class="empty-compact">Piloto no disponible.</div>';return;}
  base.pilots.forEach(p=>p.position='');const active=base.pilots.filter(p=>p.active&&!p.noClassification),valid=Array.from({length:active.length},(_,i)=>i+1);
  const analysis=scenarioAnalysis(pilotId),objective=analysis&&analysis.targets[target-1];const anchor=Number(live&&live.position)||(objective&&objective.possible)||1;
  own.position=String(Math.min(anchor,active.length));
  if(objective&&objective.secure===active.length){$('rivalThresholds').innerHTML=`<div class="threshold"><strong>${esc(own.shortName)}</strong> ya tiene asegurado el top ${target} con cualquier puesto de la prueba; no depende de un rival concreto.</div>`;return;}
  const rivals=(result?result.rows:[]).filter(row=>row.pilot.id!==pilotId&&!row.pilot.livePlaceholder&&base.pilots.some(p=>p.id===row.pilot.id&&p.active)).slice(0,7),lines=[];
  for(const rivalRow of rivals){
    const possible=[],secure=[];
    for(const place of valid.filter(value=>value!==Number(own.position))){
      const state=E.clone(base),rival=state.pilots.find(p=>p.id===rivalRow.pilot.id);if(!rival)continue;rival.position=String(place);
      const calculated=E.calculate(seed,state),row=calculated.rows.find(item=>item.pilot.id===pilotId);if(!row)continue;
      if(row.rankMin<=target)possible.push(place);if(row.rankMax<=target)secure.push(place);
    }
    const available=valid.filter(value=>value!==Number(own.position)),secureFrom=contiguousThreshold(secure,available),possibleFrom=contiguousThreshold(possible,available);
    if(secureFrom&&secureFrom>available[0])lines.push(`<div class="threshold"><strong>${esc(rivalRow.pilot.shortName)}</strong>: si acaba <span>${ordinal(secureFrom)} o peor</span>, ${esc(own.shortName)} asegura el top ${target} aunque cambien los demás resultados.</div>`);
    else if(possibleFrom&&possibleFrom>available[0])lines.push(`<div class="threshold"><strong>${esc(rivalRow.pilot.shortName)}</strong>: desde ${ordinal(possibleFrom)} o peor mantiene abierta la opción de top ${target}; todavía intervienen otros rivales.</div>`);
  }
  $('rivalThresholds').innerHTML=lines.slice(0,4).join('')||'<div class="empty-compact">Este objetivo depende de una combinación de varios pilotos; no hay un único rival que lo resuelva.</div>';
}
function renderStories(){
  if(!result)return;const stories=[];
  if(snapshot.group)stories.push(['MANGA ACTIVA',snapshot.group,`La torre refleja esta manga; ${officialRanking.length?'el campeonato usa el ranking agregado que MyRCM ya ha publicado.':'el campeonato mantiene resultados pendientes hasta disponer de la general agregada.'}`]);
  const open=result.podium[0].candidates;if(open.length>1)stories.push(['TÍTULO ABIERTO',`${open.length} pilotos todavía pueden ser campeones`,open.slice(0,5).map(row=>row.pilot.shortName).join(', ')+(open.length>5?'…':'')]);
  else if(open.length===1)stories.push(['CAMPEÓN PROYECTADO',open[0].pilot.shortName,`La combinación recibida lo coloca primero con ${open[0].min}–${open[0].max} puntos.`]);
  const missing=result.missing.length;if(missing)stories.push(['DATOS PENDIENTES',`${missing} resultados siguen abiertos`,rankingStatus==='unavailable'?'El ranking agregado no está disponible todavía; la torre de tiempos continúa funcionando.':'La proyección conserva rangos y no convierte una manga eléctrica en clasificación general.']);
  stories.push(['LECTURA SEGURA','MyRCM permanece como fuente',`Esta pantalla interpreta el flujo público y mantiene separado el cierre oficial de la proyección en directo.`]);
  $('storyFeed').innerHTML=stories.map(([tag,title,text])=>`<article class="story"><span>${esc(tag)}</span><strong>${esc(title)}</strong><p>${esc(text)}</p></article>`).join('');
}
function movementStory(pilotId,delta){
  if(!projectedState||!result||!result.complete)return null;
  const before=result.rows.find(row=>row.pilot.id===pilotId),pilot=projectedState.pilots.find(p=>p.id===pilotId);if(!before||!pilot||!pilot.position)return null;
  const target=Number(pilot.position)+delta;if(target<1||target>result.rankedCount)return null;
  try{
    const moved=E.stepPosition(projectedState,pilotId,delta),calculated=E.calculate(seeds[category],moved),after=calculated.rows.find(row=>row.pilot.id===pilotId);if(!after)return null;
    const beforeRank=before.rankMin,afterRank=after.rankMin,beforePoints=before.exact?before.exact.total:before.min,afterPoints=after.exact?after.exact.total:after.min;
    return {pilot:before.pilot,trackFrom:Number(pilot.position),trackTo:target,beforeRank,afterRank,pointsDelta:afterPoints-beforePoints,important:beforeRank!==afterRank};
  }catch{return null;}
}
function renderIntelligence(){
  const hasAggregate=officialRanking.length>0,ecoOpen=category==='ECO'&&hasAggregate&&!officialFinalComplete;
  $('intelligenceSource').textContent=!hasAggregate?'Manga activa · general pendiente':ecoOpen?'Agregado ECO provisional':'Ranking agregado MyRCM';
  const secured=(possibilityResult&&possibilityResult.valid?possibilityResult.rows:[]).filter(row=>!row.pilot.livePlaceholder&&row.rankMin===row.rankMax&&row.rankMin<=4).sort((a,b)=>a.rankMin-b.rankMin);
  $('securedPositions').innerHTML=secured.length?secured.map(row=>`<span><strong>${ordinal(row.rankMin)}</strong>${esc(row.pilot.shortName)}</span>`).join(''):'<span><strong>0</strong>plazas cerradas</span>';
  const currentChampion=result&&result.podium[0]&&result.podium[0].certain.length===1?result.podium[0].certain[0]:null,lockedChampion=secured.find(row=>row.rankMin===1);
  if(!hasAggregate){$('decisiveTag').textContent='DATOS AÚN INSUFICIENTES';$('decisiveHeadline').textContent='La manga activa no decide por sí sola la general';$('decisiveDetail').textContent='La torre ofrece ritmo y posiciones de esta manga. El campeonato conserva rangos hasta que MyRCM publique el orden agregado de la categoría.';}
  else if(ecoOpen&&lockedChampion){$('decisiveTag').textContent='TÍTULO MATEMÁTICAMENTE ASEGURADO';$('decisiveHeadline').textContent=`${lockedChampion.pilot.shortName} ya no puede perder el campeonato`;$('decisiveDetail').textContent='La proyección sigue abierta para las demás plazas, pero ni el orden más desfavorable de las finales restantes cambia el campeón.';}
  else if(ecoOpen){$('decisiveTag').textContent='ECO · FINALES EN CURSO';$('decisiveHeadline').textContent='La última final todavía puede cambiar la general';$('decisiveDetail').textContent=`Si terminara con el agregado actual, ${currentChampion?currentChampion.pilot.shortName:'el líder provisional'} encabezaría el campeonato. Solo se marcan como seguras las plazas que sobreviven a cualquier orden restante.`;}
  else if(currentChampion){$('decisiveTag').textContent='SI TERMINARA ASÍ';$('decisiveHeadline').textContent=`${currentChampion.pilot.shortName} encabeza la proyección del campeonato`;$('decisiveDetail').textContent='La clasificación agregada de MyRCM se ha cruzado con los resultados anteriores, descartes, bonificaciones y desempates del campeonato.';}
  else{$('decisiveTag').textContent='CAMPEONATO ABIERTO';$('decisiveHeadline').textContent='Todavía hay varias combinaciones posibles';$('decisiveDetail').textContent='La pantalla mantiene intervalos de posición y evita atribuir un puesto que aún dependa de resultados pendientes.';}
  const candidates=(result&&result.complete?result.rows:[]).filter(row=>!row.pilot.livePlaceholder&&projectedState.pilots.some(p=>p.id===row.pilot.id&&p.position)).slice(0,8),moves=[];
  for(const row of candidates){for(const delta of [-1,1]){const item=movementStory(row.pilot.id,delta);if(item)moves.push(item);}}
  moves.sort((a,b)=>Number(b.important)-Number(a.important)||Math.abs(b.pointsDelta)-Math.abs(a.pointsDelta));
  $('swingFeed').innerHTML=moves.slice(0,4).map(item=>{const action=item.trackTo<item.trackFrom?'gana una plaza':'pierde una plaza',rankChange=item.beforeRank===item.afterRank?`seguiría ${ordinal(item.beforeRank)}`:`pasaría del ${ordinal(item.beforeRank)} al ${ordinal(item.afterRank)}`,points=item.pointsDelta?`${item.pointsDelta>0?'+':''}${item.pointsDelta} puntos`:'sin variar sus puntos útiles';return `<article class="swing-item"><span>SI ${esc(item.pilot.shortName).toUpperCase()} ${action.toUpperCase()}</span><strong>${rankChange} del campeonato</strong><p>${ordinal(item.trackFrom)} → ${ordinal(item.trackTo)} en la prueba · ${points}.</p></article>`;}).join('')||'<div class="empty-compact">Los cruces aparecerán cuando el ranking agregado permita simular cambios de posición.</div>';
}
function renderPhases(){
  const groups=new Map();
  for(const run of officialRuns){const key=`${run.phase||'Mangas'}|${run.group||''}`;if(!groups.has(key))groups.set(key,{phase:run.phase||'Mangas',group:run.group||'',total:0,done:0});const item=groups.get(key);item.total++;if(/available|finalizado|finished|completed/.test(String(run.status).toLowerCase()))item.done++;}
  const items=[...groups.values()];
  if(snapshot&&snapshot.group){const label=L.phaseFromGroup(snapshot.group),phaseKey=L.normalize(label).replace(/S$/,'');if(!items.some(item=>L.normalize(item.phase).replace(/S$/,'').includes(phaseKey)||phaseKey.includes(L.normalize(item.phase).replace(/S$/,''))))items.push({phase:label,group:snapshot.group,total:1,done:0,live:true});}
  $('phaseTimeline').innerHTML=items.length?items.slice(-7).map(item=>{const done=item.total>0&&item.done===item.total,live=item.live||(!done&&snapshot&&L.normalize(snapshot.group).includes(L.normalize(item.group)));return `<div class="phase-item ${done?'done':live?'live':''}"><i></i><strong>${esc(item.phase)}${item.group?` · ${esc(item.group)}`:''}</strong><small>${done?`${item.done}/${item.total} publicadas`:live?'EN DIRECTO':`${item.done}/${item.total}`}</small></div>`;}).join(''):'<div class="empty-compact">Todavía no hay informes de fases publicados.</div>';
}
function renderRules(){
  if(!R||!R.categories||!R.categories[category])return;
  const rules=R.categories[category],ruleUrl=rules.url;
  $('technicalCategory').textContent=rules.label;$('technicalFormat').textContent=`${rules.format} (${rules.formatArticle})`;
  $('technicalSpecs').innerHTML=rules.specs.map(([label,value,article])=>`<div class="technical-spec"><strong>${esc(label)}</strong><div>${esc(value)}<small>${esc(article)}</small></div></div>`).join('');
  $('categoryRuleLink').href=ruleUrl;
  const notes=[{tag:'CAMPEONATO',title:R.championship.title,text:R.championship.text,article:R.championship.article,url:ruleUrl},{tag:category,title:`Formato ${rules.label}`,text:rules.format,article:rules.formatArticle,url:ruleUrl}];
  const exactRows=(result&&result.valid?result.rows:[]).filter(row=>!row.pilot.livePlaceholder&&row.exact);
  const focus=exactRows.find(row=>row.rankMin===1)||exactRows[0];
  if(focus&&focus.exact.discard){
    const discard=focus.exact.discard,round=Number(discard.round)+1,position=discard.position==null?'ausencia':ordinal(discard.position);
    notes.push({tag:'EJEMPLO ACTUAL',title:`${focus.pilot.shortName} descarta C${round}`,text:`Con el orden proyectado, su resultado descartado es C${round}: ${position}, ${discard.points} puntos. Sus otras dos puntuaciones forman el total de ${focus.exact.total} puntos.`,article:R.championship.article,url:ruleUrl});
  }
  const tie=exactRows.find(row=>row.tieReason);
  if(tie)notes.push({tag:'DESEMPATE APLICADO',title:tie.tieReason,text:`${tie.pilot.shortName} comparte puntuación y su orden se resuelve aplicando la secuencia reglamentaria de desempate.`,article:R.tieBreak.article,url:R.tieBreak.url});
  $('ruleFeed').innerHTML=notes.map(note=>`<article class="rule-note"><span>${esc(note.tag)}</span><strong>${esc(note.title)}</strong><p>${esc(note.text)}</p><a href="${esc(note.url)}" target="_blank" rel="noopener noreferrer">${esc(note.article)} · abrir fuente</a></article>`).join('');

  const pilotSelect=$('incidentPilot'),selected=pilotSelect.value;
  const names=[];
  for(const entry of officialRanking)if(entry.name&&!names.includes(entry.name))names.push(entry.name);
  if(!names.length)for(const driver of enriched)if(driver.name&&!names.includes(driver.name))names.push(driver.name);
  if(!names.length){const state=projectedState||E.createState(seeds[category]);for(const pilot of state.pilots)if(pilot.active&&!pilot.noClassification&&!pilot.livePlaceholder&&!names.includes(pilot.name))names.push(pilot.name);}
  pilotSelect.innerHTML=names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if(names.includes(selected))pilotSelect.value=selected;
  renderIncidentFeed();
}
function incidentConsequence(type){
  if(type!=='technical')return 'La posición y los puntos no se recalculan hasta que dirección de carrera o MyRCM publique el resultado corregido.';
  if(category==='ECO')return 'Esa final puede convertirse en el peor resultado y quedar descartada si las otras tres son mejores; el agregado oficial determina cuáles son las tres que cuentan.';
  return 'La pérdida de vueltas afecta a la fase en la que se detectó y puede impedir el avance o alterar la posición global de la prueba.';
}
function renderIncidentFeed(){
  const active=incidents.filter(item=>item.category===category);
  $('incidentFeed').innerHTML=active.length?active.slice().reverse().map(item=>`<article class="incident-item"><strong>${esc(item.pilot)}</strong> · <span>${esc(item.rule.title)}</span><div>${esc(item.rule.text)} ${esc(item.consequence)}</div><small><a href="${esc(item.rule.url)}" target="_blank" rel="noopener noreferrer">${esc(item.rule.article)}</a> · añadida a las ${esc(item.time)}</small></article>`).join(''):'<div class="empty-compact">No hay decisiones confirmadas añadidas al guion.</div>';
}
function renderHistory(){
  const liveNames=[];
  for(const item of officialRanking)if(item.name&&!liveNames.includes(item.name))liveNames.push(item.name);
  if(!liveNames.length)for(const item of enriched)if(item.name&&!liveNames.includes(item.name))liveNames.push(item.name);
  const matched=[];
  for(const liveName of liveNames){
    const pilot=L.matchPilot(liveName,historyPilots);if(!pilot||matched.some(item=>item.pilot.id===pilot.id))continue;
    const entries=historyData.championshipPodiums.filter(entry=>entry.podium.includes(pilot.name)).sort((a,b)=>b.year-a.year);
    if(entries.length)matched.push({pilot,entries,titles:historyData.computedTitleCounts[pilot.name]||0});
  }
  matched.sort((a,b)=>b.titles-a.titles||b.entries[0].year-a.entries[0].year||a.pilot.name.localeCompare(b.pilot.name,'es'));
  const placeLabel=position=>position===0?'campeón':position===1?'subcampeón':'tercero';
  $('historyFeed').innerHTML=matched.length?matched.slice(0,6).map(item=>{
    const recent=item.entries.slice(0,3).map(entry=>`${entry.year} · ${entry.category}: ${placeLabel(entry.podium.indexOf(item.pilot.name))}`).join(' · ');
    const cautions=item.entries.filter(entry=>entry.verification!=='verified_document'&&(entry.verification!=='identity_conflict'||item.pilot.name==='Mario Guerra')).length;
    return `<article class="history-item"><div><strong>${esc(item.pilot.name)}</strong><span>${item.titles?`${item.titles} título${item.titles===1?'':'s'} de España`:'Podio nacional'}</span></div><p>${esc(recent)}</p>${cautions?`<small>${cautions} referencia${cautions===1?'':'s'} con matiz documental.</small>`:''}</article>`;
  }).join(''):'<div class="empty-compact">Ningún piloto de la manga actual coincide todavía con el palmarés nacional cargado.</div>';
  const verified=historyData.championshipPodiums.filter(entry=>entry.verification==='verified_document').length,total=historyData.championshipPodiums.length;
  $('historyCoverage').textContent=`${verified} de ${total} campeonatos/modalidades sin observaciones documentales · ${total-verified} referencias con cautela explícita.`;
}
function renderEventImpact(){
  $('eventImpactLabel').textContent=!officialRanking.length?'Esperando clasificación agregada':category==='ECO'&&!officialFinalComplete?'Orden provisional entre finales':'Clasificación agregada publicada';
  if(!officialRanking.length){$('eventImpactRows').innerHTML='<div class="empty-compact">La manga visible aporta ritmo; la general de la prueba aparecerá con el agregado de MyRCM.</div>';return;}
  const roster=E.createState(seeds[category]).pilots;
  $('eventImpactRows').innerHTML=officialRanking.slice(0,12).map(entry=>{
    const pilot=L.matchPilot(entry.name,roster),row=pilot&&result&&result.rows.find(item=>item.pilot.id===pilot.id);
    let effect='Fuera de la general cargada',detail=category==='ECO'&&!officialFinalComplete?'Agregado todavía provisional':'Resultado de la prueba';
    if(row){const rank=row.rankMin===row.rankMax?ordinal(row.rankMin):range(row.rankMin,row.rankMax),baseline=pilot.baselineRank,change=baseline?baseline-row.rankMin:0;effect=`Campeonato ${rank}`;detail=change>0?`Sube ${change} puesto${change===1?'':'s'}`:change<0?`Baja ${Math.abs(change)} puesto${change===-1?'':'s'}`:'Mantiene su posición de entrada';}
    return `<article class="impact-row"><strong>${entry.position}</strong><div><strong>${esc(entry.name)}</strong><small>${esc(detail)}</small></div><span>${esc(effect)}</span></article>`;
  }).join('');
}
document.querySelectorAll('.category-switch [data-category]').forEach(button=>button.addEventListener('click',()=>switchCategory(button.dataset.category,{manual:true})));
document.querySelectorAll('[data-view-button]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.viewButton)));
$('liveGeneralTab').addEventListener('click',()=>setLiveLowerPanel('general'));
$('liveStoryTab').addEventListener('click',()=>setLiveLowerPanel('story'));
$('connectButton').addEventListener('click',connect);
$('demoTab').addEventListener('click',()=>void startDemo());
$('demoPlayPause').addEventListener('click',toggleDemoPlayback);
$('demoRestart').addEventListener('click',restartDemo);
$('demoSpeed').addEventListener('change',event=>setDemoSpeed(event.target.value));
$('demoSeek').addEventListener('input',event=>seekDemo(event.target.value));
$('archiveRaceSelect').addEventListener('change',event=>void changeReplaySource(event.target.value));
$('trackMapToggle').addEventListener('click',toggleMap);
$('eventKey').addEventListener('keydown',event=>{if(event.key==='Enter')connect();});
$('pauseButton').addEventListener('click',()=>{paused=!paused;$('pauseButton').textContent=paused?'Reanudar pantalla':'Pausar pantalla';setConnection(paused?'paused':'live',paused?'Pantalla pausada':'MyRCM conectado');if(!paused&&queuedSnapshot){const next=queuedSnapshot;queuedSnapshot=null;applySnapshot(next,true);}});
$('scenarioPilot').addEventListener('change',renderObjectives);
$('scenarioTarget').addEventListener('change',renderObjectives);
$('addIncident').addEventListener('click',()=>{const pilot=$('incidentPilot').value,type=$('incidentType').value,rule=R.incidents[type];if(!pilot||!rule){toast('Selecciona un piloto y una decisión confirmada.',true);return;}incidents.push({pilot,type,rule:{...rule,url:rule.url||R.categories[category].url},consequence:incidentConsequence(type),category,time:new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})});renderIncidentFeed();renderBroadcast();toast('Incidencia añadida al guion; la proyección espera el resultado oficial.');});
$('copyBroadcast').addEventListener('click',async()=>{const incidentText=incidents.filter(item=>item.category===category).map(item=>`REGLAMENTO · ${item.pilot}: ${item.rule.title}. ${item.rule.text} ${item.consequence}`),text=[`${snapshot&&snapshot.name||activeCircuit.name} · ${category} · DIRECTO`,snapshot&&snapshot.group||'',...(broadcast?broadcast.paragraphs:[]),...incidentText].filter(Boolean).join('\n\n');try{await navigator.clipboard.writeText(text);toast('Guion copiado.');}catch{toast('El navegador no ha permitido copiar el guion.',true);}});
window.addEventListener('pagehide',()=>{clearInterval(pitClock);clearInterval(lapClock);clearInterval(demoCountdownTimer);clearTimeout(archiveFlushTimer);for(const frames of archiveQueues.values()){if(!frames.length)continue;const body=new Blob([JSON.stringify({eventKey:$('eventKey').value.trim(),circuit:activeCircuit,frames})],{type:'application/json'});navigator.sendBeacon('/api/myrcm/archive',body);}archiveQueues.clear();closeSocket();});
renderRules();
renderHistory();
renderRegistrations();
$('demoReportLink').hidden=false;
try{setMapCollapsed(localStorage.getItem(mapCollapseKey)==='1');}catch{setMapCollapsed(false);}
applyCircuit(defaultCircuit);
setLiveLowerPanel('general');renderLiveNarrative();
pitClock=setInterval(()=>{if(!demoMode&&category==='NITRO'&&snapshot&&!paused){renderTiming();renderPitStrategy();renderBroadcast();}},1000);
lapClock=setInterval(()=>{if(paused)return;if(demoMode)renderDemoFrame();else if(snapshot)updateLapVisuals();},33);
connect();
})();
