/* Verified 2026 AECAR rules used by the broadcast explanations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CerdanyolaRules=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const generalUrl='https://aecar.org/documentos/aecar/reglamento_general_aecar_2026.pdf';
const categories={
  NITRO:{
    label:'GT8 Nitro',url:'https://aecar.org/mod/rg/doc/Reglamento%20GT8%20Nitro%20AECAR%202026.pdf',
    format:'Clasificatorias de 6 minutos. Hasta dos rondas cuenta la mejor; con tres o cuatro cuentan las dos mejores. El poleman pasa directo a la Final A y el resto avanza por cuartos, semifinales y finales.',
    formatArticle:'arts. 5.4, 5.8 y 6.1–6.16',
    specs:[
      ['Motor','Máximo 3,5 cm³ · 5 transfers · venturi máximo 9 mm','art. 10.1'],
      ['Depósito','150 ml máximo, incluidos los conductos','arts. 10.2 y 10.23'],
      ['Peso','3.500 g mínimo, depósito vacío y transponder instalado','art. 10.3'],
      ['Dimensiones','Batalla 320–379 mm · ancho 310 mm máx. · largo 590 mm máx.','art. 10.4'],
      ['Carrocería','250 g mínimo con alerón · techo 155 mm mín. · corte trasero 75 mm mín.','arts. 10.16 y 10.24'],
      ['Baterías','Carga y descarga máxima de 16 A en bolsa o contenedor ignífugo','art. 10.14']
    ]
  },
  ECO:{
    label:'GT8 Eléctrico',url:'https://aecar.org/mod/rg/doc/Reglamento%20GT8%20el%C3%A9ctrico%20AECAR%202026.pdf',
    format:'Cuatro finales de 6 minutos por grupo; cuentan las tres mejores. La puntuación es 0 para el primero, 2 para el segundo, 3 para el tercero y así sucesivamente. Menos puntos es mejor.',
    formatArticle:'arts. 6.1 y 6.3',
    specs:[
      ['Motor','Diámetro máximo 44 mm · salida del rotor de 5 mm','art. 10.1'],
      ['Batería','Hardcase 4S · 17,4 V máximo · carga y descarga máxima de 16 A','art. 10.2'],
      ['Corte batería','Mínimo 3,0 V por celda · 12 V en 4S','art. 10.29'],
      ['Peso','3.800 g mínimo en orden de marcha','art. 10.3'],
      ['Dimensiones','Batalla 320–379 mm · ancho 310 mm máx. · largo 590 mm máx.','art. 10.4'],
      ['Carrocería','250 g mínimo con alerón · techo 155 mm mín. · corte trasero 75 mm mín.','arts. 10.15 y 10.23']
    ]
  }
};
const championship={
  title:'Dos resultados de tres',
  text:'En 2026 se celebran tres pruebas y puntúan las dos mejores. No hay puntos por asistencia. El tercer resultado —incluida una ausencia— es el descarte.',
  article:'Reglamento GT8 2026, art. 3.1'
};
const tieBreak={
  title:'Cómo se rompe un empate',
  text:'Se comparan, por este orden, victorias, segundos y terceros en las pruebas puntuables; después el mejor descarte y la última carrera común.',
  article:'Reglamento General AECAR 2026, art. 18.1',url:generalUrl
};
const incidents={
  technical:{label:'Infracción técnica',title:'Pérdida de todas las vueltas',text:'Una infracción de las especificaciones técnicas supone la pérdida de todas las vueltas de la manga, subfinal o final donde se detectó, siempre a criterio del director de carrera.',article:'Reglamento de la modalidad, art. 10.30'},
  track:{label:'Penalización en pista',title:'Pass-through o Stop & Go',text:'Las infracciones leves pueden sancionarse con pass-through o Stop & Go. Si son deliberadas o peligrosas, el Stop & Go puede incluir de 1 a 10 segundos.',article:'Reglamento General AECAR 2026, art. 14.1',url:generalUrl},
  blackFlag:{label:'Bandera negra',title:'Debe entrar en la vuelta siguiente',text:'Si no responde a la bandera negra durante la vuelta siguiente, el participante queda descalificado de esa clasificación o final.',article:'Reglamento General AECAR 2026, art. 13.2',url:generalUrl},
  disqualification:{label:'Descalificación confirmada',title:'Cero puntos en el campeonato',text:'Una descalificación recibe cero puntos. La proyección debe esperar el resultado corregido para recolocar al resto sin inventar el orden.',article:'Reglamento General AECAR 2026, art. 17.1',url:generalUrl}
};
return {generalUrl,categories,championship,tieBreak,incidents};
});
