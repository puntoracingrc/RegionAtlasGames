"""Rebuild from frozen inputs and require byte-identical data and decisions."""
import hashlib
import json
import subprocess
import sys
from reference import ART, ROOT

paths = [
    'data/catalog.json', 'data/game-details.json', 'data/meta.json',
    'data/index/companies.json', 'data/index/genres.json', 'data/index/series.json',
    'data/ps1-edition-evidence.json', 'data/ps1-region-markets.json', 'data/ps1-works.json',
    'data/research/company-study/manifest.json', 'data/research/person-study/manifest.json',
] + ['artifacts/ps1-region-migration/' + name for name in [
    'source-resolution.json', 'serial-aliases.json', 'catalog-resolution.json',
    'work-relationship-evidence.json', 'PS1-REGION-MAP.csv', 'review-queue.json',
    'source-review-queue.json', 'assigned-cover-evidence.json', 'migration-summary.json',
    'REFERENCE-610.json', 'REFERENCE-610.csv',
    'PSX-LISTS-COMPARISON.csv', 'list-comparison-summary.json',
]]

def hashes():
    return {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in paths}

before = hashes()
for name in ['reference', 'audit', 'migrate', 'refresh_indexes', 'describe_review', 'reconcile_reference', 'compare_index']:
    print('Rebuilding ' + name, flush=True)
    subprocess.run([sys.executable, str(ROOT/'scripts/ps1-regional'/f'{name}.py')], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
after = hashes()
changed = [name for name in paths if before[name] != after[name]]
result = {'status': 'passed' if not changed else 'failed', 'files': len(paths), 'changed': changed, 'hashes': after}
(ART/'reproducibility.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k != 'hashes'}))
if changed:
    raise SystemExit(1)
