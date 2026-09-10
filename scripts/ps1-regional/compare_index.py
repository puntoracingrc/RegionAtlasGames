"""Account for every row of the three PSX lists, including rows without links."""
import csv
import gzip
import json
from collections import Counter, defaultdict
from reference import ART, ROOT, load_gzip

rows=load_gzip('psx-index.json.gz')
pages=json.loads((ART/'source-resolution.json').read_text())
audit=json.loads((ART/'catalog-resolution.json').read_text())
profiles=json.load(gzip.open(ROOT/'data/ps1-edition-evidence.json.gz','rt'))
pages_by_url=defaultdict(list)
for page in pages:
    pages_by_url[page['sourceUrl']].append(page)
pages_by_id={p['sourceId']:p for p in pages}
release_for_source={sid:r['releaseId'] for r in audit['releases'].values() for sid in r['sourceIds']}
ids_for_release=defaultdict(list)
for gid,p in profiles.items():
    if p.get('releaseId'):ids_for_release[p['releaseId']].append(gid)
result=[]
for row in rows:
    candidates=([pages_by_id[f"psxdc-index-{row['family']}-{row['row']}"]] if not row['infoUrls'] else
                [p for url in row['infoUrls'] for p in pages_by_url[url]])
    ids=sorted({gid for p in candidates for gid in ids_for_release.get(release_for_source[p['sourceId']],[])})
    resolved=sorted(gid for gid in ids if profiles[gid]['status']=='resolved')
    reasons=sorted({r for p in candidates for r in p['reviewReasons']})
    result.append({'family':row['family'],'row':row['row'],'title':row['title'],'serial':row['serialText'],
        'index_only':not bool(row['infoUrls']),'status':'represented_resolved' if resolved else 'represented_review' if ids else 'source_requires_review',
        'catalog_ids':'|'.join(ids),'review_reasons':'|'.join(reasons),'source_urls':'|'.join(row['infoUrls'] or [row['sourceUrl']])})
assert len(result)==8852
with (ART/'PSX-LISTS-COMPARISON.csv').open('w',newline='') as output:
    writer=csv.DictWriter(output,fieldnames=list(result[0]));writer.writeheader();writer.writerows(result)
summary={'rows':len(result),'families':dict(Counter(r['family'] for r in result)),
    'status':dict(Counter(r['status'] for r in result)),
    'indexOnlyStatus':dict(Counter(r['status'] for r in result if r['index_only'])),
    'interpretation':'Counts are index rows and documented regional releases, not unique games or certified physical variants.'}
(ART/'list-comparison-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
