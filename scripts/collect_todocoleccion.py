#!/usr/bin/env python3
"""Collector TodoColeccion ES → data/price-ingest/{platform}-todocoleccion.json.

Barrido por categoría de plataforma (JSON-LD). Los lotes entran en la mediana P2P.

  python3 scripts/collect_todocoleccion.py --platform saturn --dry-run
  python3 scripts/collect_todocoleccion.py --all
  ./scripts/run_todocoleccion_ingest.sh all --sync
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402
from collectors.common import load_json, load_platforms, now_iso, save_json  # noqa: E402
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.listing_recency import max_listing_age_days, tc_max_pages  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.tc_client import (  # noqa: E402
    fetch_platform_products,
    supported_platform_slugs,
    tc_sources_for_platform,
)
from collectors.tc_match import (  # noqa: E402
    infer_tc_region_product,
    is_tc_game_product,
    product_to_ingest_row,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "todocoleccion"


def load_catalog() -> list[dict[str, Any]]:
    return load_json(CATALOG_FILE, [])


def collect_platform(
    platform_slug: str,
    *,
    use_cache: bool,
    max_pages: int | None,
) -> list[dict[str, Any]]:
    cache_file = CACHE_DIR / f"{platform_slug}.json"
    if not tc_sources_for_platform(platform_slug):
        raise SystemExit(f"Plataforma sin fuente TodoColeccion: {platform_slug}")

    if use_cache and cache_file.exists():
        return load_json(cache_file, [])

    products = fetch_platform_products(platform_slug, max_pages=max_pages)
    for product in products:
        product["platformSlug"] = platform_slug
    save_json(cache_file, products)
    return products


def build_listing_rows(
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
        return product_to_ingest_row(
            product,
            str(game["id"]),
            str(game.get("region") or ""),
            platform_slug,
            ref_to_ids=ref_to_ids,
            **match_row_kwargs(result),
        )

    stats = run_match_pipeline(
        products,
        platform_games,
        platform_slug,
        source="todocoleccion",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_tc_region_product,
        is_valid_product=is_tc_game_product,
        use_ai=use_ai,
        use_match_cache=use_match_cache,
    )
    print_match_stats(stats, label="TodoColeccion")
    games_with_data = len({r["catalogId"] for r in stats.rows})
    print(f"  Anuncios ingest: {len(stats.rows)}")
    print(f"  Juegos únicos: {games_with_data}")
    return stats.rows


def run_platform(
    platform_slug: str,
    args: argparse.Namespace,
) -> int:
    out = args.output or ROOT / "data" / "price-ingest" / f"{platform_slug}-todocoleccion.json"

    print(f"=== TodoColeccion · {platform_slug} ===")
    print(
        f"  Recencia: últimos {max_listing_age_days()} días · "
        f"máx. {tc_max_pages() or '∞'} páginas/categoría"
    )
    products = collect_platform(
        platform_slug,
        use_cache=args.use_cache,
        max_pages=args.max_pages,
    )
    listing_rows = build_listing_rows(platform_slug, products, **match_kwargs(args))

    if args.dry_run:
        for row in listing_rows[:10]:
            print(f"  {row['catalogId']}: {row['priceEur']} € — {row.get('title', '')[:50]}")
        if len(listing_rows) > 10:
            print(f"  … y {len(listing_rows) - 10} más")
        return 0

    payload = {
        "platformSlug": platform_slug,
        "collectedAt": now_iso(),
        "source": "todocoleccion",
        "notes": "TodoColeccion ES — lotes activos por categoría; región inferida del título.",
        "listings": listing_rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
    }
    if args.merge and out.exists():
        existing = load_json(out, {})
        existing["listings"] = listing_rows
        existing["collectedAt"] = now_iso()
        payload = existing

    save_json(out, payload)
    print(f"  Guardado: {out}")

    code = validate_ingest(out)
    if code != 0:
        return code

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


def platform_slugs_to_run(args: argparse.Namespace) -> list[str]:
    catalog_platforms = {p["slug"] for p in load_platforms().values()}
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect TodoColeccion P2P listings")
    parser.add_argument("--platform", help="Slug plataforma (saturn, ps2, n64…)")
    parser.add_argument("--all", action="store_true", help="Todas las plataformas con fuente TC")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--use-cache", action="store_true")
    add_match_flags(parser)
    parser.add_argument("--max-pages", type=int, help="Limitar páginas por fuente (debug)")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    slugs = platform_slugs_to_run(args)
    failures = 0
    for slug in slugs:
        try:
            code = run_platform(slug, args)
            if code != 0:
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
