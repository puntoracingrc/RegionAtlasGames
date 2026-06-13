#!/usr/bin/env python3
"""Ingest de referencias retail desde japangameonline.com (WooCommerce API).

Genera filas `jgo` en data/price-ingest/{plataforma}-jgo.json para sync_es_prices.py.

  python3 scripts/collect_japangameonline.py --platform saturn --dry-run
  python3 scripts/collect_japangameonline.py --platform saturn --merge --output data/price-ingest/saturn.json
  python3 scripts/collect_japangameonline.py --platform snes --sync
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.jgo_client import fetch_products_for_categories  # noqa: E402
from collectors.jgo_match import (  # noqa: E402
    JGO_PLATFORM_CATEGORIES,
    infer_jgo_region_product,
    is_game_product,
    pick_best_product_rows,
    product_to_ingest_row,
)
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "jgo"


def load_catalog() -> list[dict[str, Any]]:
    return load_json(CATALOG_FILE, [])


def collect_platform(platform_slug: str, *, use_cache: bool) -> list[dict[str, Any]]:
    cache_file = CACHE_DIR / f"{platform_slug}.json"
    categories = JGO_PLATFORM_CATEGORIES.get(platform_slug)
    if not categories:
        raise SystemExit(f"Plataforma sin categorías JGO: {platform_slug}")

    if use_cache and cache_file.exists():
        return load_json(cache_file, [])

    products = fetch_products_for_categories(categories)
    save_json(cache_file, products)
    return products


def build_jgo_rows(
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
        return product_to_ingest_row(product, str(game["id"]), **match_row_kwargs(result))

    stats = run_match_pipeline(
        products,
        platform_games,
        platform_slug,
        source="japangameonline",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_jgo_region_product,
        is_valid_product=is_game_product,
        use_ai=use_ai,
        use_match_cache=use_match_cache,
        pick_best=pick_best_product_rows,
    )
    print_match_stats(stats, label="JGO")
    print(f"  Referencias JGO: {len(stats.rows)}")
    return stats.rows


def merge_jgo_into(path: Path, jgo_rows: list[dict[str, Any]], platform_slug: str) -> None:
    if path.exists():
        ingest = load_json(path, {})
    else:
        ingest = {
            "platformSlug": platform_slug,
            "collectedAt": now_iso(),
            "listings": [],
            "cex": [],
            "jgo": [],
        }
    ingest["platformSlug"] = platform_slug
    ingest["jgoCollectedAt"] = now_iso()
    ingest["jgo"] = jgo_rows
    save_json(path, ingest)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Japan Game Online retail references")
    parser.add_argument("--platform", required=True, help="Slug plataforma (saturn, snes, …)")
    parser.add_argument("--output", type=Path, help="JSON de salida (default: data/price-ingest/{platform}-jgo.json)")
    parser.add_argument("--merge", action="store_true", help="Fusionar jgo en --output existente")
    parser.add_argument("--use-cache", action="store_true", help="Usar cache local de productos JGO")
    add_match_flags(parser)
    parser.add_argument("--sync", action="store_true", help="Ejecutar sync_es_prices.py tras generar ingest")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.platform not in JGO_PLATFORM_CATEGORIES:
        known = ", ".join(sorted(JGO_PLATFORM_CATEGORIES))
        raise SystemExit(f"Plataforma no soportada: {args.platform}. Opciones: {known}")

    out = args.output or ROOT / "data" / "price-ingest" / f"{args.platform}-jgo.json"

    print(f"=== Japan Game Online · {args.platform} ===")
    products = collect_platform(args.platform, use_cache=args.use_cache)
    jgo_rows = build_jgo_rows(args.platform, products, **match_kwargs(args))

    if args.dry_run:
        for row in jgo_rows[:8]:
            print(f"  {row['catalogId']}: {row['priceEur']} € ({row['condition']})")
        if len(jgo_rows) > 8:
            print(f"  … y {len(jgo_rows) - 8} más")
        return

    if args.merge:
        merge_jgo_into(out, jgo_rows, args.platform)
    else:
        save_json(
            out,
            {
                "platformSlug": args.platform,
                "collectedAt": now_iso(),
                "source": "japangameonline",
                "listings": [],
                "cex": [],
                "jgo": jgo_rows,
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
