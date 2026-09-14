/* Deterministic, auditable narration. No AI calls and no inferred race positions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceDeskBroadcast=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const join=names=>names.length<2?names.join(''):names.slice(0,-1).join(', ')+' y '+names.at(-1);
const ordinal=['','primero','segundo','tercero','cuarto'];
function guide(seed,state){
 const compatible=seed.pilots.every(base=>{const p=state.pilots.find(p=>p.id===base.id);return p&&p.active&&p.qualifying&&!p.noClassification&&p.eligible==='yes'&&p.pointsOverride==='';})&&state.pilots.every(p=>!p.active||p.eligible==='yes'&&p.qualifying&&!p.noClassification&&p.pointsOverride==='');
 const assumption='Combinaciones con la parrilla provisional del histórico, sin sanciones ni cambios en C1/C2. Cuando se reciban los inscritos definitivos, solo esos pilotos tendrán selector de Cerdanyola; los no inscritos conservarán su histórico. Al cambiar la parrilla se ocultan estas claves iniciales; el guion y las condiciones de título se recalculan.';
 const cards=seed.categoryId==='ECO'?[
 ['Tres aspirantes al título','Joao Barahona, Cristian Delgado y Carles Echarri son los únicos con opciones de ser campeones con esta base. Carles llega décimo, pero ya tiene una victoria: no hay que confundir la posición actual con sus posibilidades.'],
 ['Carles depende de sí mismo','Si gana la general de la prueba de Cerdanyola, será campeón: sumaría dos victorias y nadie podría superarlo.'],
 ['Joao tiene una posición muy fuerte','Ganando, es campeón. Si acaba segundo, también lo será salvo que gane Carles. Si termina tercero o peor, conserva el título siempre que no gane ni Carles ni Cristian.'],
 ['El camino de Cristian','Necesita ganar la prueba y que Joao termine tercero o peor. Ganar con Joao segundo no basta: empatan en puntos y Joao gana por el descarte.'],
 ['El segundo puesto no está adjudicado','Si Joao participa y obtiene un puesto puntuable, no puede caer más allá del segundo. Cristian todavía puede bajar hasta el cuarto; hay batalla por el podio y el resto también cuenta.'],
 ['Daniel no tiene el bronce asegurado','Xisco, Gustavo, David Martín, Gabriel, Sergio Alonso, Toni Méndez, Carles, Francisco José Franco y Joaquín Signes también pueden alcanzar el podio. La calculadora contempla a todos, no solo a los tres del título.'],
 ['En Eléctrico hay varias finales','El selector pide la general de la prueba, agregada tras las finales, no el puesto de una única manga. El reglamento prevé cuatro finales y cuentan las tres mejores, con puntuación 0, 2, 3…; no se trasladan esos puntos al campeonato.'],
 ['Una ausencia puede cambiar un desempate','No es lo mismo ser último puntuando que no estar inscrito. Si Joao no corre y Cristian gana con Carles segundo, Joao puede quedar tercero por los desempates. Cuando llegue la lista definitiva, revisa la parrilla antes de anunciar combinaciones.']
 ]:[
 ['Once caminos hacia el título','Todavía pueden ganar Cristian, Raúl Fernández, Raúl Darás, Marc, Fabio, Henrique, Joao, David Gallegos, Juan Carlos Tarín, Oswaldo y Eduard. Algunos necesitan fallos de varios rivales, pero el descarte mantiene viva su opción.'],
 ['Dos pilotos dependen de sí mismos','Cristian Delgado y Raúl Darás serían campeones ganando Cerdanyola. Cada uno ya tiene una victoria y la segunda les daría el máximo posible.'],
 ['Ganar no siempre significa ser campeón','Si gana Fabio Barbosa o Henrique Almeida, necesita que tanto Cristian como Raúl Darás acaben terceros o peor. Uno de estos dos segundos les quitaría el título por el descarte.'],
 ['Marc tiene un desempate favorable','Si Marc gana y Cristian y Raúl Darás terminan terceros o peor, Marc es campeón. Si alguno de ellos queda tercero, Marc le gana el empate por tener mejor descarte.'],
 ['El camino de Joao es más exigente','Si Joao gana, necesita que Cristian y Raúl Darás acaben cuartos o peor. Un tercero de cualquiera de los dos le impediría ser campeón.'],
 ['Raúl Fernández puede saltar al título','Si gana, necesita a Cristian y Raúl Darás cuartos o peor, y a Fabio y Henrique terceros o peor. No es la única combinación para él: consulta sus condiciones de título.'],
 ['Eduard no está descartado por ir decimotercero','Solo lleva una prueba, pero al contar dos resultados aún puede ganar el campeonato. Si gana Cerdanyola, necesita a Cristian y Raúl Darás quintos o peor y a Fabio y Henrique terceros o peor.'],
 ['El podio tiene más candidatos','Vicente Javier Eres puede alcanzar el segundo puesto y Vicente José Sáez el tercero. No tienen camino al título con estos participantes, pero sí pueden alterar el podio.'],
 ['El puesto debe ser el de la prueba completa','Introduce la general de Cerdanyola, incluyendo a quienes no alcanzaron la final. Un abandono con puesto conserva sus puntos; un sin clasificación no equivale automáticamente al último.']
 ];
 return {compatible,assumption,cards};
}
function narrate(seed,state,result){
 if(!result.valid)return {title:'Revisa los puestos',paragraphs:['Hay un dato inválido. No se anuncia una clasificación hasta corregirlo.'],needed:[],topFourCertain:false};
 const certain=result.podium.filter(s=>s.certain.length===1),topFourCertain=certain.length===4;
 const slots=result.podium.map(s=>s.certain.length===1?s.certain[0]:null);
 const needed=result.rows.filter(r=>r.pilot.active&&!r.pilot.noClassification&&(r.pilot.position===''||r.pilot.eligible==='unknown')&&r.rankMin<=4&&(r.rankMin!==r.rankMax||r.pilot.eligible==='unknown')).map(r=>({id:r.pilot.id,name:r.pilot.shortName,reason:r.pilot.eligible==='unknown'?'confirmar si puntúa':'introducir puesto'}));
 const paragraphs=[];let title=topFourCertain?'Las cuatro primeras plazas, calculadas':'El campeonato, con tus puestos';
 if(result.assigned===0){
  title='Las claves antes de la salida';
  const champions=result.podium[0].candidates.map(r=>r.pilot.shortName);
  paragraphs.push(champions.length===1?`${champions[0]} es el único candidato al título con esta configuración.`:`Todavía hay ${champions.length} candidatos al título con esta parrilla de simulación: ${join(champions)}.`);
 }else if(topFourCertain){
  paragraphs.push(`Si la prueba terminara así, ${slots[0].pilot.shortName} sería campeón; ${slots[1].pilot.shortName}, subcampeón; ${slots[2].pilot.shortName}, tercero; y ${slots[3].pilot.shortName}, cuarto del campeonato.`);
 }else{
  if(slots[0])paragraphs.push(`Si la prueba terminara así, ${slots[0].pilot.shortName} sería campeón con los datos introducidos.`);
  const decided=certain.filter(s=>s.rank!==1).map(s=>`${s.certain[0].pilot.shortName} sería ${ordinal[s.rank]}`);
  if(decided.length)paragraphs.push(`${join(decided)} del campeonato.`);
  const uncertain=result.podium.filter(s=>s.certain.length!==1);
  if(uncertain.length)paragraphs.push(`Aún queda por decidir ${join(uncertain.map(s=>s.rank===1?'el título':`la ${s.rank}.ª plaza`))}: faltan resultados que pueden cambiarlas.`);
 }
 const g=guide(seed,state);const pos=id=>{const p=state.pilots.find(x=>x.id===id);return p?.position?Number(p.position):null;};
 if(g.compatible&&seed.categoryId==='ECO'){
  const j=pos('joao'),c=pos('cristian'),e=pos('carles');
  if(e===1)paragraphs.push('Carles está ganando la general de la prueba: ese resultado le daría el campeonato con dos victorias.');
  else if(j===1)paragraphs.push('Joao está ganando: manteniendo esa posición será campeón, sin depender de nadie.');
  else if(c===1)paragraphs.push(j===2?'Cristian gana, pero Joao segundo se llevaría el campeonato por su mejor descarte.':'Cristian está ganando: necesita que Joao no termine segundo para llevarse el título.');
  else if(j===2)paragraphs.push('Joao va segundo: ese puesto le da el título salvo que gane Carles.');
  else if(j!==null)paragraphs.push('Joao conserva el título si no gana ni Carles ni Cristian. Hay que mirar también quién lidera la prueba.');
 }
 if(g.compatible&&seed.categoryId==='NITRO'){
  const c=pos('cristian'),d=pos('raul-daras');
  if(c===1||d===1)paragraphs.push(`${c===1?'Cristian Delgado':'Raúl Darás'} está ganando: manteniendo esa posición sería campeón con dos victorias.`);
 }
 const tie=result.rows.find(r=>r.rankMin<=4&&r.exact&&r.tieReason?.startsWith('Delante de'));
 if(tie)paragraphs.push(`Atención al desempate: ${tie.pilot.shortName} queda ${tie.tieReason.charAt(0).toLowerCase()+tie.tieReason.slice(1)}`);
 if(topFourCertain&&!result.complete)paragraphs.push('Estos cuatro puestos no dependen de completar las demás casillas, manteniendo los resultados y participantes introducidos. El resto de la general sigue pendiente.');
 if(!topFourCertain&&result.assigned&&needed.length)paragraphs.push(`Para afinar las cuatro primeras, faltan datos de ${join(needed.map(p=>p.name))}. No es necesario completar a todos los pilotos.`);
 if(result.complete)paragraphs.push(state.mode==='final'?'Cierre calculado con tus resultados y pendiente de la publicación oficial.':'La clasificación completa ya está calculada; mientras se compite sigue siendo una simulación.');
 return {title,paragraphs,needed,topFourCertain};
}
return {guide,narrate};
});
