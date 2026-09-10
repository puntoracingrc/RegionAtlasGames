"""Stage four documented scans on Region Atlas instead of the full SFTP host."""
import hashlib
import json
import urllib.request
from pathlib import Path
from reference import ART, ROOT, load_gzip

TARGET_CODES = {'SCES-03086', 'SCES-03087'}


def main():
    dest = ROOT / 'public/catalog-covers/ps1-regional-v2'
    dest.mkdir(parents=True, exist_ok=True)
    rows = {}
    for asset in load_gzip('psx-assets.json.gz'):
        if not any(code + '/' in asset['referenceUrl'] for code in TARGET_CODES): continue
        if not set(asset['types']) & {'front_cover', 'back_cover'}: continue
        # These exact image references were checked against the source gallery.
        url = asset['referenceUrl'].removesuffix('.html') + '.jpg'
        content = urllib.request.urlopen(url, timeout=30).read()
        if not content.startswith(b'\xff\xd8\xff'): raise ValueError('Not a JPEG: ' + url)
        sha = hashlib.sha256(content).hexdigest()
        name = sha + '.jpg'
        (dest / name).write_bytes(content)
        rows[asset['assetId']] = {'url':'/catalog-covers/ps1-regional-v2/' + name,'sha256':sha,'bytes':len(content),'stored':True,'storageLocation':'regionatlas-static','sourceImageUrl':url,'verifiedAt':'2026-09-10'}
    assert len(rows) == 4
    (ART / 'sources/local-reference-assets.json').write_text(json.dumps(rows, indent=2)+'\n')
    print(json.dumps({'stagedScans':len(rows),'bytes':sum(r['bytes'] for r in rows.values()),'destination':str(dest)}))


if __name__=='__main__': main()
