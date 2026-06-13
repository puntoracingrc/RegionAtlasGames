#!/usr/bin/env python3
"""Collector Vinted ES → data/price-ingest/{platform}-vinted.json.

Búsqueda por juego (título + plataforma), orden «más recientes» y paginación al final.

  python3 scripts/collect_vinted.py --platform gamegear --limit 10 --dry-run
  python3 scripts/collect_vinted.py --platform megadrive --sync
  ./scripts/run_vinted_ingest.sh ps2 --sync
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402
from collectors.catalog_match import (  # noqa: E402
    edition_numbers_conflict,
    product_core_title,
    product_title,
    token_similarity,
)
from collectors.common import load_json, load_platforms, now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.listing_recency import search_per_game_pages  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.vinted_client import (  # noqa: E402
    VintedSession,
    build_vinted_search_query,
    fetch_game_products,
    supported_platform_slugs,
    vinted_sources_for_platform,
)
from collectors.vinted_match import is_vinted_game_product, product_to_ingest_row  # noqa: E402

PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "vinted"
REQUEST_DELAY = 0.4
MIN_TITLE_SCORE = 0.42

OTHER_PLATFORM_RE = re.compile(
    r"\b("
    r"game gear|gameboy|game boy|master system|mega cd|sega cd|"
    r"32x|dreamcast|saturn|nintendo|playstation|\bps[1-5]\b|"
    r"xbox|switch|\bnes\b|\bsnes\b|\bn64\b"
    r")\b",
    re.I,
)


def listing_matches_game(product: dict[str, Any], game: dict[str, Any], platform_slug: str) -> bool:
    title = product_title(product)
    full_text = f"{title} {product.get('description') or ''}"
    if OTHER_PLATFORM_RE.search(full_text):
        return False
    game_title = str(game.get("title") or "")
    if edition_numbers_conflict(title, game_title):
        return False
    listing_core = product_core_title(title)
    game_core = product_core_title(game_title)
    return token_similarity(game_core, listing_core) >= MIN_TITLE_SCORE


def collect_game_listings(
    game: dict[str, Any],
    platform_slug: str,
    session: VintedSession,
    *,
    ref_to_ids: dict[str, list[str]] | None,
    max_pages: int | None,
    use_cache: bool,
    delay_s: float,
) -> list[dict[str, Any]]:
    catalog_id = str(game["id"])
    catalog_region = str(game.get("region") or "")
    cache_file = CACHE_DIR / platform_slug / f"{catalog_id}.json"

    if use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        return list(cached.get("listings") or [])

    products = fetch_game_products(game, session, max_pages=max_pages, delay_s=0)
    rows: list[dict[str, Any]] = []
    for product in products:
        if not is_vinted_game_product(product):
            continue
        if not listing_matches_game(product, game, platform_slug):
            continue
        row = product_to_ingest_row(
            product,
            catalog_id,
            catalog_region,
            platform_slug,
            ref_to_ids=ref_to_ids,
            match_method="search",
            game_title=str(game.get("title") or ""),
        )
        if row:
            rows.append(row)

    if use_cache:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        save_json(
            cache_file,
            {
                "query": build_vinted_search_query(game),
                "products": len(products),
                "listings": rows,
            },
        )

    if delay_s:
        time.sleep(delay_s)
    return rows


def collect_platform(
    platform_slug: str,
    args: argparse.Namespace,
    session: VintedSession,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    if not vinted_sources_for_platform(platform_slug):
        raise SystemExit(f"Plataforma sin soporte Vinted: {platform_slug}")

    games = platform_catalog_games(platform_slug)
    if args.limit:
        games = games[: args.limit]

    _, ref_to_ids = build_platform_reference_index(platform_slug)
    search_pages = args.max_pages if args.max_pages is not None else search_per_game_pages()

    stats = {
        "games_requested": len(games),
        "games_with_listings": 0,
        "searches": 0,
        "listings": 0,
        "listings_verified": 0,
        "listings_review": 0,
    }
    all_rows: list[dict[str, Any]] = []

    for index, game in enumerate(games, start=1):
        try:
            rows = collect_game_listings(
                game,
                platform_slug,
                session,
                ref_to_ids=ref_to_ids,
                max_pages=search_pages,
                use_cache=args.use_cache,
                delay_s=0 if index == len(games) else args.delay,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  [{index}/{len(games)}] ERROR {game['title'][:40]}: {exc}")
            continue

        stats["searches"] += 1
        if rows:
            stats["games_with_listings"] += 1
            stats["listings"] += len(rows)
            all_rows.extend(rows)
        query = build_vinted_search_query(game)
        verified = sum(1 for row in rows if row.get("regionVerified") is True)
        review = len(rows) - verified
        stats["listings_verified"] += verified
        stats["listings_review"] += review
        if index <= 5 or rows:
            status = f"{len(rows)} anuncio(s)" if rows else "0 resultados"
            print(f"  [{index}/{len(games)}] «{query}» → {status}")

    return all_rows, stats


def platform_slugs_to_run(args: argparse.Namespace) -> list[str]:
    catalog_platforms = {p["slug"] for p in load_platforms().values()}
    if args.all:
        slugs = [s for s in supported_platform_slugs() if s in catalog_platforms]
        order = {p["slug"]: p.get("sortOrder", 99) for p in load_json(PLATFORMS_FILE, [])}
        return sorted(slugs, key=lambda s: order.get(s, 99))
    if not args.platform:
        raise SystemExit("Indica --platform {slug} o --all")
    if args.platform not in catalog_platforms:
        raise SystemExit(f"Plataforma desconocida: {args.platform}")
    return [args.platform]


def run_platform(platform_slug: str, args: argparse.Namespace) -> int:
    out = args.output or ROOT / "data" / "price-ingest" / f"{platform_slug}-vinted.json"

    print(f"=== Vinted ES · {platform_slug} (búsqueda por título, más recientes) ===")
    session = VintedSession()
    session.warm()
    listing_rows, stats = collect_platform(platform_slug, args, session)
    print(
        f"\n  Juegos consultados: {stats['games_requested']} · "
        f"con anuncios: {stats['games_with_listings']} · "
        f"filas ingest: {stats['listings']} · "
        f"verificados: {stats['listings_verified']} · "
        f"pendientes revisión: {stats['listings_review']}"
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
        "source": "vinted-es",
        "searchMode": "title",
        "notes": (
            "Vinted ES — búsqueda por juego (título + plataforma). "
            "Orden: más recientes. Paginación numérica al final de resultados."
        ),
        "listings": listing_rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
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
        merged = ROOT / "data" / "price-ingest" / f"{platform_slug}.json"
        ingest_input = merged if merged.exists() else out
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "sync_es_prices.py"),
                "--platform",
                platform_slug,
                "--input",
                str(ingest_input),
            ],
            check=True,
        )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Vinted ES listings (search by title)")
    parser.add_argument("--platform", help="Slug plataforma (megadrive, ps2…)")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--limit", type=int, help="Máximo juegos a consultar")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--use-cache", action="store_true")
    parser.add_argument(
        "--max-pages",
        type=int,
        help="Páginas de resultados por juego (default: ver data/ingest-recency.json)",
    )
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, help="Segundos entre búsquedas")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    slugs = platform_slugs_to_run(args)
    failures = 0
    for slug in slugs:
        try:
            if run_platform(slug, args) != 0:
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
