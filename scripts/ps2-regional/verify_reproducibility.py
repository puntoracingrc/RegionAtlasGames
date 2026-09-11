"""Replay the PS2 migration without fetching sources; restore outputs on failure."""
import hashlib
import gzip
import json
import subprocess
import sys
from reference import ROOT, ART
sys.path.insert(0, str(ROOT / "scripts"))
from owned_scan_migration_compat import historical_bytes

paths = ["data/catalog.json", "data/game-details.json", "data/ps2-edition-evidence.json.gz", "data/ps2-works.json.gz", "data/ps2-region-markets.json", "data/ps2-source-knowledge.json.gz", "data/meta.json", "data/platforms.json", "data/curation-report.json", "data/index/companies.json", "data/index/genres.json", "data/index/series.json", "data/research/company-study/manifest.json", "data/research/person-study/manifest.json"]
paths += ["data/catalog-route-redirects.json"]
paths += ["artifacts/ps2-region-migration/" + name for name in ["source-resolution.json", "catalog-resolution.json", "serial-aliases.json", "PS2-REGION-MAP.csv", "work-relationship-evidence.json", "assigned-cover-evidence.json", "migration-summary.json"]]
before = {name: (ROOT / name).read_bytes() for name in paths}
replay_inputs = {name: historical_bytes(name, value) for name, value in before.items()}
def content(name, value):
    # Python/zlib versions can produce different gzip containers for the same
    # JSON. Compare their full uncompressed bytes, as the PS1 verifier does.
    return gzip.decompress(value) if name.endswith(".gz") else value
try:
    for name, data in replay_inputs.items():
        if data != before[name]:
            (ROOT / name).write_bytes(data)
    for script in ["reference", "audit", "migrate", "build_knowledge", "refresh_indexes"]:
        subprocess.run([sys.executable, str(ROOT / "scripts/ps2-regional" / (script + ".py"))], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    changed = [name for name in paths if content(name, replay_inputs[name]) != content(name, (ROOT / name).read_bytes())]
    assert not changed, changed
except BaseException:
    for name, data in before.items():
        (ROOT / name).write_bytes(data)
    raise
for name, data in before.items():
    if (ROOT / name).read_bytes() != data:
        (ROOT / name).write_bytes(data)
report = {"status": "PASS", "files": len(paths), "hashScope": "Full bytes; gzip files after decompression to ignore platform container differences", "hashes": {name: hashlib.sha256(content(name, data)).hexdigest() for name, data in before.items()}}
(ART / "reproducibility.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": "PASS", "files": len(paths)}))
