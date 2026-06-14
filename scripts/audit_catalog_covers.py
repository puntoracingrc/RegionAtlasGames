#!/usr/bin/env python3
"""Auditoría coverUrl + CDN por plataforma."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.covers_storage import is_local_cover_url  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
CDN = "https://www.puntoracing.net/MEDIAREGIONATLAS/covers"


def head_ok(url: str, timeout: float = 12.0) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "RAG-Audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except urllib.error.HTTPError as exc:
        return 200 <= exc.code < 400
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=15, help="Juegos a probar en CDN por plataforma")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    by_platform: dict[str, list[dict]] = defaultdict(list)
    for game in catalog:
        if game.get("listingStatus") == "excluded":
            continue
        slug = str(game.get("platformSlug") or "")
        if slug:
            by_platform[slug].append(game)

    print(f"{'platform':12} listed  /covers  http  none  cdn_ok/sample")
    issues: list[str] = []

    for slug in sorted(by_platform):
        games = by_platform[slug]
        local = http = none = 0
        for g in games:
            u = g.get("coverUrl")
            if not u:
                none += 1
            elif str(u).startswith("http"):
                http += 1
            elif is_local_cover_url(str(u)):
                local += 1
            else:
                none += 1

        sample = [g for g in games if is_local_cover_url(str(g.get("coverUrl") or ""))][: args.sample]
        ok = 0
        for g in sample:
            rel = str(g["coverUrl"]).replace("/covers/", "")
            if head_ok(f"{CDN}/{rel}"):
                ok += 1
        print(f"{slug:12} {len(games):5} {local:6} {http:4} {none:4} {ok}/{len(sample)}")

        if http:
            issues.append(f"{slug}: {http} URLs http (normalizar)")
        if none > len(games) * 0.05 and slug not in {"ps4"}:
            issues.append(f"{slug}: {none} sin coverUrl")
        if sample and ok < len(sample) * 0.8:
            issues.append(f"{slug}: CDN {ok}/{len(sample)} en muestra")

    if issues:
        print("\nProblemas:")
        for line in issues:
            print(f"  - {line}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
