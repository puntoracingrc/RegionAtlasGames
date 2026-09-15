"""Replay historical regional migrations against their reviewed inputs.

Every current file and each Git predecessor must match an amendment ledger.
This keeps the historical PS1/PS2 boundaries strict while allowing subsequent catalog work.
"""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGERS = [
    ROOT / 'data/research/owned-scans/2026-09-11-catalog-amendments.json',
    ROOT / 'data/research/ac-ps4-worldwide/ac3-remastered-2026-09-15-amendments.json',
]


def rewind_reviewed_amendment(name, value, ledger_path):
    if not ledger_path.exists():
        return value
    ledger = json.loads(ledger_path.read_text())
    entry = ledger['files'].get(name)
    if not entry:
        return value
    batch = ledger.get('batchId') or ledger_path.name
    assert hashlib.sha256(value).hexdigest() == entry['afterSha256'], (
        f'Unreviewed change after {batch}: {name}'
    )
    previous = subprocess.check_output(
        ['git', 'show', ledger['beforeCommit'] + ':' + name], cwd=ROOT
    )
    assert hashlib.sha256(previous).hexdigest() == entry['beforeSha256'], (
        f'Historical input mismatch for {batch}: {name}'
    )
    return previous


def historical_bytes(name, current=None):
    value = (ROOT / name).read_bytes() if current is None else current
    for ledger_path in reversed(LEDGERS):
        value = rewind_reviewed_amendment(name, value, ledger_path)
    return value
