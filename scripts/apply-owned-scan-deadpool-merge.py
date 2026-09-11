"""Merge the two reviewed PS4 Spanish rows without changing the owned canonical ID."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD, KEEP = 'ps4-deadpool-masacre', 'ps4-deadpool'

def read(name):
    return json.loads((ROOT / name).read_text())

def write(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def replace_row(name, key, value, array=False, compact=False):
    p = ROOT / name
    text = p.read_text()
    if array:
        start = text.index('  {\n    "id": ' + json.dumps(key))
        end = text.index('\n  }', start) + 4
        replacement = '\n'.join('  ' + line for line in json.dumps(value, ensure_ascii=False, indent=2).splitlines())
    else:
        start = text.index(json.dumps(key) + ':') + len(json.dumps(key)) + 1
        while text[start].isspace():
            start += 1
        _, length = json.JSONDecoder().raw_decode(text[start:])
        end = start + length
        replacement = json.dumps(value, ensure_ascii=False, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2).replace('\n', '\n  ')
    result = text[:start] + replacement + text[end:]
    json.loads(result)
    p.write_text(result)

catalog = read('data/catalog.json')
by_id = {g['id']: g for g in catalog}
details = read('data/game-details.json')
registry = read('data/catalog-owned-scans.json')
assert by_id[KEEP]['listingStatus'] == by_id[OLD]['listingStatus'] == 'listed'
assert all(by_id[k]['region'] == 'PAL España' and by_id[k]['platformSlug'] == 'ps4' and by_id[k]['pcId'] == 57722 for k in (KEEP, OLD))
before = {key: {'catalog': copy.deepcopy(by_id[key]), 'details': copy.deepcopy(details[key])} for key in (KEEP, OLD)}
scans = registry['games'].pop(OLD, None) or registry['games'][KEEP]
scans['identity']['slug'] = 'deadpool'
scans['packaging']['rejectedReferences'] = ['BLES-01789']
registry['games'][KEEP] = scans
canonical = {**by_id[KEEP], **by_id[OLD], 'id': KEEP, 'slug': 'deadpool', 'title': 'Masacre (Deadpool)', 'titlePc': 'Deadpool', 'coverUrl': scans['primaryCoverUrl'], 'regionVerified': True}
canonical['regionEvidence'] = list(dict.fromkeys([*canonical.get('regionEvidence', []), 'owner_confirmed_pal_es', 'owned_scan_spanish_packaging_20260911']))
archived = {**by_id[OLD], 'listingStatus': 'excluded', 'excludeCategory': 'duplicate', 'excludeReason': 'Misma edición PS4 PAL España que ps4-deadpool. Enlaces y datos personales conservados mediante alias.'}
replace_row('data/catalog.json', KEEP, canonical, array=True)
replace_row('data/catalog.json', OLD, archived, array=True)

merged = copy.deepcopy(details[KEEP])
for field, value in details[OLD].items():
    if field in ('sources', 'fieldSources', 'fieldProvenance'):
        merged[field] = {**merged.get(field, {}), **value}
    elif value is not None and value != [] and value != {}:
        merged[field] = value
merged['reference'] = None
merged.setdefault('fieldSources', {}).pop('reference', None)
merged['ean'] = scans['packaging']['ean']
replace_row('data/game-details.json', KEEP, merged)
chunk = read('public/catalog-details/ps4.json')
if KEEP in chunk:
    replace_row('public/catalog-details/ps4.json', KEEP, merged, compact=True)
aliases = read('data/catalog-id-aliases.json')
aliases[OLD] = KEEP
write('data/catalog-id-aliases.json', aliases)
routes = read('data/catalog-route-redirects.json')
assert not any(OLD in entry['sourceParams'] for entry in routes['redirects'])
routes['redirects'].append({'sourceParams': [OLD, 'deadpool-masacre-ps4-pal-es'], 'targetCatalogId': KEEP, 'targetParam': 'deadpool-ps4-pal-es', 'permanent': True, 'reason': 'same_product', 'reviewedAt': '2026-09-11', 'reviewBatch': 'owned-scans-2026-09-11-batch-2'})
write('data/catalog-route-redirects.json', routes)

companies = read('data/index/companies.json')
changed_companies = []
for slug, entry in companies.items():
    touched = False
    for field in ['gameIds', 'asDeveloper', 'asPublisher', 'asDigitalPublisher', 'asPhysicalPublisherOrDistributor']:
        if OLD in entry.get(field, []):
            entry[field] = list(dict.fromkeys(KEEP if value == OLD else value for value in entry[field]))
            touched = True
    if touched:
        entry['gameCount'] = len(entry['gameIds'])
        counts = {}
        for game_id in entry['gameIds']:
            platform = by_id[game_id]['platformSlug']
            counts[platform] = counts.get(platform, 0) + 1
        entry['byPlatform'] = dict(sorted(counts.items()))
        changed_companies.append(slug)
        replace_row('data/index/companies.json', slug, entry)
work = read('data/index/catalog-work-identities.json')
work['catalogIdToWorkKey'][KEEP] = work['catalogIdToWorkKey'][OLD]
write('data/index/catalog-work-identities.json', work)
write('data/catalog-owned-scans.json', registry)
evidence = read('data/research/owned-scans/2026-09-11-assets.json')
for asset in [*evidence['assets'], *evidence['covers']]:
    if asset['catalogId'] == OLD:
        asset['catalogId'] = KEEP
write('data/research/owned-scans/2026-09-11-assets.json', evidence)
audit = read('data/research/owned-scans/2026-09-11-integration.json')
entry = next(e for e in audit['games'] if e['id'] in [OLD, KEEP])
entry.update({'id': KEEP, 'before': before[KEEP], 'after': {'coverUrl': canonical['coverUrl'], 'reference': None, 'ean': merged['ean']}, 'mappingNotes': 'Unificación explícita de dos fichas de la misma edición. Se conserva el ID y URL de la copia del usuario, los precios de la ficha localizada y todos los ejemplares individuales.'})
write('data/research/owned-scans/2026-09-11-integration.json', audit)
write('data/research/owned-scans/2026-09-11-deadpool-merge.json', {'batchId': 'owned-scans-2026-09-11-batch-2', 'canonicalId': KEEP, 'retiredId': OLD, 'before': before, 'after': {'catalog': canonical, 'details': merged}, 'changedCompanyIndexes': changed_companies, 'evidence': ['Dos entradas PS4 PAL España standard, mismo pcId 57722, sin variante diferenciada documentada.', 'El propietario confirma PAL España y aporta frontal y reverso: título Masacre (Deadpool), EAN 5030917185991, código de embalaje 77110206SP.', 'BLES-01789 pertenece al formato de PS3 y se rechaza para esta ficha PS4; no se inventa un CUSA.'], 'preservation': 'No se eliminan copias, fotos, fechas, deseos, anuncios ni ventas. Alias explícito al ID original del usuario; ficha antigua excluida de listados y redirigida.'})
decision = read('data/research/owned-scans/2026-09-11-batch2-decisions.json')
row = decision['games'].pop(OLD)
row['identity']['slug'] = 'deadpool'
row['excludedSimilarCatalogIds'] = ['ps4-usa-deadpool']
row['mappingNotes'] = entry['mappingNotes']
row['packaging']['rejectedReferences'] = ['BLES-01789']
decision['games'][KEEP] = row
write('data/research/owned-scans/2026-09-11-batch2-decisions.json', decision)
print(json.dumps({'merged': OLD, 'into': KEEP, 'companies': changed_companies}))
