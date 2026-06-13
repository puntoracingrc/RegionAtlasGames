#!/usr/bin/env python3
"""Collector Wallapop ES → data/price-ingest/{platform}-wallapop.json.

Replica la búsqueda web:
  Tecnología → Gaming: consolas y videojuegos → Videojuegos y más → Videojuegos
  Orden: más recientes · Filtro: últimos 30 días · Query: título + plataforma
  Ej.: «Sonic the Hedgehog megadrive»

  python3 scripts/collect_wallapop.py --platform megadrive --limit 10 --dry-run
  python3 scripts/collect_wallapop.py --platform dreamcast
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
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import load_json, load_platforms, now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.listing_recency import (  # noqa: E402
    max_listing_age_days,
    wallapop_listing_age_days,
    wallapop_per_game_pages,
    wallapop_time_filter,
)
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.wallapop_client import (  # noqa: E402
    build_wallapop_query,
    fetch_game_products,
    supported_platform_slugs,
    wallapop_game_limit,
    wallapop_order_by,
    wallapop_sources_for_platform,
)
from collectors.wallapop_listing_ai import (
    ai_available,
    classify_products_for_game,
    passes_listing_ai,
    result_key,
)
from collectors.wallapop_match import is_wallapop_game_product, product_to_ingest_row  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "wallapop"
REQUEST_DELAY = 0.35
MIN_TITLE_SCORE = 0.42


# Otras consolas en el título → descartar al buscar un juego concreto
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
    *,
    ref_to_ids: dict[str, list[str]] | None,
    max_pages: int | None,
    use_cache: bool,
    use_listing_ai: bool,
    use_listing_ai_cache: bool,
    delay_s: float,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    catalog_id = str(game["id"])
    cache_file = CACHE_DIR / platform_slug / f"{catalog_id}.json"
    game_stats = {
        "ai_cache_hits": 0,
        "ai_batches": 0,
        "ai_rejected": 0,
        "ai_regex_rejected": 0,
    }

    if use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        return list(cached.get("listings") or []), game_stats

    products = fetch_game_products(game, max_pages=max_pages, delay_s=delay_s)
    matched = [
        product
        for product in products
        if listing_matches_game(product, game, platform_slug)
    ]

    ai_by_key: dict[str, Any] = {}
    if use_listing_ai and ai_available() and matched:
        ai_by_key, ai_stats = classify_products_for_game(
            matched,
            game,
            platform_slug,
            use_cache=use_listing_ai_cache,
        )
        game_stats.update(ai_stats)

    rows: list[dict[str, Any]] = []
    catalog_region = str(game.get("region") or "")
    for product in matched:
        ai_result = ai_by_key.get(result_key(product))
        if use_listing_ai and ai_available():
            if not ai_result or not passes_listing_ai(ai_result, catalog_region=catalog_region):
                game_stats["ai_rejected"] += 1
                continue
        elif not is_wallapop_game_product(product):
            continue

        row = product_to_ingest_row(
            product,
            catalog_id,
            catalog_region,
            platform_slug,
            ref_to_ids=ref_to_ids,
            match_method="search",
            match_score=round(
                token_similarity(str(game.get("title") or ""), product_title(product)),
                3,
            ),
            listing_ai=ai_result,
        )
        if row:
            rows.append(row)

    if use_cache:
        save_json(cache_file, {"query": build_wallapop_query(game), "listings": rows})
    return rows, game_stats


def collect_platform(
    platform_slug: str,
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    if not wallapop_sources_for_platform(platform_slug):
        raise SystemExit(f"Plataforma no soportada: {platform_slug}")

    platform = load_platforms().get(platform_slug)
    games = platform_catalog_games(platform_slug)[: args.limit]
    _, ref_to_ids = build_platform_reference_index(platform_slug)

    stats = {
        "games_requested": len(games),
        "games_with_listings": 0,
        "listings": 0,
        "listings_verified": 0,
        "listings_review": 0,
        "api_calls": 0,
        "ai_cache_hits": 0,
        "ai_batches": 0,
        "ai_rejected": 0,
        "ai_regex_rejected": 0,
    }
    all_rows: list[dict[str, Any]] = []
    per_game_pages = args.max_pages if args.max_pages is not None else wallapop_per_game_pages()
    match_opts = match_kwargs(args)
    use_listing_ai = match_opts["use_ai"]
    use_listing_ai_cache = match_opts["use_match_cache"]

    for index, game in enumerate(games, start=1):
        try:
            rows, game_stats = collect_game_listings(
                game,
                platform_slug,
                ref_to_ids=ref_to_ids,
                max_pages=per_game_pages,
                use_cache=args.use_cache,
                use_listing_ai=use_listing_ai,
                use_listing_ai_cache=use_listing_ai_cache,
                delay_s=args.delay,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  [{index}/{len(games)}] ERROR {game['title'][:40]}: {exc}")
            continue

        stats["api_calls"] += 1
        stats["ai_cache_hits"] += game_stats.get("ai_cache_hits", 0)
        stats["ai_batches"] += game_stats.get("ai_batches", 0)
        stats["ai_rejected"] += game_stats.get("ai_rejected", 0)
        stats["ai_regex_rejected"] += game_stats.get("ai_regex_rejected", 0)
        if rows:
            stats["games_with_listings"] += 1
            stats["listings"] += len(rows)
            verified = sum(1 for r in rows if r.get("regionVerified") is True)
            review = sum(1 for r in rows if r.get("regionReviewNeeded"))
            stats["listings_verified"] += verified
            stats["listings_review"] += review
            all_rows.extend(rows)
            print(
                f"  [{index}/{len(games)}] {game['title'][:40]} → +{len(rows)} "
                f"(verificados {verified}, revisar {review}) "
                f"({build_wallapop_query(game)})"
            )
        elif args.verbose:
            print(
                f"  [{index}/{len(games)}] {game['title'][:40]} → 0 "
                f"({build_wallapop_query(game)})"
            )

        if index < len(games):
            time.sleep(args.delay)

    return all_rows, stats


def run_platform(platform_slug: str, args: argparse.Namespace) -> int:
    out = args.output or ROOT / "data" / "price-ingest" / f"{platform_slug}-wallapop.json"

    print(f"=== Wallapop · {platform_slug} ===")
    listing_ai_on = match_kwargs(args)["use_ai"] and ai_available()
    print(
        f"  Modo web: cat. videojuegos · orden {wallapop_order_by()} · "
        f"últimos {wallapop_listing_age_days()} días ({wallapop_time_filter()}) · "
        f"paginación {'completa (hasta sin cargar más)' if wallapop_per_game_pages() is None else wallapop_per_game_pages()} · "
        f"límite {args.limit} juegos · "
        f"IA anuncios {'on' if listing_ai_on else 'off (--no-ai o sin OPENAI_API_KEY)'}"
    )

    listing_rows, stats = collect_platform(platform_slug, args)
    print(
        f"\n  Juegos consultados: {stats['games_requested']} · "
        f"con anuncios: {stats['games_with_listings']} · "
        f"filas ingest: {stats['listings']} · "
        f"verificados: {stats['listings_verified']} · "
        f"pendientes revisión: {stats['listings_review']}"
    )
    if listing_ai_on:
        print(
            f"  IA: {stats['ai_batches']} lotes · "
            f"{stats['ai_cache_hits']} cache · "
            f"{stats['ai_regex_rejected']} regex · "
            f"{stats['ai_rejected']} rechazados IA"
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
        "source": "wallapop",
        "notes": (
            "Wallapop ES — búsqueda por juego (título + plataforma, categoría videojuegos). "
            "Filtrado IA por anuncio con caché en data/price-ingest/cache/wallapop-listing-ai/ "
            "(re-analiza si cambia título o precio). Desactivar: --no-ai."
        ),
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Wallapop P2P listings (por juego)")
    parser.add_argument("--platform", help="Slug plataforma (megadrive, ps2…)")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--limit", type=int, default=wallapop_game_limit(), help="Máximo juegos a consultar")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge", action="store_true")
    parser.add_argument("--use-cache", action="store_true")
    add_match_flags(parser)
    parser.add_argument(
        "--max-pages",
        type=int,
        help="Tope opcional de páginas por juego (default: todas hasta que no haya «Cargar más»)",
    )
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    _ = match_kwargs(args)

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
