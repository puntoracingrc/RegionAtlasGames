"""Restore the exact sealed pre-backlog projection solely for reproducibility QA."""
import gzip
import hashlib
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
patch=json.loads(gzip.decompress((ROOT/'artifacts/ps1-pending-covers/base-patch.json.gz').read_bytes()))
outputs={}
for name, changes in patch['files'].items():
    raw=(ROOT/name).read_bytes()
    payload=gzip.decompress(raw) if name.endswith('.gz') else raw
    digest=hashlib.sha256(payload).hexdigest()
    if digest==changes['beforeSha256']:continue
    if digest!=changes['afterSha256']:raise SystemExit('Refusing to restore an unreviewed projection: '+name)
    data=json.loads(payload)
    if isinstance(data,list):
        by_id={row['id']:row for row in data}
        for ident, cover in changes['coverUrls'].items():by_id[ident]['coverUrl']=cover
    else:
        for ident, old in changes['profiles'].items():
            profile=data[ident]
            for image in old['graphics']:profile['graphics'][image['index']]=image['value']
            for field in ('coverStatus',):
                if field in old:profile[field]=old[field]
                else:profile.pop(field,None)
            if 'coverProvenance' in old:profile['fieldProvenance']['cover']=old['coverProvenance']
            else:profile['fieldProvenance'].pop('cover',None)
    restored=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode() if name.endswith('.gz') else (json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
    if hashlib.sha256(restored).hexdigest()!=changes['beforeSha256']:raise SystemExit('Baseline reconstruction mismatch: '+name)
    outputs[name]=gzip.compress(restored,mtime=0) if name.endswith('.gz') else restored
for name, payload in outputs.items():(ROOT/name).write_bytes(payload)
print('Restored exact pre-backlog data for the frozen regional rebuild')
