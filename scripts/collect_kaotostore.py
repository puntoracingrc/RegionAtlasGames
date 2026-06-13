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

from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.kaoto_client import fetch_collection_products  # noqa: E402
from collectors.kaoto_match import (  # noqa: E402
    KAOTO_PLATFORM_COLLECTIONS,
    infer_kaoto_region_product,
    pick_best_product_rows,
    product_to_ingest_row,
)
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
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


def build_kaoto_rows(
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
        source="kaotostore",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_kaoto_region_product,
        use_ai=use_ai,
        use_match_cache=use_match_cache,
        pick_best=pick_best_product_rows,
    )
    print_match_stats(stats, label="Kaoto")
    print(f"  Referencias Kaoto: {len(stats.rows)}")
    return stats.rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Kaoto Store retail references")
    parser.add_argument("--platform", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--use-cache", action="store_true")
    add_match_flags(parser)
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.platform not in KAOTO_PLATFORM_COLLECTIONS:
        known = ", ".join(sorted(KAOTO_PLATFORM_COLLECTIONS))
        raise SystemExit(f"Plataforma no soportada: {args.platform}. Opciones: {known}")

    out = args.output or ROOT / "data" / "price-ingest" / f"{args.platform}-kaoto.json"

    print(f"=== Kaoto Store · {args.platform} ===")
    products = collect_platform(args.platform, use_cache=args.use_cache)
    kaoto_rows = build_kaoto_rows(args.platform, products, **match_kwargs(args))

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
