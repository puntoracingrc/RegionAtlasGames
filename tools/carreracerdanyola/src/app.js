/* UI for the standalone app. All user text is escaped before insertion. */
'use strict';
(() => {
const E = window.RaceDeskEngine;
const seeds = JSON.parse(document.getElementById('seedData').textContent);
const B = window.RaceDeskBroadcast;
const S = window.RaceDeskScenarios;
let scenarioPilotBy={NITRO:"cristian",ECO:"joao"}, scenarioCacheKey="";
let category='NITRO', seed=seeds.NITRO;
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => Number(n).toLocaleString('es-ES');
const place = n => `${n}.º`;
const range = (a,b,ordinal=false) => a === b ? ordinal ? place(a) : num(a) : ordinal ? `${a}.º–${b}.º` : `${num(a)}–${num(b)}`;
const STORE = 'regionatlas:cerdanyola-gt8-2026:race-desk:v2';

let sessions={NITRO:E.createState(seeds.NITRO),ECO:E.createState(seeds.ECO)}, undoBy={NITRO:[],ECO:[]};
let state=sessions.NITRO, undo=undoBy.NITRO, filter='favorites', result, broadcast, saveTimer, toastTimer, storageAvailable=true;
function readCategory(raw,cat,restoreFinal=false){
 const s=E.importState(raw,seeds[cat]);
 const checked=E.validate(s);if(checked.errors.length)throw new Error(checked.errors.map(e=>e.message).join(' '));
 if(restoreFinal&&raw.mode==='final'&&raw.reviewed===true&&E.calculate(seeds[cat],s).finalReady){s.mode='final';s.reviewed=true;}
 s.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;
 return s;
}
function readEnvelope(raw,restoreFinal=false){
 if(!raw||raw.schemaVersion!==2||raw.eventId!=='cerdanyola-gt8-2026'||!raw.categories||!raw.categories.NITRO||!raw.categories.ECO)throw new Error('No es una copia NITRO + ECO de Cerdanyola.');
 return {categories:{NITRO:readCategory(raw.categories.NITRO,'NITRO',restoreFinal),ECO:readCategory(raw.categories.ECO,'ECO',restoreFinal)},category:raw.activeCategory==='ECO'?'ECO':'NITRO'};
}
function envelope(){sessions[category]=state;return {schemaVersion:2,eventId:'cerdanyola-gt8-2026',activeCategory:category,categories:sessions};}
try{
 const saved=localStorage.getItem(STORE);
 if(saved){const data=readEnvelope(JSON.parse(saved),true);sessions=data.categories;category=data.category;}
 seed=seeds[category];state=sessions[category];undo=undoBy[category];
}catch(error){storageAvailable=false;setTimeout(()=>toast('No se pudo recuperar el guardado local. La base original sigue intacta. Usa Guardar copia.',true),150);}
function switchCategory(cat){
 if(!seeds[cat]||cat===category)return;
 clearTimeout(saveTimer);sessions[category]=state;undoBy[category]=undo;
 category=cat;seed=seeds[cat];state=sessions[cat];undo=undoBy[cat];
 filter='favorites';$('search').value='';$('quickInput').value='';$('quickError').textContent='';
 $('showAll').checked=false;$('finishSection').open=false;
 update();renderInputs();renderHelp();save();
}
function toast(message,error=false) {
  $('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?8000:3500);
}
function remember() { undo.push(E.clone(state));if(undo.length>60)undo.shift(); }
function changed({rememberFirst=false}={}) {
  if(rememberFirst)remember();
  state.mode='live';state.reviewed=false;
  update();scheduleSave();
}
function scheduleSave() {
  clearTimeout(saveTimer);$('saveStatus').textContent='Guardando en este navegador…';
  saveTimer=setTimeout(save,180);
}
function save() {
  state.updatedAt=new Date().toISOString();
  try {localStorage.setItem(STORE,JSON.stringify(envelope()));storageAvailable=true;$('saveStatus').textContent=`Guardado aquí · ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;}
  catch { storageAvailable=false;$('saveStatus').textContent='Sin guardado local. Usa Guardar copia para no perder datos.'; }
}
window.addEventListener('pagehide',save);
window.addEventListener('storage',event=>{if(event.key===STORE)toast('Otra pestaña ha modificado la copia local. Esta pantalla no se ha sobrescrito; guarda una copia antes de recargar.',true);});
function pilotById(id) { return state.pilots.find(p=>p.id===id); }
function visiblePilots() {
  const q=E.normalize($('search').value);
  return state.pilots.filter(p=>(q || filter==='all' || filter==='active'&&p.active || filter==='favorites'&&p.favorite) && (!q || E.normalize(p.name+' '+p.shortName).includes(q)))
    .sort((a,b)=>(a.active===b.active?0:a.active?-1:1)||(a.position===''?999:Number(a.position))-(b.position===''?999:Number(b.position))||(a.baselineRank??999)-(b.baselineRank??999)||(a.entryRank??999)-(b.entryRank??999));
}
function positionControl(p,table=false){
 if(!p.active)return '<span class="small muted">No corre</span>';
 if(p.noClassification)return '<span class="small muted">Sin puesto</span>';
 const count=state.pilots.filter(x=>x.active&&!x.noClassification).length;
 const used=new Map(state.pilots.filter(x=>x.active&&!x.noClassification&&x.position!==''&&x.id!==p.id).map(x=>[Number(x.position),x.shortName]));
 let options='<option value="">—</option>';
 for(let n=1;n<=count;n++)options+=`<option value="${n}" ${String(n)===p.position?'selected':''} ${used.has(n)?'disabled':''}>${n}${used.has(n)?' · '+esc(used.get(n)):''}</option>`;
 const invalid=p.position!==''&&(!/^\d+$/.test(p.position)||Number(p.position)>count||Number(p.position)<1);
 if(invalid)options+=`<option selected value="${esc(p.position)}">${esc(p.position)} !</option>`;
 const control=`<select class="rank-input ${table?'table-select':''}" data-rank="${esc(p.id)}" aria-label="Puesto en Cerdanyola de ${esc(p.name)}" title="Los puestos ocupados no se pueden repetir">${options}</select>`;
 if(table)return control;
 const current=Number(p.position);
 return control+`<div class="rank-step"><button type="button" data-step="${esc(p.id)}" data-delta="-1" ${!p.position||current<=1?'disabled':''} aria-label="Subir un puesto a ${esc(p.name)}" title="Adelanta un puesto e intercambia si está ocupado">↑</button><button type="button" data-step="${esc(p.id)}" data-delta="1" ${!p.position||current>=count?'disabled':''} aria-label="Bajar un puesto a ${esc(p.name)}" title="Baja un puesto e intercambia si está ocupado">↓</button></div>`;
}
function renderInputs() {
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
  document.querySelector('[data-filter="favorites"]').textContent=`Favoritos (${state.pilots.filter(p=>p.favorite).length})`;
  document.querySelector('[data-filter="active"]').textContent=`Parrilla (${state.pilots.filter(p=>p.active).length})`;
  document.querySelector('[data-filter="all"]').textContent=`Todos (${state.pilots.length})`;
  const pilots=visiblePilots();
  $('pilotList').innerHTML=pilots.length?pilots.map(p=>{
    const prior=p.baselineRank?`Anterior ${place(p.baselineRank)} · ${num(p.baselineTotal)} pts`:'Sin resultados previos';
    const badge=p.eligible==='unknown'&&p.active?'<span class="pill warn">Revisar</span>':p.historyNotes?'<span class="pill warn">Revisar fuente</span>':p.category?`<span class="pill">${esc(p.category)}</span>`:'';
    return `<div class="pilot-row ${p.active?'':'inactive'}" data-pilot="${esc(p.id)}"><button type="button" class="icon star ${p.favorite?'on':''}" data-star="${esc(p.id)}" title="Añadir o quitar de favoritos" aria-label="Favorito: ${esc(p.name)}" aria-pressed="${p.favorite}">${p.favorite?'★':'☆'}</button><div><div class="pilot-name">${esc(p.name.toLocaleLowerCase('es-ES').replace(/\b\p{L}/gu,c=>c.toLocaleUpperCase('es-ES')))}${badge}</div><div class="pilot-hint">${esc(prior)}</div><div class="pilot-outcome" data-outcome="${esc(p.id)}"></div></div><div class="rank-box">${p.active&&!p.noClassification?positionControl(p):p.active?'<span class="small muted">Sin puesto</span>':`<button type="button" data-activate="${esc(p.id)}" class="activate quiet">Añadir<br>a hoy</button>`}</div><button type="button" class="settings-button" data-edit="${esc(p.id)}" title="Ajustes: ${esc(p.name)}" aria-label="Ajustes de ${esc(p.name)}">⋯</button></div>`;
  }).join(''):'<div class="empty">No hay pilotos con ese filtro. Busca por nombre o pulsa «Hoy».</div>';
  updateRowHints();
}
function updateRowHints() {
  if(!result)return;
  const invalidIds=new Set(result.errors.flatMap(e=>e.ids));
  document.querySelectorAll('[data-pilot]').forEach(el=>{
    const id=el.dataset.pilot,p=pilotById(id),r=result.rows.find(x=>x.pilot.id===id);
    if(!p){el.remove();return;}
    el.classList.toggle('invalid',invalidIds.has(id));
    const input=el.querySelector('[data-rank]');if(input)input.setAttribute('aria-invalid',String(invalidIds.has(id)));
    const hint=el.querySelector('[data-outcome]');
    if(!result.valid){hint.textContent=invalidIds.has(id)?'Corrige el puesto para recalcular.':'';return;}
    if(!p.active){hint.textContent='No corre hoy · conserva su histórico';return;}
    if(p.noClassification){hint.textContent=`Cero puntos hoy · general ${range(r.rankMin,r.rankMax,true)}`;return;}
    hint.textContent=p.position!==''?`${range(r.min,r.max)} pts · general ${range(r.rankMin,r.rankMax,true)}`:'Puesto pendiente';
  });
}
function renderPodium() {
  const labels=['Campeón de España','Subcampeón','Tercero de España','Cuarto de España'];
  $('podium').innerHTML=[1,2,3,4].map((n,i)=>{
    const slot=result.valid?result.podium[i]:null;
    const hasCertain=slot&&slot.certain.length===1;
    const certain=hasCertain?slot.certain[0]:null;
    const names=slot?slot.candidates.map(r=>r.pilot.shortName).join(' · '):'';
    return `<article class="podium-card ${i===0?'first':''}"><span class="podium-rank" aria-hidden="true">${n}</span><div class="podium-label">${labels[i]}</div><div class="podium-name">${!result.valid?'Sin calcular':hasCertain?esc(certain.pilot.shortName):slot.certain.length>1?'Empate':'Por decidir'}</div><div class="podium-detail">${!result.valid?'Hay puestos que corregir.':hasCertain?`${range(certain.min,certain.max)} puntos · ${state.mode==='final'?'cierre calculado':'si termina así'}`:esc(slot.candidates.length>3?`${slot.candidates.length} aspirantes · consulta la general`:names||'Revisa los datos de la prueba.')}</div></article>`;
  }).join('');
}
function renderTable() {
  const details=$('showDetails').checked;
  $('resultHead').innerHTML='<tr><th>General</th><th>Piloto</th><th>Hoy</th>'+(details?['C1','C2','C3','Desc.'].map(t=>`<th class="detailcell">${t}</th>`).join(''):'')+'<th style="text-align:right">Puntos</th><th class="delta-col" title="Cambio respecto a la general anterior">Cambio</th></tr>';
  if(!result.valid){$('resultBody').innerHTML=`<tr><td colspan="${details?10:6}" class="empty">No se muestra una clasificación mientras haya puestos inválidos o repetidos.</td></tr>`;return;}
  const rows=$('showAll').checked?result.rows:result.rows.slice(0,10);
  $('resultBody').innerHTML=rows.map(r=>{
    const p=r.pilot, exact=r.exact;
    const today=!p.active?'No corre':p.noClassification?'Sin clasificación':p.position?`Cerdanyola ${place(Number(p.position))}`:'Cerdanyola pendiente';
    const detailInfo=p.eligible==='unknown'&&p.active?' · puntuación por confirmar':p.eligible==='no'&&p.active?' · no puntúa':!p.qualifying&&p.active?' · sin resultado reconocido':'';
    let delta='—';if(p.baselineRank&&r.rankMin===r.rankMax){const diff=p.baselineRank-r.rankMin;delta=diff>0?`↑ ${diff}`:diff<0?`↓ ${-diff}`:'=';}else if(!p.baselineRank)delta='Nuevo';else delta='…';
    const cells=details?p.history.map(pos=>`<td class="detailcell">${pos==null?'—':E.pointsFor(pos,seed.points)}</td>`).join('')+`<td class="detailcell">${exact?exact.todayPoints:'?'}</td><td class="detailcell">${exact?`−${exact.discard.points}`:'?'}</td>`:'';
    return `<tr class="${r.rankMax<=4?'top-result':''}"><td>${range(r.rankMin,r.rankMax,true)}${r.tieSize>1?'<span class="meta">Empate</span>':''}</td><td><button type="button" class="person" data-detail="${esc(p.id)}">${esc(p.shortName)}</button><span class="meta">${esc(today+detailInfo)}</span>${r.tieReason?`<span class="meta" title="${esc(r.tieReason)}">↔ ${esc(r.tieReason)}</span>`:''}</td><td class="today-selector">${positionControl(p,true)}</td>${cells}<td class="points">${range(r.min,r.max)}</td><td class="delta delta-col">${delta}</td></tr>`;
  }).join('');
  $('tableNote').textContent=result.complete?'Cálculo con todos los datos introducidos. Los empates se resuelven por el reglamento, nunca por el nombre. No sustituye a AECAR.':'Rangos conservadores: los extremos no tienen por qué poder ocurrir a la vez. No se atribuye un puesto a un piloto sin dato. Pulsa un nombre para ver el cálculo.';
}
function renderBroadcast(){
 broadcast=B.narrate(seed,state,result);
 $('broadcastTitle').textContent=broadcast.title;
 $('broadcastText').innerHTML=broadcast.paragraphs.map(t=>`<p>${esc(t)}</p>`).join('');
 $('neededPilots').innerHTML=broadcast.needed.length?'<span>Datos útiles para el top 4:</span> '+broadcast.needed.map(p=>`<button type="button" data-find="${esc(p.id)}">${esc(p.name)}</button>`).join(''):'';
 $('copyNarration').disabled=!result.valid;
 const g=B.guide(seed,state);
 $('guideAssumption').textContent=g.compatible?g.assumption:'Has cambiado participantes, permisos o ajustes deportivos. Las combinaciones iniciales dejan de ser aplicables; utiliza el cálculo y el guion dinámico de arriba.';
 $('guideCards').innerHTML=g.compatible?g.cards.map(([title,text])=>`<article><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join(''):'';
 $('guideTitle').textContent=`Claves y combinaciones ${category} para retransmitir`;
}
function update() {
  result=E.calculate(seed,state);
  renderPodium();renderTable();updateRowHints();renderBroadcast();renderTitleScenarios();
  $('modeBadge').innerHTML=`<span class="dot"></span> ${state.mode==='final'?'Cierre calculado':'Simulación manual'}`;
  $('assignedCount').textContent=`${result.assigned} / ${result.rankedCount}`;
  $('progressFill').style.width=`${result.rankedCount?100*result.assigned/result.rankedCount:0}%`;
  $('categoryEyebrow').textContent=`1/8 ${seed.categoryLabel} · Campeonato nacional`;document.body.dataset.category=category;
  $('categoryPanel').setAttribute('aria-labelledby','tab'+category);
  document.querySelectorAll('[data-category]').forEach(b=>{const selected=b.dataset.category===category;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
  $('quickInput').placeholder=category==='NITRO'?'Cristian 1, Daras 3, Marc 2, Fabio 4':'Carles 1, Cristian 2, Joao 3, Daniel 4';
  $('categoryCountNITRO').textContent=sessions.NITRO===state||category==='NITRO'?state.pilots.filter(p=>p.active).length+' en simulación':sessions.NITRO.pilots.filter(p=>p.active).length+' en simulación';
  $('categoryCountECO').textContent=category==='ECO'?state.pilots.filter(p=>p.active).length+' en simulación':sessions.ECO.pilots.filter(p=>p.active).length+' en simulación';
  $('eventPositionNote').textContent=category==='ECO'?'ELÉCTRICO: introduce la general agregada de las finales, no el resultado de una sola final.':'NITRO: introduce el puesto en la general completa de la prueba, no el puesto de una semifinal.';
  $('rosterMeta').textContent=`${state.pilots.length} pilotos cargados · ${result.activeCount} en la simulación`;
  const status=$('status');status.classList.toggle('error',!result.valid);status.classList.toggle('ready',result.valid&&result.complete);
  let message;
  if(!result.valid)message=result.errors.map(e=>esc(e.message)).join('<br>');
  else if(state.mode==='final')message='<strong>Clasificación final calculada.</strong> Es un cierre local con tus resultados, no una publicación oficial. Cualquier cambio vuelve al modo simulación.';
  else if(result.complete)message='<strong>Todos los datos están completos.</strong> Revisa los ajustes y cierra el resultado al terminar la prueba.'+(result.tieReview?' Hay un empate múltiple que requiere revisión.':'');
  else message=`<strong>${broadcast.topFourCertain?'Top 4 calculado sin completar toda la parrilla.':'Puedes calcular con solo los aspirantes.'}</strong> ${result.missing.length} puestos pendientes en la general completa${result.eligibilityPending.length?` y confirmar ${result.eligibilityPending.length} permisos para puntuar`:''}. Parrilla provisional hasta recibir inscritos definitivos; una casilla vacía es resultado pendiente, no ausencia.`;
  status.innerHTML=`<span class="dot status-dot" aria-hidden="true"></span><div>${message}</div>`;
  $('resultTitle').textContent=state.mode==='final'?'Clasificación final calculada':'Así quedaría el campeonato';
  $('resultSubtitle').textContent=result.valid&&result.complete?'Dos mejores de tres · descarte aplicado · sin puntos por asistencia.':'Las casillas vacías siguen pendientes; no cuentan como ausencias.';
  $('undoButton').disabled=!undo.length;
  $('copyButton').disabled=!result.valid;$('csvButton').disabled=!result.valid;$('printButton').disabled=!result.valid;$('raceButton').disabled=!result.valid;
  $('reviewed').checked=state.reviewed;
  $('finishButton').disabled=!result.finalReady||!state.reviewed;
  $('finishHint').textContent=!result.valid?'Corrige los puestos repetidos o inválidos.':result.missing.length?`Faltan ${result.missing.length} puestos. Marca fuera de la carrera a quien no corra.`:result.eligibilityPending.length?`Confirma si puntúan: ${result.eligibilityPending.map(id=>pilotById(id).shortName).join(', ')}.`:result.tieReview?'Empate múltiple pendiente de resolución.':state.mode==='final'?'Cierre guardado. Puedes copiar el resumen o exportar la tabla.':!state.reviewed?'Marca la comprobación antes de cerrar.':'Todo listo para calcular el cierre.';
}
function showEditor(id) {
  const p=pilotById(id);$('editingId').value=id;$('editTitle').textContent=p.name;
  $('editMeta').textContent=`${p.licenseNote||'No figura en la lista facilitada de hoy.'}${p.entryRank?` · Ranking de inscripción: ${p.entryRank} (no es un puesto de hoy).`:''}`;
  $('editActive').checked=p.active;$('editQualifying').checked=p.qualifying;$('editEligible').value=p.eligible;$('editNoClass').checked=p.noClassification;$('editOverride').value=p.pointsOverride;$('deleteCustom').hidden=!p.custom;
  $('editDialog').showModal();
}
function showDetail(id) {
  if(!result.valid)return;
  const r=result.rows.find(r=>r.pilot.id===id),p=r.pilot;$('detailTitle').textContent=p.name;
  let html=`<p>${esc(p.historicalSource)}. Antes de Cerdanyola: <strong>${num(p.baselineTotal)} puntos</strong>.</p><div class="detail-data"><div>General proyectada<strong>${range(r.rankMin,r.rankMax,true)}</strong></div><div>Puntos de campeonato<strong>${range(r.min,r.max)}</strong></div></div>`;
  if(r.exact){
    const s=r.exact;
    html+='<table><thead><tr><th>Prueba</th><th>Puesto</th><th>Puntos</th><th>Cuenta</th></tr></thead><tbody>'+s.races.map(x=>`<tr><td>C${x.round+1}${x.round===seed.rules.totalRounds-1?' · Cerdanyola':''}</td><td>${x.position==null?'—':place(x.position)}</td><td>${x.points}</td><td>${s.discard.round===x.round?'Descartada':'Sí'}</td></tr>`).join('')+'</tbody></table>';
    const sum=s.races.reduce((a,b)=>a+b.points,0);
    html+=`<p><strong>${num(sum)} − ${s.discard.points} + ${s.bonus} = ${num(s.total)} puntos.</strong><br>Se conservan las dos mejores puntuaciones; no se añade ningún extra por asistencia.</p>`;
  }else html+='<p>Falta el puesto de hoy o confirmar el derecho a puntuar. Los intervalos usan los puestos libres y no inventan una clasificación concreta.</p>';
  if(p.historyNotes)html+=`<p><strong>Nota de la fuente:</strong> ${esc(p.historyNotes)}</p>`;
  if(r.tieReason)html+=`<p><strong>Desempate:</strong> ${esc(r.tieReason)}</p>`;
  if(p.pointsOverride!=='')html+=`<p>Has sustituido los puntos automáticos de hoy por ${esc(p.pointsOverride)} puntos oficiales.</p>`;
  $('detailBody').innerHTML=html;$('detailDialog').showModal();
}
function summaryText() {
  const lines=[`CERDANYOLA 2026 — ${state.mode==='final'?'CLASIFICACIÓN FINAL CALCULADA':result.complete?'SIMULACIÓN COMPLETA':'SIMULACIÓN PARCIAL'}`,`Campeonato de España ${seed.categoryLabel}`,''];
  for(const r of result.rows)lines.push(`${range(r.rankMin,r.rankMax,true)} ${r.pilot.name} — ${range(r.min,r.max)} puntos${!r.pilot.active?' · no corre hoy':r.pilot.position?` · Cerdanyola ${place(Number(r.pilot.position))}`:r.pilot.noClassification?' · sin clasificación':' · puesto pendiente'}`);
  lines.push('','Puestos de la prueba introducidos:');
  state.pilots.filter(p=>p.active&&!p.noClassification&&p.position!=='').sort((a,b)=>Number(a.position)-Number(b.position)).forEach(p=>lines.push(`${p.position}. ${p.name}`));
  if(result.eligibilityPending.length)lines.push('',`Derecho a puntuar pendiente: ${result.eligibilityPending.map(id=>pilotById(id).name).join(', ')}.`);
  lines.push('','Dos mejores resultados de tres. Sin bonificación por asistencia.','Participación y elegibilidad según los ajustes del usuario. Rangos conservadores cuando faltan datos.','Cálculo orientativo; no sustituye una clasificación oficial de AECAR.');
  return lines.join('\n');
}
function download(text,name,type) {
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function csvText() {
  const safe=x=>{let text=String(x??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  const rows=[['Tipo','General mínima','General máxima','Piloto','C1','C2','Puesto Cerdanyola','Puntos Cerdanyola','Descarte','Bonificación','Puntos mínimos','Puntos máximos','Elegibilidad hoy','Resultado reconocido','Corrección oficial','Desempate']];
  for(const r of result.rows){const p=r.pilot,s=r.exact;rows.push([state.mode==='final'?'Cierre calculado':'Simulación',r.rankMin,r.rankMax,p.name,...p.history.map(x=>x==null?'':E.pointsFor(x,seed.points)),p.active?p.position:'No corre',s?s.todayPoints:'Pendiente',s?s.discard.points:'Pendiente',s?s.bonus:'Pendiente',r.min,r.max,p.eligible,p.active&&p.qualifying?'Sí':'No',p.pointsOverride,r.tieReason]);}
  return '\ufeff'+rows.map(row=>row.map(safe).join(';')).join('\r\n');
}
document.addEventListener('change',event=>{
 const input=event.target.closest('select[data-rank]');if(!input)return;
 try{const proposed=E.assignPosition(state,input.dataset.rank,input.value);remember();state=proposed;changed();renderInputs();}
 catch(error){input.value=pilotById(input.dataset.rank).position;toast(error.message,true);}
});
document.addEventListener('click',event=>{
 const step=event.target.closest('[data-step]');
 if(step){try{const proposed=E.stepPosition(state,step.dataset.step,Number(step.dataset.delta));remember();state=proposed;changed();renderInputs();}catch(error){toast(error.message,true);}return;}
 const cat=event.target.closest('[data-category]');if(cat){switchCategory(cat.dataset.category);return;}
 const find=event.target.closest('[data-find]');if(find){filter='all';$('search').value=pilotById(find.dataset.find).shortName;renderInputs();$('inputTitle').scrollIntoView({behavior:'smooth',block:'start'});return;}
});
$('categoryTabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'NITRO':event.key==='End'?'ECO':category==='NITRO'?'ECO':'NITRO';switchCategory(next);document.querySelector(`[data-category="${next}"]`).focus();}});
$('copyNarration').addEventListener('click',async()=>{const text=`CERDANYOLA ${category} — SI TERMINARA ASÍ\n\n`+broadcast.paragraphs.join('\n\n');try{await navigator.clipboard.writeText(text);toast('Guion de directo copiado.');}catch{$('copyText').value=text;$('copyDialog').showModal();$('copyText').focus();$('copyText').select();}});
$('pilotList').addEventListener('click',event=>{
  let b=event.target.closest('[data-star]');if(b){remember();const p=pilotById(b.dataset.star);p.favorite=!p.favorite;renderInputs();update();scheduleSave();return;}
  b=event.target.closest('[data-edit]');if(b){showEditor(b.dataset.edit);return;}
  b=event.target.closest('[data-activate]');if(b){remember();pilotById(b.dataset.activate).active=true;changed();renderInputs();}
});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;renderInputs();}));
$('search').addEventListener('input',renderInputs);
$('showAll').addEventListener('change',renderTable);$('showDetails').addEventListener('change',renderTable);
$('resultBody').addEventListener('click',event=>{const b=event.target.closest('[data-detail]');if(b)showDetail(b.dataset.detail);});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('editForm').addEventListener('submit',event=>{
  event.preventDefault();const raw=$('editOverride').value.trim();
  if(raw!==''&&(!/^\d+$/.test(raw)||Number(raw)>640)){toast('Los puntos deben ser un entero de 0 a 640, o quedar vacíos.',true);return;}
  remember();const p=pilotById($('editingId').value);p.active=$('editActive').checked;p.qualifying=$('editQualifying').checked;p.eligible=$('editEligible').value;p.noClassification=$('editNoClass').checked;p.pointsOverride=raw;
  if(!p.active||p.noClassification)p.position='';if(p.noClassification)p.pointsOverride='';
  $('editDialog').close();changed();renderInputs();
});
$('addPilot').addEventListener('click',()=>{$('newName').value='';$('newEligible').value='yes';$('addError').textContent='';$('addDialog').showModal();$('newName').focus();});
$('addForm').addEventListener('submit',event=>{
  event.preventDefault();const name=$('newName').value.trim().replace(/\s+/g,' ');
  if(name.length<2){$('addError').textContent='Escribe un nombre completo.';return;}
  if(state.pilots.some(p=>E.normalize(p.name)===E.normalize(name))){$('addError').textContent='Ese piloto ya existe. Búscalo y actívalo para hoy.';return;}
  if(state.pilots.length>=200){$('addError').textContent='Se ha alcanzado el máximo de 200 pilotos.';return;}
  remember();const id='custom-'+(globalThis.crypto?.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  state.pilots.push({id,name,shortName:name,history:Array(seed.rules.totalRounds-1).fill(null),baselineTotal:0,baselineRank:null,originalToday:false,entryRank:null,category:'',licenseNote:'Alta manual',eligible:$('newEligible').value,favorite:false,historicalSource:'Alta manual sin histórico',active:true,position:'',qualifying:true,noClassification:false,pointsOverride:'',custom:true});
  $('addDialog').close();filter='active';$('search').value='';changed();renderInputs();toast('Piloto añadido, sin resultados anteriores.');
});
$('deleteCustom').addEventListener('click',()=>{const id=$('editingId').value,p=pilotById(id);if(p?.custom&&confirm(`¿Eliminar a ${p.name}? Puedes recuperar el cambio con Deshacer.`)){remember();state.pilots=state.pilots.filter(x=>x.id!==id);$('editDialog').close();changed();renderInputs();}});
$('applyQuick').addEventListener('click',()=>{
  const parsed=E.parseQuick($('quickInput').value,state.pilots);
  if(parsed.errors.length){$('quickError').textContent=parsed.errors.join('\n');return;}
  const proposed=E.clone(state);
  parsed.changes.forEach(c=>{const p=proposed.pilots.find(p=>p.id===c.id);p.active=true;p.noClassification=false;p.position=c.position;});
  const validation=E.validate(proposed);
  if(validation.errors.length){$('quickError').textContent=validation.errors.map(e=>e.message).join(' ');return;}
  remember();state=proposed;changed();renderInputs();$('quickError').textContent='';toast(`Actualizados ${parsed.changes.length} pilotos.`);
});
$('undoButton').addEventListener('click',()=>{if(!undo.length)return;state=undo.pop();update();renderInputs();scheduleSave();toast('Cambio deshecho.');});
$('resetButton').addEventListener('click',()=>{if(!confirm('¿Volver a la lista inicial y borrar los puestos de esta simulación? Guarda una copia antes si necesitas conservarla.'))return;remember();state=E.createState(seed);filter='favorites';$('search').value='';update();renderInputs();scheduleSave();toast('Lista original restaurada.');});
$('exportButton').addEventListener('click',()=>{save();download(JSON.stringify(envelope(),null,2),'cerdanyola-gt8-2026-NITRO-ECO-copia.json','application/json;charset=utf-8');toast('Copia de resultados y ajustes creada.');});
$('csvButton').addEventListener('click',()=>{if(result.valid)download(csvText(),`cerdanyola-gt8-2026-${category}-${state.mode==='final'?'final-calculada':'simulacion'}.csv`,'text/csv;charset=utf-8');});
$('importButton').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw new Error('La copia supera 1 MB.');
    const raw=JSON.parse(await file.text());
    const isBoth=raw.schemaVersion===2;
    const cat=isBoth?null:(raw.categoryId||'NITRO');
    if(!isBoth&&!seeds[cat])throw new Error('Categoría de copia desconocida.');
    const imported=isBoth?readEnvelope(raw):readCategory(raw,cat);
    if(!confirm(isBoth?'¿Importar las dos categorías? Se abrirán como simulaciones revisables.':'¿Importar la categoría '+cat+'? La otra categoría no se modifica.'))return;
    sessions[category]=state;undoBy[category]=undo;
    if(isBoth){sessions=imported.categories;category=imported.category;undoBy={NITRO:[],ECO:[]};}
    else{undoBy[cat].push(E.clone(sessions[cat]));sessions[cat]=imported;category=cat;}
    seed=seeds[category];state=sessions[category];undo=undoBy[category];filter='active';$('search').value='';
    update();renderInputs();renderHelp();scheduleSave();toast('Copia importada. Revisa los ajustes antes del cierre.');
  }catch(error){toast(`No se ha importado: ${error.message}`,true);}finally{event.target.value='';}
});
$('copyButton').addEventListener('click',async()=>{if(!result.valid)return;const text=summaryText();try{await navigator.clipboard.writeText(text);toast('Resumen copiado.');}catch{$('copyText').value=text;$('copyDialog').showModal();$('copyText').focus();$('copyText').select();}});
$('printButton').addEventListener('click',()=>{if(!result.valid)return;$('showAll').checked=true;renderTable();window.print();});
$('reviewed').addEventListener('change',()=>{state.reviewed=$('reviewed').checked;if(!state.reviewed)state.mode='live';update();scheduleSave();});
$('finishButton').addEventListener('click',()=>{if(!result.finalReady||!state.reviewed)return;remember();state.mode='final';$('showAll').checked=true;update();scheduleSave();toast('Clasificación final calculada con todos los datos introducidos.');});
function renderHelp(){
 $('helpBody').innerHTML=`<h3>Dos categorías, sin mezclar puntos</h3><p>GT8 Nitro tiene 26 pilotos del histórico y GT8 Eléctrico, 14. Son dos campeonatos independientes. Joao, Cristian y Carlos Expósito conservan un historial distinto en cada pestaña. No se importan datos de GT/F1 Gran Escala.</p><h3>Parrilla definitiva pendiente</h3><p>La carga inicial incluye todos los pilotos del histórico como <strong>parrilla provisional de simulación</strong>. No es una lista de inscritos. Cuando se cierre la inscripción, se cargarán las listas definitivas de Nitro y Eléctrico: solo esos pilotos tendrán selector de resultado. Los no inscritos seguirán en la general con sus puntos anteriores, sin sumar Cerdanyola. El botón Parrilla queda para corregir una baja, un cambio excepcional o añadir un inscrito nuevo.</p><h3>Reglas GT8 2026</h3><p>Cuentan las dos mejores de tres pruebas. <strong>No hay puntos por asistencia.</strong> Se aplica la escala AECAR de 640, 613, 587… y un punto desde el puesto 91. Los desempates se resuelven por victorias, segundos y terceros en las pruebas que cuentan; mejor descarte; última prueba común; y ex aequo si nada los separa. Un empate múltiple sin una prueba común clara se marca para revisión, no se ordena por nombre.</p><h3>Resultado de la prueba, no de una manga</h3><p>En Nitro introduce el puesto en la general completa del evento. En Eléctrico introduce la clasificación conjunta de las finales, no una sola final. El reglamento eléctrico contempla cuatro finales, contando tres, con puntuación 0, 2, 3… y sus propios desempates por posiciones y vueltas/tiempo. Esta app NO calcula esa fase: convierte el puesto global del evento en puntos de campeonato.</p><h3>Resultados parciales</h3><p>Las casillas vacías son pendientes, nunca ceros ni ausencias. El motor mantiene los puestos escritos y calcula las posiciones posibles del campeonato. Hasta 40 participantes usa emparejamiento de los puestos libres para respetar que nadie ocupe el mismo puesto; con más participantes usa cotas conservadoras. No son probabilidades. Puedes conocer el top 4 sin completar el resto.</p><h3>Condiciones de título</h3><p>El panel de combinaciones por piloto <strong>ignora los puestos actuales</strong> para responder qué necesita desde cero, pero sí respeta quién corre y quién puntúa. Deben cumplirse todas las condiciones de cada fila. Verifica que las etiquetas No corre y No puntúa sean correctas. Los resultados finales de las mangas y las sanciones extraordinarias quedan bajo el criterio de la organización.</p><h3>Ajustes y registros especiales</h3><p>En ⋯ puedes marcar que el resultado no sea reconocido, que no puntúe, que no tenga clasificación numérica o poner una corrección oficial de puntos. Un abandono con puesto conserva sus puntos; no lo conviertas en cero. No se compactan los puestos de los demás al quitar derecho a puntuar.</p><p>Los registros «Piloto no encontrado» y los puestos 100, 101 o 102 se conservan tal cual los publica AECAR, con un punto. No se deduce su causa ni la nacionalidad de nadie por el nombre. La app no inventa identidades ni fusiona pilotos.</p><h3>Guardado</h3><p>Los datos se guardan en este navegador. La copia JSON incluye Nitro y Eléctrico y se valida antes de importar. No hay sincronización entre dispositivos, telemetría, IA ni llamadas de red. Una URL no listada no es una contraseña. Las copias de Lleida se rechazan para no mezclar reglamentos.</p><h3>Fuentes de ${seed.categoryLabel}</h3><p><a href="${esc(seed.sources.regulation)}" target="_blank" rel="noopener noreferrer">Reglamento GT8 2026 · artículo 3.1${category==='ECO'?' y 6.1':''}</a><br><a href="${esc(seed.sources.general)}" target="_blank" rel="noopener noreferrer">Reglamento General AECAR · 17.1 y 18.1</a><br><a href="${esc(seed.sources.standings)}" target="_blank" rel="noopener noreferrer">Clasificación anterior, tras C2</a><br><a href="${esc(seed.sources.notice)}" target="_blank" rel="noopener noreferrer">Convocatoria: Cerdanyola, 2–4 octubre 2026</a></p>`;
}
$('raceButton').addEventListener('click',()=>{
  if(!result.valid)return;
  $('detailTitle').textContent='Clasificación de la prueba de Cerdanyola';
  const pilots=state.pilots.filter(p=>p.active).sort((a,b)=>(a.position===''?999999:Number(a.position))-(b.position===''?999999:Number(b.position)));
  $('detailBody').innerHTML='<p>Puestos introducidos por ti. Los que faltan permanecen pendientes; no se usa el ranking de inscripción.</p><table><thead><tr><th>Puesto</th><th>Piloto</th><th>Puntos hoy</th></tr></thead><tbody>'+pilots.map(p=>{
    const r=result.rows.find(r=>r.pilot.id===p.id),values=r.variants.map(v=>v.todayPoints);
    return `<tr><td>${p.noClassification?'Sin clas.':p.position?place(Number(p.position)):'Pendiente'}</td><td>${esc(p.name)}${p.eligible==='unknown'?'<br><small>Puntuación por confirmar</small>':p.eligible==='no'?'<br><small>No puntúa</small>':''}</td><td>${range(Math.min(...values),Math.max(...values))}</td></tr>`;
  }).join('')+'</tbody></table>';
  $('detailDialog').showModal();
});
$('helpButton').addEventListener('click',()=>$('helpDialog').showModal());

function renderTitleScenarios(){
 const key=JSON.stringify([category,scenarioPilotBy[category],state.pilots.map(p=>[p.id,p.active,p.qualifying,p.noClassification,p.eligible,p.pointsOverride])]);
 if(key===scenarioCacheKey)return;scenarioCacheKey=key;
 const old=scenarioPilotBy[category];
 $('scenarioPilot').innerHTML=state.pilots.map(p=>`<option value="${esc(p.id)}" ${p.id===old?'selected':''}>${esc(p.shortName)}</option>`).join('');
 if(!state.pilots.some(p=>p.id===old))scenarioPilotBy[category]=state.pilots[0].id;
 $('scenarioPilot').value=scenarioPilotBy[category];
 const paths=S.titlePaths(seed,state,scenarioPilotBy[category]);
 $('scenarioRows').innerHTML=paths.rows.map(r=>`<tr><td>${r.position==null?'No corre / sin puesto':place(r.position)}</td><td>${r.total}</td><td>${r.unconditional?'No depende de ningún otro piloto.':r.requirements.map(q=>`<strong>${esc(q.name)}</strong>: ${q.contiguous?q.from+'.º o peor':q.places.map(place).join(', ')}`).join('<br>')}</td></tr>`).join('');
 $('scenarioMessage').textContent=paths.rows.length?'Todas las condiciones de una fila deben cumplirse a la vez. Son opciones matemáticas, no una predicción.':paths.reason;
 $('scenarioTable').hidden=!paths.rows.length;
}
$('scenarioPilot').addEventListener('change',()=>{scenarioPilotBy[category]=$('scenarioPilot').value;scenarioCacheKey='';renderTitleScenarios();});
$('rosterButton').addEventListener('click',()=>{
 $('rosterList').innerHTML=state.pilots.map(p=>`<label class="checklabel roster-item"><input type="checkbox" data-roster="${esc(p.id)}" ${p.active?'checked':''}><span>${esc(p.shortName)}${p.position?' · puesto '+esc(p.position):''}</span></label>`).join('');
 $('rosterError').textContent='';$('rosterDialog').showModal();
});
$('rosterForm').addEventListener('submit',event=>{
 event.preventDefault();const proposed=E.clone(state);
 document.querySelectorAll('[data-roster]').forEach(el=>{const p=proposed.pilots.find(x=>x.id===el.dataset.roster);p.active=el.checked;if(!p.active)p.position='';});
 const check=E.validate(proposed);
 if(check.errors.length){$('rosterError').textContent='La lista dejaría puestos fuera del rango. Corrige esos puestos antes de quitar participantes. '+check.errors.map(x=>x.message).join(' ');return;}
 remember();state=proposed;$('rosterDialog').close();changed();renderInputs();toast('Parrilla actualizada. Los históricos no se modifican.');
});

// Deterministic read-only diagnostics for testing; no remote writes or hidden network behavior.
window.CerdanyolaApp={getState:()=>E.clone(state),getCategory:()=>category,getAllStates:()=>E.clone(envelope()),getCalculation:()=>E.clone(result),getNarration:()=>E.clone(broadcast)};
update();renderInputs();renderHelp();
if(state.updatedAt&&storageAvailable)$('saveStatus').textContent='Simulación recuperada de este navegador';
else if(!storageAvailable)$('saveStatus').textContent='Sin guardado local. Usa Guardar copia.';
})();
