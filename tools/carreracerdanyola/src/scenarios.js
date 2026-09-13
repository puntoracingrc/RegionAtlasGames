/* Exact title paths for a chosen driver, independent of the current live positions. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./engine.js'):root.RaceDeskEngine);if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceDeskScenarios=api;})(typeof globalThis!=='undefined'?globalThis:this,function(E){
'use strict';
function titlePaths(seed,state,id){
 const s=E.clone(state);s.pilots.forEach(p=>p.position='');
 if(s.pilots.some(p=>p.active&&(p.eligible==='unknown'||p.pointsOverride!=='')))return {ready:false,reason:'Confirma quién puntúa y retira las correcciones manuales para obtener condiciones automáticas de título.',rows:[]};
 const own=s.pilots.find(p=>p.id===id);if(!own)return {ready:false,reason:'Piloto desconocido.',rows:[]};
 const active=s.pilots.filter(p=>p.active&&!p.noClassification),n=active.length;
 const candidatePositions=own.active&&!own.noClassification?Array.from({length:n},(_,i)=>i+1):[null];
 const rows=[];
 for(const position of candidatePositions){
  const target=E.resultFor(own,position,own.eligible,seed.points,seed.rules);
  const slots=Array.from({length:n},(_,i)=>i+1).filter(p=>p!==position);
  const opponents=s.pilots.filter(p=>p.id!==id);let impossible=false;const edges=[],requirements=[];
  for(const p of opponents){
   if(!p.active||p.noClassification){
    const other=E.resultFor(p,null,p.eligible,seed.points,seed.rules);
    if(E.compareDetailed(other,target).order<=0){impossible=true;break;}
    continue;
   }
   const allowed=slots.map((slot,col)=>({slot,col,result:E.resultFor(p,slot,p.eligible,seed.points,seed.rules)})).filter(x=>E.compareDetailed(x.result,target).order>0);
   if(!allowed.length){impossible=true;break;}
   edges.push(allowed.map(x=>x.col));
   if(allowed.length<slots.length){
    const allowedPlaces=allowed.map(x=>x.slot);
    const from=allowedPlaces[0];
    // Only express a lower bound if it is exactly equivalent on all free positions.
    const contiguous=slots.filter(x=>x>=from).every(x=>allowedPlaces.includes(x));
    requirements.push({id:p.id,name:p.shortName,from,places:allowedPlaces,contiguous});
   }
  }
  if(impossible||edges.length!==slots.length||E.maximumMatching(edges,slots.length)!==edges.length)continue;
  rows.push({position,total:target.total,requirements,unconditional:requirements.length===0});
 }
 return {ready:true,rows,reason:rows.length?'':'No hay una combinación para que sea campeón en solitario con estos participantes y ajustes.'};
}
return {titlePaths};
});
