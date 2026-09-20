#!/usr/bin/env python3
"""Comprueba que una plataforma existe en el catalogo canonico del worker."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from collectors.catalog_source import (
    load_catalog,
    platform_inventory,
    require_platform_catalog,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "data" / "catalog.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", required=True)
    parser.add_argument("--region")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()

    catalog = load_catalog(args.catalog)
    require_platform_catalog(
        catalog,
        args.platform,
        source=args.catalog,
        region=args.region,
    )
    report = {
        "ok": True,
        "catalog": str(args.catalog),
        **platform_inventory(catalog, args.platform, region=args.region),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
