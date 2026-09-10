"""Exercise the public V2 resolver, catalog search and preserved routes."""
import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from reference import ART

parser=argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://localhost:3077')
parser.add_argument('--output', default='http-qa.json')
args=parser.parse_args()
checks=[]

def get(path, status=200):
    url=args.base_url.rstrip('/')+path
    try:
        with urllib.request.urlopen(url,timeout=90) as response:
            code=response.status
            body=response.read().decode()
    except urllib.error.HTTPError as error:
        code=error.code;body=error.read().decode()
    assert code==status,(url,code,status)
    checks.append({'url':url,'http':code})
    return body

def resolve(code):
    result=json.loads(get('/api/catalog/ps1/resolve?'+urllib.parse.urlencode({'serial':code})))
    assert result['physicalVariantResolved'] is False
    return result['candidates']

f1=resolve('SLES-02723')
assert len(f1)==1 and f1[0]['marketRegion']=='Europe' and f1[0]['languages']==['da','en','es','fi','sv']
dino=resolve('SLES-03225')
assert len(dino)==1 and dino[0]['languageEvidence']['text']==['es'] and dino[0]['languageEvidence']['audio']==['en']
dragoon=resolve('SCES-03047');last=resolve('SCES-33047')
assert [c['catalogId'] for c in dragoon]==[c['catalogId'] for c in last] and len(dragoon[0]['components'])==4
gta=resolve('SLES-02458')
assert len(gta)==1 and gta[0]['serialScope']=='packaging' and gta[0]['regionCode']=='FR'
assert resolve('SLES-03137-T')[0]['regionCode']=='ES'
assert resolve('SLES-03225-UNKNOWN')==[]
get('/api/catalog/ps1/resolve',400)
get('/api/catalog/ps1/resolve?serial='+'A'*65,400)
fr=json.loads(get('/api/catalog/platform/ps1?'+urllib.parse.urlencode({'region':'PAL Francia'})))
assert fr['total']==292 and all(g['region']=='PAL Francia' and g['canonicalSeoSlug'] for g in fr['items'])
search=json.loads(get('/api/catalog/platform/ps1?q=SLES-02723'))
assert search['total']==1 and search['items'][0]['canonicalSeoSlug']=='f1-2000-sles-02723-ps1-pal-eu'
for route,expected in [
    ('/catalogo/legend-of-dragoon-ps1-pal-es','4 discos en esta edición'),
    ('/catalogo/007-racing-ps1-pal-us','NTSC USA'),
    ('/catalogo/f1-2000-sles-02723-ps1-pal-eu','Multi-5'),
    ('/catalogo/ms-pac-man-maze-madness-sces-03086-ps1-pal-fr','Código de la caja'),
]:
    assert expected in get(route),(route,expected)
result={'status':'passed','baseUrl':args.base_url,'count':len(checks),'checks':checks,'interpretation':'Documentary data and HTTP/UI routes only; no paid model call or recognition-accuracy measurement.'}
(ART/args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
