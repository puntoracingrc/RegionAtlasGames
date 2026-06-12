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

from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.jgo_client import fetch_products_for_categories  # noqa: E402
from collectors.jgo_match import (  # noqa: E402
    JGO_PLATFORM_CATEGORIES,
    best_catalog_match,
    pick_best_product_rows,
    product_to_ingest_row,
)
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


def build_jgo_rows(platform_slug: str, products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog = load_catalog()
    platform_games = [g for g in catalog if g.get("platformSlug") == platform_slug]
    _, ref_to_ids = build_platform_reference_index(platform_slug)
    grouped: dict[str, list[dict[str, Any]]] = {}
    unmatched = 0
    matched_by_ref = 0

    for product in products:
        game, matched_ref = best_catalog_match(
            product,
            platform_games,
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
    print(f"  Productos JGO: {len(products)}")
    print(f"  Sin match catálogo: {unmatched}")
    print(f"  Match por referencia: {matched_by_ref}")
    print(f"  Referencias JGO: {len(rows)}")
    return rows


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
    parser.add_argument("--sync", action="store_true", help="Ejecutar sync_es_prices.py tras generar ingest")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.platform not in JGO_PLATFORM_CATEGORIES:
        known = ", ".join(sorted(JGO_PLATFORM_CATEGORIES))
        raise SystemExit(f"Plataforma no soportada: {args.platform}. Opciones: {known}")

    out = args.output or ROOT / "data" / "price-ingest" / f"{args.platform}-jgo.json"

    print(f"=== Japan Game Online · {args.platform} ===")
    products = collect_platform(args.platform, use_cache=args.use_cache)
    jgo_rows = build_jgo_rows(args.platform, products)

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
