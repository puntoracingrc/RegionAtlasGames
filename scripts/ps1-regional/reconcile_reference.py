"""Reconstruct ChatGPT's 610-row sample from frozen primary inputs.

The original spreadsheet was not attached. This is an independent reconstruction,
not a claim to have read that spreadsheet. Preserve regional combinations and gaps.
"""
import csv
import json
import re
from collections import Counter, defaultdict
from reference import ART, SOURCES, load_gzip, market, serials


def main():
    dat = (SOURCES / 'libretro-redump.dat').read_text()
    rd = []
    for block in re.findall(r'^game \(\n(.*?)^\)', dat, re.M | re.S):
        fields = dict(re.findall(r'^\t(name|region|serial) "(.*)"$', block, re.M))
        rd.append({'name': fields['name'], 'region': fields.get('region'), 'serials': serials(fields.get('serial'))})
    by_serial = defaultdict(list)
    for row in rd:
        for code in row['serials']: by_serial[code].append(row)
    aliases = json.loads((ART / 'serial-aliases.json').read_text())
    source = {p['sourceUrl']: p for p in json.loads((ART / 'source-resolution.json').read_text())}
    output = []
    for row in load_gzip('psx-index.json.gz'):
        if row['family'] != 'pal' or 'S' not in row['languageTags']: continue
        pages = [source[u] for u in row['infoUrls'] if u in source]
        codes = serials(row['serialText'])
        lookup = set(codes) | {a['sourceSerial'] for a in aliases if a['canonicalSerial'] in codes}
        matches = {r['name']: r for c in sorted(lookup) for r in by_serial[c]}
        regions = sorted({r['region'] for r in matches.values() if r['region']})
        markets = {p['market']['code']: p['market'] for p in pages if p['market']}
        reasons = sorted({r for p in pages for r in p['reviewReasons']})
        selected = next(iter(markets.values())) if len(markets) == 1 and not reasons else None
        output.append({'row':row['row'], 'serial':row['serialText'], 'title':row['title'], 'languagesIndex':row['languageTags'], 'languagesDetail':sorted({c for p in pages for c in p['languages']['all']}), 'market':selected, 'reviewReasons':reasons, 'sourceUrls':row['infoUrls'], 'libretroRegions':regions, 'libretroMatches':list(matches.values()), 'serialScope':pages[0]['serialScope'] if pages else None})
    assert len(output) == 610
    result = {'status':'independent_reconstruction_original_spreadsheet_unavailable', 'chatgptReportedCounts':{'Spain':168,'Europe':431,'France':5,'Germany':5,'Italy':1}, 'resolvedCounts':dict(Counter(r['market']['market'] if r['market'] else 'REVIEW' for r in output)), 'libretroExactOrDocumentedAliasCounts':dict(Counter(' | '.join(r['libretroRegions']) or 'NO_MATCH' for r in output)), 'rows':output}
    (ART / 'REFERENCE-610.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    with (ART / 'REFERENCE-610.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['row','serial','title','market','serial_scope','languages_index','languages_detail','libretro_regions','review_reasons','source_urls'])
        writer.writeheader()
        for r in output:
            writer.writerow({'row':r['row'],'serial':r['serial'],'title':r['title'],'market':r['market']['market'] if r['market'] else 'REVIEW','serial_scope':r['serialScope'],'languages_index':'|'.join(r['languagesIndex']),'languages_detail':'|'.join(r['languagesDetail']),'libretro_regions':'|'.join(r['libretroRegions']),'review_reasons':'|'.join(r['reviewReasons']),'source_urls':'|'.join(r['sourceUrls'])})
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False))


if __name__=='__main__':main()
