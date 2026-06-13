#!/usr/bin/env python3
"""Referencias retail CeX ES (Algolia) → data/price-ingest/{platform}-cex.json.

  python3 scripts/collect_cex.py --platform saturn --dry-run
  python3 scripts/collect_cex.py --platform ps2 --max-pages 2
  ./scripts/run_cex_ingest.sh saturn --sync

Disambiguación IA (solo matches ambiguos): export OPENAI_API_KEY=...
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.cex_client import (  # noqa: E402
    cex_sources_for_platform,
    fetch_platform_products,
    fetch_prelogin_settings,
    supported_platform_slugs,
)
from collectors.cex_match import (  # noqa: E402
    infer_cex_region,
    is_cex_game_product,
    pick_best_cex_rows,
    product_to_ingest_row,
)
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "cex"
SETTINGS_CACHE = CACHE_DIR / "appsettings.json"


def load_catalog() -> list[dict[str, Any]]:
    return load_json(CATALOG_FILE, [])


def load_settings(*, use_cache: bool) -> dict[str, Any]:
    if use_cache and SETTINGS_CACHE.exists():
        cached = load_json(SETTINGS_CACHE, {})
        if cached.get("algoliaAppId") and cached.get("algoliaSearchAppKey"):
            return cached
    settings = fetch_prelogin_settings()
    save_json(SETTINGS_CACHE, settings)
    return settings


def collect_platform(
    platform_slug: str,
    *,
    use_cache: bool,
    max_pages: int | None,
    settings: dict[str, Any],
) -> list[dict[str, Any]]:
    cache_file = CACHE_DIR / f"{platform_slug}.json"
    if use_cache and cache_file.exists():
        return load_json(cache_file, [])

    products = fetch_platform_products(platform_slug, settings=settings, max_pages=max_pages)
    save_json(cache_file, products)
    return products


def build_cex_rows(
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
        row = product_to_ingest_row(
            product,
            str(game["id"]),
            catalog_region=str(game.get("region") or ""),
            **match_row_kwargs(result),
        )
        return row if row else None

    stats = run_match_pipeline(
        products,
        platform_games,
        platform_slug,
        source="cex",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_cex_region,
        is_valid_product=is_cex_game_product,
        use_ai=use_ai,
        use_match_cache=use_match_cache,
        pick_best=pick_best_cex_rows,
    )
    print_match_stats(stats, label="CeX")
    print(f"  Referencias CeX: {len(stats.rows)}")
    return stats.rows


def platform_slugs_to_run(args: argparse.Namespace) -> list[str]:
    catalog_platforms = {p["slug"] for p in load_json(PLATFORMS_FILE, [])}
    if args.all:
        slugs = [s for s in supported_platform_slugs() if s in catalog_platforms]
        order = {p["slug"]: p.get("sortOrder", 99) for p in load_json(PLATFORMS_FILE, [])}
        return sorted(slugs, key=lambda s: order.get(s, 99))
    if not args.platform:
        raise SystemExit("Indica --platform {slug} o --all")
    if args.platform not in supported_platform_slugs():
        known = ", ".join(supported_platform_slugs())
        raise SystemExit(f"Plataforma no soportada: {args.platform}. Opciones: {known}")
    return [args.platform]


def run_platform(platform_slug: str, args: argparse.Namespace, settings: dict[str, Any]) -> int:
    out = args.output or ROOT / "data" / "price-ingest" / f"{platform_slug}-cex.json"

    if not cex_sources_for_platform(platform_slug):
        raise SystemExit(f"Plataforma sin categoría CeX: {platform_slug}")

    print(f"=== CeX · {platform_slug} ===")
    products = collect_platform(
        platform_slug,
        use_cache=args.use_cache,
        max_pages=args.max_pages,
        settings=settings,
    )
    cex_rows = build_cex_rows(
        platform_slug,
        products,
        **match_kwargs(args),
    )

    if args.dry_run:
        for row in cex_rows[:8]:
            sell = row.get("sellPriceEur")
            cash = row.get("cashPriceEur")
            method = row.get("matchMethod", "?")
            score = row.get("matchScore")
            score_txt = f" score={score}" if score is not None else ""
            print(
                f"  [{method}{score_txt}] {row['catalogId']}: venta {sell} € · cash {cash} € — "
                f"{row.get('title', '')[:45]}"
            )
        if len(cex_rows) > 8:
            print(f"  … y {len(cex_rows) - 8} más")
        return 0

    payload = {
        "platformSlug": platform_slug,
        "collectedAt": now_iso(),
        "source": "cex",
        "listings": [],
        "cex": cex_rows,
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
    }
    if args.merge and out.exists():
        existing = load_json(out, {})
        existing["cex"] = cex_rows
        existing["cexCollectedAt"] = now_iso()
        payload = existing

    save_json(out, payload)
    print(f"  Guardado: {out}")

    if args.sync:
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "sync_es_prices.py"),
                "--platform",
                platform_slug,
                "--input",
                str(out),
            ],
            check=True,
        )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect CeX retail references")
    parser.add_argument("--platform")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--use-cache", action="store_true")
    add_match_flags(parser)
    parser.add_argument("--max-pages", type=int, help="Limitar páginas Algolia por categoría")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    settings = load_settings(use_cache=not args.dry_run)
    slugs = platform_slugs_to_run(args)
    failures = 0
    for slug in slugs:
        try:
            if run_platform(slug, args, settings) != 0:
                failures += 1
        except subprocess.CalledProcessError:
            failures += 1
            print(f"  ERROR sync en {slug}")
        except SystemExit as exc:
            failures += 1
            print(f"  ERROR {slug}: {exc}")

    if failures:
        raise SystemExit(f"Completado con {failures} error(es) en {len(slugs)} plataforma(s).")


if __name__ == "__main__":
    main()
