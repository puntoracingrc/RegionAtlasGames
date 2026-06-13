#!/usr/bin/env python3
"""Collector TodoColeccion ES → data/price-ingest/{platform}-todocoleccion.json.

Búsqueda avanzada por juego (título + plataforma, paginación).
Si TodoColeccion no tiene el juego, 0 resultados → siguiente.

  python3 scripts/collect_todocoleccion.py --platform gamegear --limit 5 --dry-run
  python3 scripts/collect_todocoleccion.py --all
  ./scripts/run_todocoleccion_ingest.sh saturn --sync
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import load_json, load_platforms, now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.match_pipeline import run_match_pipeline  # noqa: E402
from collectors.listing_recency import search_per_game_pages  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.tc_client import (  # noqa: E402
    build_tc_search_query,
    fetch_game_products,
    supported_platform_slugs,
    tc_sources_for_platform,
)
from collectors.tc_match import (  # noqa: E402
    infer_tc_region_product,
    is_tc_game_product,
    product_to_ingest_row,
)

PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "todocoleccion"
REQUEST_DELAY = 0.45


def collect_game_rows(
    game: dict[str, Any],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]],
    max_pages: int | None,
    use_cache: bool,
    use_ai: bool,
    use_match_cache: bool,
) -> list[dict[str, Any]]:
    catalog_id = str(game["id"])
    cache_file = CACHE_DIR / platform_slug / f"{catalog_id}.json"

    if use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        return list(cached.get("listings") or [])

    products = fetch_game_products(game, max_pages=max_pages, delay_s=0)
    if not products:
        if use_cache:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            save_json(
                cache_file,
                {"query": build_tc_search_query(game), "listings": [], "products": 0},
            )
        return []

    def row_builder(product: dict[str, Any], matched_game: dict[str, Any], result) -> dict[str, Any] | None:
        row = product_to_ingest_row(
            product,
            str(matched_game["id"]),
            str(matched_game.get("region") or ""),
            platform_slug,
            ref_to_ids=ref_to_ids,
            **match_row_kwargs(result),
        )
        if not row:
            return None
        row["matchMethod"] = "search"
        return row

    stats = run_match_pipeline(
        products,
        [game],
        platform_slug,
        source="todocoleccion",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_tc_region_product,
        is_valid_product=is_tc_game_product,
        use_ai=use_ai,
        use_match_cache=use_match_cache,
    )

    if use_cache:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        save_json(
            cache_file,
            {
                "query": build_tc_search_query(game),
                "products": len(products),
                "listings": stats.rows,
            },
        )

    return stats.rows


def collect_platform(
    platform_slug: str,
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    if not tc_sources_for_platform(platform_slug):
        raise SystemExit(f"Plataforma sin soporte TodoColeccion: {platform_slug}")

    games = platform_catalog_games(platform_slug)
    if args.limit:
        games = games[: args.limit]

    _, ref_to_ids = build_platform_reference_index(platform_slug)
    match_opts = match_kwargs(args)

    stats = {
        "games_requested": len(games),
        "games_with_rows": 0,
        "searches": 0,
        "rows": 0,
    }
    all_rows: list[dict[str, Any]] = []
    search_pages = args.max_pages if args.max_pages is not None else search_per_game_pages()

    for index, game in enumerate(games, start=1):
        try:
            rows = collect_game_rows(
                game,
                platform_slug,
                ref_to_ids=ref_to_ids,
                max_pages=search_pages,
                use_cache=args.use_cache,
                **match_opts,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  [{index}/{len(games)}] ERROR {game['title'][:40]}: {exc}")
            continue

        stats["searches"] += 1
        if rows:
            stats["games_with_rows"] += 1
            stats["rows"] += len(rows)
            all_rows.extend(rows)
        query = build_tc_search_query(game)
        if index <= 5 or rows:
            status = f"{len(rows)} anuncio(s)" if rows else "0 resultados"
            print(f"  [{index}/{len(games)}] «{query}» → {status}")

        if index < len(games):
            time.sleep(args.delay)

    return all_rows, stats


def run_platform(platform_slug: str, args: argparse.Namespace) -> int:
    out = args.output or ROOT / "data" / "price-ingest" / f"{platform_slug}-todocoleccion.json"

    print(f"=== TodoColeccion · {platform_slug} (búsqueda avanzada por título) ===")
    listing_rows, stats = collect_platform(platform_slug, args)
    print(
        f"  Búsquedas: {stats['searches']} · "
        f"Con anuncio: {stats['games_with_rows']} · "
        f"Filas ingest: {stats['rows']}"
    )

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
        "searchMode": "advanced_title",
        "notes": "TodoColeccion ES — búsqueda avanzada (Juguetes → Videojuegos y Consolas, frase exacta).",
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
        existing["searchMode"] = "advanced_title"
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
    parser = argparse.ArgumentParser(description="Collect TodoColeccion P2P listings (advanced search by title)")
    parser.add_argument("--platform", help="Slug plataforma (saturn, ps2, n64…)")
    parser.add_argument("--all", action="store_true", help="Todas las plataformas con fuente TC")
    parser.add_argument("--limit", type=int, help="Máximo juegos a buscar")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--use-cache", action="store_true")
    add_match_flags(parser)
    parser.add_argument(
        "--max-pages",
        type=int,
        help="Páginas de búsqueda por juego (default: todas hasta vacío, ver data/ingest-recency.json)",
    )
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, help="Segundos entre búsquedas")
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
