#!/usr/bin/env python3
"""Ingest referencias retail desde chollogames.es (PrestaShop, tienda Madrid).

  python3 scripts/collect_chollogames.py --platform n64 --dry-run
  ./scripts/run_chollo_ingest.sh n64 --sync
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.chollo_client import fetch_category_products  # noqa: E402
from collectors import platform_sources as ps  # noqa: E402
from collectors.chollo_match import (  # noqa: E402
    CHOLLO_PLATFORM_CATEGORIES,
    infer_chollo_region_product,
    pick_best_product_rows,
    product_to_ingest_row,
)
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "chollo"


def load_catalog() -> list[dict[str, Any]]:
    return load_json(CATALOG_FILE, [])


def collect_platform(platform_slug: str, *, use_cache: bool) -> list[dict[str, Any]]:
    cache_file = CACHE_DIR / f"{platform_slug}.json"
    category = ps.chollo_category(platform_slug)
    if not category:
        raise SystemExit(f"Plataforma sin categoría Chollo: {platform_slug}")

    if use_cache and cache_file.exists():
        return load_json(cache_file, [])

    products = fetch_category_products(category)
    for product in products:
        product["platformSlug"] = platform_slug
    save_json(cache_file, products)
    return products


def build_chollo_rows(
    platform_slug: str,
    products: list[dict[str, Any]],
    *,
    use_ai: bool,
    use_match_cache: bool,
) -> list[dict[str, Any]]:
    catalog = load_catalog()
    platform_games = [g for g in catalog if g.get("platformSlug") == platform_slug]
    _, ref_to_ids = build_platform_reference_index(platform_slug)

    def row_builder(product: dict[str, Any], game: dict[str, Any], result) -> dict[str, Any] | None:
        row = product_to_ingest_row(product, str(game["id"]), **match_row_kwargs(result))
        return row if row else None

    stats = run_match_pipeline(
        products,
        platform_games,
        platform_slug,
        source="chollogames",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_chollo_region_product,
        use_ai=use_ai,
        use_match_cache=use_match_cache,
        pick_best=pick_best_product_rows,
    )
    print_match_stats(stats, label="Chollo")
    print(f"  Referencias Chollo: {len(stats.rows)}")
    return stats.rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Chollo Games retail references")
    parser.add_argument("--platform", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--use-cache", action="store_true")
    add_match_flags(parser)
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.platform not in CHOLLO_PLATFORM_CATEGORIES:
        known = ", ".join(sorted(CHOLLO_PLATFORM_CATEGORIES))
        raise SystemExit(f"Plataforma no soportada: {args.platform}. Opciones: {known}")

    out = args.output or ROOT / "data" / "price-ingest" / f"{args.platform}-chollo.json"

    print(f"=== Chollo Games · {args.platform} ===")
    products = collect_platform(args.platform, use_cache=args.use_cache)
    chollo_rows = build_chollo_rows(args.platform, products, **match_kwargs(args))

    if args.dry_run:
        for row in chollo_rows[:8]:
            print(f"  {row['catalogId']}: {row['priceEur']} € ({row['condition']})")
        if len(chollo_rows) > 8:
            print(f"  … y {len(chollo_rows) - 8} más")
        return

    payload = {
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "source": "chollogames",
        "listings": [],
        "cex": [],
        "jgo": [],
        "chollo": chollo_rows,
    }
    if args.merge and out.exists():
        existing = load_json(out, {})
        existing["chollo"] = chollo_rows
        existing["cholloCollectedAt"] = now_iso()
        payload = existing

    save_json(out, payload)
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
