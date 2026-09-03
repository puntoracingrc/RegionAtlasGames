#!/usr/bin/env python3
"""Regression checks for imported company-logo assets and metadata."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from import_company_logos import EXPECTED_COUNT, sha256, validate_svg  # noqa: E402


def main() -> None:
    companies = json.loads((ROOT / "data/index/companies.json").read_text())
    registry = json.loads((ROOT / "data/company-logo-assets.json").read_text())
    checksums = json.loads(
        (ROOT / "data/research/company-logos/output-checksums.json").read_text()
    )
    assert len(registry) == EXPECTED_COUNT
    assert set(registry) == set(companies)
    assert sum(item["authentic"] for item in registry.values()) == 522
    assert sum(item["provisional"] for item in registry.values()) == 3_804
    assert sum(item["compositeCredit"] for item in registry.values()) == 383

    seen_urls: set[str] = set()
    for slug, item in registry.items():
        assert item["authentic"] is not item["provisional"]
        assert item["logoUrl"].startswith("/company-logos/")
        assert item["logoUrl"] not in seen_urls
        seen_urls.add(item["logoUrl"])
        path = ROOT / "public" / item["logoUrl"].removeprefix("/")
        assert path.is_file(), f"Falta {path}"
        assert sha256(path) == checksums[slug]
        assert path.suffix.lower() in {".svg", ".webp"}
        if path.suffix.lower() == ".svg":
            raw = path.read_text(encoding="utf-8")
            assert "\ufffd" not in raw, f"Carácter roto en {slug}"
            validate_svg(path)
        else:
            with Image.open(path) as image:
                image.verify()

    report = json.loads((ROOT / "data/research/company-logos/import-report.json").read_text())
    assert report["matching"] == "EXACT_SLUG_ONLY"
    assert report["fuzzyAssignments"] == 0
    assert report["missingFiles"] == 0
    print(
        f"PASS: {len(registry)} imágenes, 522 auténticas, 3804 provisionales, "
        "0 rotas y 0 asignaciones difusas"
    )


if __name__ == "__main__":
    main()
