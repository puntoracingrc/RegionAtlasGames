"""Human-readable evidence queue; suggestions never classify or create editions."""
import gzip
import json
from collections import defaultdict
from reference import ART

NOTES={
 'no_exact_title_family_edition_reference':'El título y la edición del catálogo no tienen una coincidencia exacta en el corpus regional congelado. Hace falta un código o evidencia física que identifique esta variante.',
 'legacy_row_does_not_identify_a_single_regional_release':'La ficha histórica representa varias publicaciones regionales posibles. El título, idioma y mercado antiguo no bastan para elegir una.',
 'legacy_reference_is_not_a_ps1_serial':'La referencia histórica pertenece a otro formato/plataforma; se conserva en el snapshot y se retira del matching activo.',
 'catalog_serial_conflicts_with_title_or_edition':'El serial histórico identifica otro título o edición en la referencia consultada. No se hereda esa asociación.',
 'multiple_catalog_rows_for_same_documented_release':'Varias fichas históricas apuntan a la misma publicación documental. Debe revisarse si son duplicados de texto o empaquetados diferentes antes de consolidar sus historiales.',
 'no_exact_redump_serial':'No aparece una equivalencia exacta o un alias documentado de este código en los DAT congelados. La ausencia no demuestra que la edición no exista.',
 'market_requires_additional_evidence':'La fuente no permite asignar un mercado comercial concreto con el nivel de evidencia requerido.',
 'non_retail_disc_category':'La coincidencia de serial corresponde a demo, prototipo u otra categoría que no confirma una publicación comercial equivalente.',
 'serial_resolves_to_multiple_markets':'El mismo serial aparece en revisiones con mercados distintos; falta evidencia para elegir la revisión de esta ficha.',
 'exact_serial_has_multiple_physical_variants':'El serial se comparte entre varias variantes físicas documentadas; se necesita caja, código adicional o información de edición.',
 'source_reports_unreleased':'La fuente marca la publicación como no lanzada; no se crea como edición comercial confirmada.',
 'commercial_release_conflicts_with_cancellation_reference':'Las fuentes discrepan sobre si la versión PS1 se comercializó. Se conserva la contradicción y no se crea como lanzamiento confirmado.',
 'index_only_title_and_serial_not_corroborated':'La entrada del listado no tiene ficha individual y no se ha corroborado la combinación exacta de título y código en Redump. Falta evidencia para crear una edición.',
}

def main():
 a=json.loads((ART/'catalog-resolution.json').read_text())
 baseline=json.load(gzip.open(ART/'baseline-ps1.json.gz','rt'))
 games={g['id']:g for g in baseline['catalog']}
 pages={p['sourceId']:p for p in json.loads((ART/'source-resolution.json').read_text())}
 output=[]
 for d in a['decisions']:
  if d['status']!='REVIEW':continue
  item={**d,'explanations':[NOTES.get(r,r) for r in d['reviewReasons']],'legacySource':{k:games[d['catalogId']].get(k) for k in ['pcId','pcPath','pcRegion','seedSource','museumSlug','edition']},'documentedCandidates':[]}
  for rid in sorted(set(d['candidateReleaseIds']+d['serialCandidateReleaseIds'])):
   g=a['releases'][rid]
   item['documentedCandidates'].append({'releaseId':rid,'title':g['title'],'serials':g['serials'],'market':g['market'],'editionLabels':g['labels'],'sourceUrls':[pages[s]['sourceUrl'] for s in g['sourceIds']],'accepted':False})
  output.append(item)
 (ART/'review-queue.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 source_review=[{'sourceId':p['sourceId'],'title':p['title'],'serials':p['serials'],'sourceUrl':p['sourceUrl'],'reviewReasons':p['reviewReasons'],'explanations':[NOTES.get(r,r) for r in p['reviewReasons']]} for p in pages.values() if p['reviewReasons']]
 (ART/'source-review-queue.json').write_text(json.dumps(source_review,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'catalogReview':len(output),'sourcePagesReview':len(source_review)}))

if __name__=='__main__':main()
