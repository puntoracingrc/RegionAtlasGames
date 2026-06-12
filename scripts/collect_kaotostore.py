#!/usr/bin/env python3
"""Ingest referencias retail desde kaotostore.myshopify.com (Shopify JSON).

  python3 scripts/collect_kaotostore.py --platform saturn --dry-run
  ./scripts/run_kaoto_ingest.sh saturn --sync
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.kaoto_client import fetch_collection_products  # noqa: E402
from collectors.kaoto_match import (  # noqa: E402
    KAOTO_PLATFORM_COLLECTIONS,
    best_kaoto_match,
    pick_best_product_rows,
    product_to_ingest_row,
)
from collectors.reference_match import build_platform_reference_index  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "kaoto"


def load_catalog() -> list[dict[str, Any]]:
    return load_json(CATALOG_FILE, [])


def collect_platform(platform_slug: str, *, use_cache: bool) -> list[dict[str, Any]]:
    cache_file = CACHE_DIR / f"{platform_slug}.json"
    handle = KAOTO_PLATFORM_COLLECTIONS.get(platform_slug)
    if not handle:
        raise SystemExit(f"Plataforma sin colección Kaoto: {platform_slug}")

    if use_cache and cache_file.exists():
        return load_json(cache_file, [])

    products = fetch_collection_products(handle)
    for product in products:
        product["platformSlug"] = platform_slug
    save_json(cache_file, products)
    return products


def build_kaoto_rows(platform_slug: str, products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog = load_catalog()
    platform_games = [g for g in catalog if g.get("platformSlug") == platform_slug]
    _, ref_to_ids = build_platform_reference_index(platform_slug)
    grouped: dict[str, list[dict[str, Any]]] = {}
    unmatched = 0
    matched_by_ref = 0

    for product in products:
        game, matched_ref = best_kaoto_match(
            product,
            platform_games,
            platform_slug,
            ref_to_ids=ref_to_ids,
        )
        if not game:
            unmatched += 1
            continue
        if matched_ref:
            matched_by_ref += 1
        row = product_to_ingest_row(
            product,
            str(game["id"]),
            matched_reference=matched_ref,
            match_method="reference" if matched_ref else "title",
        )
        if not row:
            continue
        grouped.setdefault(str(game["id"]), []).append(row)

    chosen = pick_best_product_rows(grouped)
    rows = list(chosen.values())
    print(f"  Productos Kaoto: {len(products)}")
    print(f"  Sin match catálogo: {unmatched}")
    print(f"  Match por referencia: {matched_by_ref}")
    print(f"  Referencias Kaoto: {len(rows)}")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Kaoto Store retail references")
    parser.add_argument("--platform", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--use-cache", action="store_true")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.platform not in KAOTO_PLATFORM_COLLECTIONS:
        known = ", ".join(sorted(KAOTO_PLATFORM_COLLECTIONS))
        raise SystemExit(f"Plataforma no soportada: {args.platform}. Opciones: {known}")

    out = args.output or ROOT / "data" / "price-ingest" / f"{args.platform}-kaoto.json"

    print(f"=== Kaoto Store · {args.platform} ===")
    products = collect_platform(args.platform, use_cache=args.use_cache)
    kaoto_rows = build_kaoto_rows(args.platform, products)

    if args.dry_run:
        for row in kaoto_rows[:8]:
            print(f"  {row['catalogId']}: {row['priceEur']} € ({row['condition']})")
        if len(kaoto_rows) > 8:
            print(f"  … y {len(kaoto_rows) - 8} más")
        return

    save_json(
        out,
        {
            "platformSlug": args.platform,
            "collectedAt": now_iso(),
            "source": "kaotostore",
            "listings": [],
            "cex": [],
            "jgo": [],
            "chollo": [],
            "kaoto": kaoto_rows,
        },
    )
    print(f"  Guardado: {out}")

    if args.sync:
        import subprocess

        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "sync_es_prices.py"),
                "--platform",
                args.platform,
                "--input",
                str(out),
            ],
            check=True,
        )


if __name__ == "__main__":
    main()
