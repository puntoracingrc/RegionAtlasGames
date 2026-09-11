"""Replay historical regional migrations against their reviewed pre-scan inputs.

Every current file and its Git predecessor must match the amendment ledger.
This keeps the historical PS1/PS2 boundaries strict while allowing subsequent catalog work.
"""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / 'data/research/owned-scans/2026-09-11-catalog-amendments.json'


def historical_bytes(name, current=None):
    value = (ROOT / name).read_bytes() if current is None else current
    if not LEDGER.exists():
        return value
    ledger = json.loads(LEDGER.read_text())
    entry = ledger['files'].get(name)
    if not entry:
        return value
    assert hashlib.sha256(value).hexdigest() == entry['afterSha256'], f'Unreviewed change after owned scans: {name}'
    previous = subprocess.check_output(['git', 'show', ledger['beforeCommit'] + ':' + name], cwd=ROOT)
    assert hashlib.sha256(previous).hexdigest() == entry['beforeSha256'], f'Historical input mismatch: {name}'
    return previous
