/* Deterministic commentary. Every live claim is derived from the scoring result. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LleidaBroadcast=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const join = names => names.length<2?names.join(''):names.slice(0,-1).join(', ')+' y '+names.at(-1);
const ordinal=['','primero','segundo','tercero','cuarto'];
function guide(seed,state){
 const category=seed.categoryId||'GT';
 const compatible=state.pilots.length===seed.pilots.length&&seed.pilots.every(base=>{
  const p=state.pilots.find(p=>p.id===base.id);
  return p && p.active===base.originalToday && (!p.active||p.qualifying&&!p.noClassification&&p.pointsOverride===''&&(base.eligible==='unknown'||p.eligible===base.eligible));
 });
 const assumption=category==='F1'?'Se supone que participan y puntúan los siete inscritos facilitados. Ricardo Sánchez no corre; conserva sus 1.864 puntos.':'Se supone que participan y puntúan Jordi, Héctor, Joseba y Alfonso; los ausentes conservan su histórico. Sin sanciones que cambien la base.';
 const cards=category==='F1'?[
  ['El título, entre Dani y Joan','Dani llega líder, pero Joan tiene dos victorias anteriores: puede pasar del séptimo puesto al título. Ningún otro piloto puede ser campeón con esta parrilla.'],
  ['Joan depende de sí mismo','Si gana o termina segundo, es campeón. Si acaba tercero, necesita que Dani no gane. Si acaba cuarto, necesita que Dani termine tercero o peor.'],
  ['Lo que necesita Dani','Ganando, necesita que Joan acabe tercero o peor. Si Dani es segundo, necesita a Joan cuarto o peor. Si Dani termina tercero o peor, necesita a Joan quinto o peor. Dani tiene asegurado al menos el subcampeonato bajo estos supuestos.'],
  ['La remontada de Lorenzo','Lorenzo necesita ser primero o segundo en Lleida para subir al podio del campeonato. Si gana y Joan acaba sexto o séptimo, Lorenzo será subcampeón; también lo será si queda segundo y Joan séptimo. En los demás casos de primero o segundo, Lorenzo será tercero.'],
  ['Ricardo juega sin estar en pista','Si Lorenzo no termina entre los dos primeros, Ricardo conserva el bronce. Si Lorenzo es primero o segundo, Ricardo baja al cuarto puesto.'],
  ['Pere puede entrar en los cuatro primeros','Pere no alcanza el podio, pero puede acabar cuarto del campeonato: necesita ganar con Lorenzo quinto o peor, o quedar segundo con Lorenzo sexto o séptimo.'],
  ['Cinco podios posibles','Dani / Joan / Ricardo; Dani / Joan / Lorenzo; Dani / Lorenzo / Joan; Joan / Dani / Ricardo; Joan / Dani / Lorenzo. Son combinaciones posibles, no probabilidades.'],
 ]:[
  ['El campeón ya está decidido','Oriol Gil conserva el título: ni siquiera una victoria de Joseba permitiría alcanzarlo con esta base. La emoción está en las otras plazas.'],
  ['Joseba tiene la vía directa','Ganando o quedando segundo, Joseba es subcampeón sin depender de Jordi ni de Héctor. Tercero también le sirve si no gana ninguno de ellos.'],
  ['Ganar puede no bastar','Jordi o Héctor pueden ganar en Lleida y acabar terceros de España: ocurre si Joseba termina segundo.'],
  ['El duelo Jordi–Héctor','Héctor supera a Jordi en el campeonato únicamente si termina entre los tres primeros de Lleida y por delante de él. En los demás casos Jordi queda delante.'],
  ['Joseba todavía puede ser segundo sin podio en pista','Cuarto le sirve si Jordi no gana y Héctor acaba tercero o peor. Quinto le sirve si Jordi y Héctor terminan ambos terceros o peor. Sexto ya no le permite ser subcampeón.'],
  ['La sorpresa de Alfonso','Puede ser tercero del campeonato si gana, Héctor termina cuarto o peor y Joseba séptimo o peor. La otra opción: Alfonso segundo, Héctor decimoséptimo o peor y Joseba octavo o peor.'],
  ['Atención a los desempates','Héctor segundo y Joseba cuarto dejan a ambos con los mismos puntos: Héctor queda delante por su mejor descarte. No basta con mirar la suma.'],
  ['Siete podios posibles','Siempre Oriol primero. Después: Jordi / Héctor; Jordi / Joseba; Jordi / Alfonso; Héctor / Jordi; Héctor / Joseba; Joseba / Jordi; Joseba / Héctor. Para la cuarta plaza, el cálculo incluye también al resto de pilotos.'],
 ];
 return {compatible,assumption,cards};
}
function narrate(seed,state,result){
 const category=seed.categoryId||'GT';
 if(!result.valid)return {title:'Revisa los puestos',paragraphs:['Hay un dato inválido. No se anuncia una clasificación hasta corregirlo.'],needed:[],topFourCertain:false};
 const certain=result.podium.filter(s=>s.certain.length===1);
 const topFourCertain=certain.length===4;
 const activeMissing=result.rows.filter(r=>r.pilot.active&&!r.pilot.noClassification&&(r.pilot.position===''||r.pilot.eligible==='unknown')&&r.rankMin<=4);
 const needed=activeMissing.filter(r=>r.rankMin!==r.rankMax||r.pilot.eligible==='unknown').map(r=>({id:r.pilot.id,name:r.pilot.shortName,reason:r.pilot.eligible==='unknown'?'confirmar si puntúa':'introducir puesto'}));
 const paragraphs=[];
 const slots=result.podium.map(s=>s.certain.length===1?s.certain[0]:null);
 const initial=result.assigned===0;
 let title=topFourCertain?'Las cuatro primeras plazas están calculadas':'El campeonato, con los puestos que has puesto';
 if(initial){
  title='Las claves antes de poner resultados';
  const champions=result.podium[0].candidates.map(r=>r.pilot.shortName);
  paragraphs.push(champions.length===1?`${champions[0]} es el único candidato al título con esta base.`:`El título está entre ${join(champions)}. Introduce sus puestos para ver quién sería campeón.`);
 }else if(topFourCertain){
  paragraphs.push(`Si la carrera terminara así, ${slots[0].pilot.shortName} sería campeón; ${slots[1].pilot.shortName}, subcampeón; ${slots[2].pilot.shortName}, tercero; y ${slots[3].pilot.shortName}, cuarto del campeonato.`);
 }else{
  if(slots[0])paragraphs.push(`Si la carrera terminara así, ${slots[0].pilot.shortName} sería campeón con los datos introducidos.`);
  const decided=certain.filter(s=>s.rank!==1).map(s=>`${s.certain[0].pilot.shortName} sería ${ordinal[s.rank]}`);
  if(decided.length)paragraphs.push(`${join(decided)} del campeonato.`);
  const undecided=result.podium.filter(s=>s.certain.length!==1);
  if(undecided.length){
   const relevant=[...new Set(undecided.flatMap(s=>s.candidates.map(r=>r.pilot.shortName)))];
   paragraphs.push(`Las plazas todavía abiertas dependen de ${join(relevant)}. No se adjudican puestos que aún pueden cambiar por los datos pendientes.`);
  }
 }
 const g=guide(seed,state);
 const p=id=>state.pilots.find(p=>p.id===id), pos=id=>p(id)?.position===''?null:Number(p(id)?.position);
 if(g.compatible&&category==='F1'){
  const j=pos('joan'),d=pos('dani');
  if(j===1||j===2)paragraphs.push(`Joan va ${ordinal[j]}: manteniendo ese resultado sería campeón, haga lo que haga Dani.`);
  else if(j===3)paragraphs.push('Joan tercero: Dani solo le quita el título si gana la carrera.');
  else if(j===4)paragraphs.push('Joan cuarto: Dani necesita acabar entre los dos primeros para ser campeón.');
  else if(j!==null&&j>=5)paragraphs.push('Con Joan quinto o peor, Dani sería campeón, manteniéndose la participación prevista.');
  else if(d!==null)paragraphs.push(d===1?'Dani va primero, pero necesita que Joan no termine segundo.':d===2?'Dani va segundo: necesita a Joan cuarto o peor para llevarse el título.':'Dani va tercero o peor: necesita a Joan quinto o peor para ser campeón.');
  const l=pos('lorenzo');
  if(l!==null)paragraphs.push(l<=2?'Lorenzo está entre los dos primeros de la carrera: con ese resultado quitaría a Ricardo una plaza de podio.':'Lorenzo no está entre los dos primeros: con ese resultado, Ricardo conservaría el bronce sin correr hoy.');
 }
 if(g.compatible&&category==='GT'){
  const j=pos('joseba');
  if(j===1||j===2)paragraphs.push('Joseba está entre los dos primeros: con ese resultado asegura el subcampeonato, incluso aunque gane Jordi o Héctor.');
  else if(j===3)paragraphs.push('Joseba tercero: sería subcampeón salvo que ganase Jordi o Héctor.');
  else if(j===4)paragraphs.push('Joseba cuarto: necesita que Jordi no gane y que Héctor no esté entre los dos primeros para ser subcampeón.');
  else if(j===5)paragraphs.push('Joseba quinto: sería subcampeón si Jordi y Héctor terminan ambos terceros o peor.');
 }
 // When the exact totals tie, repeat only an established sporting criterion.
 const tie=result.rows.find(r=>r.rankMin<=4&&r.exact&&r.tieReason.startsWith('Delante de'));
 if(tie)paragraphs.push(`Atención al desempate: ${tie.pilot.shortName} queda ${tie.tieReason.charAt(0).toLowerCase()+tie.tieReason.slice(1)}`);
 if(topFourCertain&&!result.complete)paragraphs.push('No hace falta rellenar los demás puestos para conocer estas cuatro plazas en este supuesto. El resto de la general sigue pendiente.');
 if(result.complete)paragraphs.push(state.mode==='final'?'Clasificación final calculada con los resultados introducidos; pendiente de la publicación oficial.':'La clasificación completa ya está calculada. Durante la carrera sigue siendo una simulación.');
 if(!initial&&!topFourCertain&&needed.length)paragraphs.push(`Para afinar las cuatro primeras, falta ${join(needed.map(x=>`${x.reason} de ${x.name}`))}. No necesitas rellenar a todos.`);
 return {title,paragraphs,needed,topFourCertain};
}
return {guide,narrate};
});
