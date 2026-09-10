"""Attach only recovered images to their existing exact PS1 source references."""
import argparse
import gzip
import hashlib
import json
import pathlib
from urllib.parse import unquote, urlparse

ROOT=pathlib.Path(__file__).resolve().parents[1]
ART=ROOT/'artifacts/ps1-pending-covers'

def read_gz(path):return json.loads(gzip.decompress(path.read_bytes()))

def matching_fronts(game, profile):
    """Require one standard front with the edition's exact serial and market."""
    if game.get('regionalStatus')!='resolved':return []
    result=[]
    for asset in profile.get('graphics',[]):
        filename=unquote(urlparse(asset['sourceImageReference']).path.rsplit('/',1)[-1]).upper()
        exact_serial=any(filename.startswith(code+'-F') for code in game.get('canonicalSerials',[]))
        exact_market=asset.get('marketHints')==[game.get('regionCode')]
        jewel_group=bool(asset.get('group') and 'jewel case' in asset['group'].lower())
        standard_front=(asset.get('label') or '').strip().upper()=='FRONT'
        if asset.get('stored') and not asset.get('thumbnailOnly') and 'front_cover' in asset.get('roles',[]) and exact_serial and exact_market and jewel_group and standard_front:result.append(asset)
    return result

def apply(write=False):
    results=read_gz(ART/'source-results.json.gz')
    sources={r['sourceReferenceUrl']:r for r in results if r['status'] in ('downloaded','already_present')}
    assets=read_gz(ART/'assets.json.gz')
    for asset in assets:
        file=ROOT/'public'/asset['url'].lstrip('/')
        data=file.read_bytes()
        if len(data)!=asset['bytes'] or hashlib.sha256(data).hexdigest()!=asset['sha256']:raise ValueError('Static image integrity failed: '+asset['url'])
    catalog=json.loads((ROOT/'data/catalog.json').read_text())
    profiles=read_gz(ROOT/'data/ps1-edition-evidence.json.gz')
    redirects={r['source']:r['destination'] for r in json.loads((ROOT/'data/cover-asset-redirects.json').read_text())}
    for game in catalog:
        if game.get('coverUrl') in redirects:game['coverUrl']=redirects[game['coverUrl']]
    for profile in profiles.values():
        for image in profile.get('graphics',[]):
            if image.get('url') in redirects:image['url']=redirects[image['url']]
        cover=profile.get('fieldProvenance',{}).get('cover')
        if cover and cover.get('value') in redirects:cover['value']=redirects[cover['value']]
    gallery_updates=[];cover_updates=[];review=[]
    for game in catalog:
        if game.get('platformSlug')!='ps1':continue
        profile=profiles[game['id']]
        for asset in profile.get('graphics',[]):
            result=sources.get(asset['sourceImageReference'])
            if not result or asset.get('stored'):continue
            asset.update(stored=True,url=result['url'],sha256=result['sha256'],bytes=result['bytes'],storageLocation=result['storageLocation'])
            for field in ('width','height','sourceImageUrl','thumbnailOnly'):
                if result.get(field) is not None:asset[field]=result[field]
            asset['verifiedAt']='2026-09-10'
            gallery_updates.append({'catalogId':game['id'],'assetId':asset['assetId'],'url':asset['url'],'sha256':asset['sha256']})
        # Existing cover assignments, including SFTP images, remain authoritative.
        if game.get('coverUrl'):continue
        fronts=matching_fronts(game,profile)
        if len(fronts)!=1:
            if fronts:review.append({'catalogId':game['id'],'reason':'multiple_matching_fronts','count':len(fronts)})
            continue
        candidate=fronts[0]
        if candidate['sourceImageReference'] not in sources:continue
        game['coverUrl']=candidate['url']
        profile.setdefault('fieldProvenance',{})['cover']={'assetId':candidate['assetId'],'sha256':candidate['sha256'],'value':candidate['url'],'source':'psxdatacenter-gallery','sourceUrl':candidate['sourceUrl'],'confidence':'documented','verifiedAt':'2026-09-10','assignmentBasis':'exact_serial_source_market_and_edition','visuallyInspected':False}
        profile['coverStatus']='matched_recovered_archive'
        cover_updates.append({'catalogId':game['id'],'assetId':candidate['assetId'],'url':candidate['url'],'sha256':candidate['sha256']})
    report={'galleryReferencesAdded':len(gallery_updates),'gamesWithGalleryUpdates':len({r['catalogId'] for r in gallery_updates}),'missingMainCoversFilled':len(cover_updates),'ambiguousMainCoversKeptForReview':len(review),'galleryUpdates':gallery_updates,'coverUpdates':cover_updates,'review':review}
    if write:
        (ROOT/'data/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
        (ROOT/'data/ps1-edition-evidence.json.gz').write_bytes(gzip.compress(json.dumps(profiles,ensure_ascii=False,separators=(',',':')).encode()+b'\n',mtime=0))
        (ART/'integration.json.gz').write_bytes(gzip.compress(json.dumps(report,ensure_ascii=False,separators=(',',':')).encode()+b'\n',mtime=0))
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write',action='store_true')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if args.write and args.check:parser.error('Choose write or check')
    report=apply(args.write)
    print(json.dumps({k:v for k,v in report.items() if not isinstance(v,list)}))
    if args.check and (report['galleryReferencesAdded'] or report['missingMainCoversFilled']):raise SystemExit('Recoverable PS1 graphics remain unlinked')
