#!/usr/bin/env python3
"""Genera data/index/company-entities.json desde game-details.json."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.game_details_lib import is_valid_detail, load_json  # noqa: E402
from company_entity import build_company_entity_registry, save_company_entity_registry  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"


def main() -> None:
    catalog = load_json(CATALOG_FILE, [])
    details = load_json(DETAILS_FILE, {})
    listed_ids = {
        g["id"]
        for g in catalog
        if g.get("listingStatus") != "excluded" and g["id"] in details and is_valid_detail(details[g["id"]])
    }
    registry = build_company_entity_registry(details, listed_ids)
    path = save_company_entity_registry(registry)
    print(f"Registro de entidades: {registry['stats']} -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
