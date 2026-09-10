"""Read-only HTTP verification of assigned images; no FTP connections or writes."""
import concurrent.futures
import hashlib
import gzip
import json
import time
import sys
import urllib.request
from urllib.parse import unquote
from reference import ART, ROOT

BASE='https://www.puntoracing.net/MEDIAREGIONATLAS/covers/'


def main():
    assets=json.loads((ART/'assigned-cover-evidence.json').read_text())
    gallery = '--gallery' in sys.argv
    if gallery:
        profiles=json.load(gzip.open(ROOT/'data/ps1-edition-evidence.json.gz','rt'))
        catalog=json.loads((ROOT/'data/catalog.json').read_text())
        assets=[a for g in catalog if g['platformSlug']=='ps1' for a in profiles[g['id']]['graphics']
                if a.get('stored') and a.get('url') and any(unquote(a['sourceImageReference'].split('/')[-1]).upper().startswith(code+'-') for code in g.get('canonicalSerials',[]))]
    urls={a['url']:a for a in assets}
    previous=json.loads((ART/'cover-http-verification.json').read_text()) if gallery else {'rows':[]}
    cache={row['url']:row for row in previous['rows'] if row['status']=='verified_http_size'}
    def verify(pair):
        path,a=pair
        if path.startswith('/catalog-covers/'):
            content=(ROOT/'public'/path.lstrip('/')).read_bytes()
            return {'url':path,'status':'verified_local','sha256Matches':hashlib.sha256(content).hexdigest()==a['sha256'],'bytes':len(content)}
        url=BASE+path.removeprefix('/covers/')
        if url in cache and cache[url]['bytes']==a['bytes'] and cache[url]['sha256']==a['sha256']:
            return {**cache[url],'reusedCoverCheck':True}
        for attempt in range(2):
            try:
                request=urllib.request.Request(url,method='HEAD',headers={'User-Agent':'RegionAtlas-documentary-verification/1.0'})
                with urllib.request.urlopen(request,timeout=25) as response:
                    size=int(response.headers.get('Content-Length','0'))
                    ok=response.status==200 and response.headers.get('Content-Type','').startswith('image/') and size==a['bytes']
                    return {'url':url,'status':'verified_http_size' if ok else 'mismatch','http':response.status,'bytes':size,'expectedBytes':a['bytes'],'sha256':a['sha256']}
            except Exception as error:
                if attempt: return {'url':url,'status':'error','error':str(error)}
                time.sleep(0.3)
    rows=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for row in pool.map(verify,urls.items()):
            rows.append(row)
            if len(rows)%500==0:print(json.dumps({'checked':len(rows),'total':len(urls)}),flush=True)
    failures=[r for r in rows if r['status'] not in {'verified_local','verified_http_size'} or r.get('sha256Matches') is False]
    result={'checkedAt':'2026-09-10','catalogAssignments':len(assets),'uniqueUrls':len(urls),'failed':len(failures),'failures':failures,'verificationScope':('Every displayed gallery reference' if gallery else 'Every assigned cover')+': HTTP status, image content type and expected byte length; local scans checked by SHA-256. Remote body hashes checked only in visual sample.','rows':rows}
    (ART/('gallery-http-verification.json' if gallery else 'cover-http-verification.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False))
    if failures:raise SystemExit(1)


if __name__=='__main__':main()
