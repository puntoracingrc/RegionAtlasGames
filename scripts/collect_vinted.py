#!/usr/bin/env python3
"""Collector Vinted ES → data/price-ingest/{platform}-vinted.json.

Búsqueda por juego (título + plataforma), orden «más recientes» y paginación al final.

  python3 scripts/collect_vinted.py --platform gamegear --limit 10 --dry-run
  python3 scripts/collect_vinted.py --platform megadrive --sync
  ./scripts/run_vinted_ingest.sh ps2 --sync
"""

from __future__ import annotations

import argparse
import os
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
from collectors.cache_policy import attach_policy_version, cache_policy_matches  # noqa: E402
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import load_json, load_platforms, now_iso, platform_catalog_games, platform_search_keyword, prioritize_catalog_games, save_json  # noqa: E402
from collectors.listing_recency import search_per_game_pages  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.vinted_client import (  # noqa: E402
    VintedRateLimitError,
    VintedSession,
    build_vinted_search_query,
    fetch_game_products,
    fetch_search_products,
    supported_platform_slugs,
    vinted_sources_for_platform,
)
from collectors.vinted_match import infer_vinted_region_product, is_vinted_game_product, product_to_ingest_row  # noqa: E402

PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "vinted"
MIN_TITLE_SCORE = 0.42


def request_delay_default() -> float:
    raw = os.environ.get("VINTED_REQUEST_DELAY_SEC", "2.5")
    try:
        return max(0.4, float(raw))
    except ValueError:
        return 2.5

PLATFORM_ALIAS_GROUPS: dict[str, set[str]] = {
    "nes": {"nintendo", "nes"},
    "snes": {"nintendo", "snes", "super nintendo"},
    "n64": {"nintendo", "n64", "nintendo 64"},
    "gameboy": {"nintendo", "gameboy", "game boy"},
    "gamecube": {"nintendo", "gamecube"},
    "wii": {"nintendo", "wii"},
    "ds": {"nintendo", "ds", "nintendo ds"},
    "3ds": {"nintendo", "3ds", "nintendo 3ds"},
    "mastersystem": {"master system", "sega"},
    "megadrive": {"megadrive", "mega drive", "genesis", "sega"},
    "sega32x": {"32x", "sega"},
    "megacd": {"mega cd", "sega cd", "sega"},
    "saturn": {"saturn", "sega"},
    "dreamcast": {"dreamcast", "sega"},
    "gamegear": {"game gear", "sega"},
    "neogeo": {"neo geo", "neogeo", "aes"},
    "neogeocd": {"neo geo cd", "neogeo cd"},
    "neogeopocket": {"neo geo pocket", "neogeo pocket", "ngp", "ngpc"},
    "ps1": {"playstation", "ps1", "psx"},
    "ps2": {"playstation", "ps2"},
    "ps3": {"playstation", "ps3"},
    "ps4": {"playstation", "ps4"},
}

PLATFORM_TERM_RE = re.compile(
    r"\b("
    r"neo geo pocket|neogeo pocket|neo geo cd|neogeo cd|neo geo|neogeo|"
    r"game gear|gameboy|game boy|master system|mega drive|megadrive|mega cd|sega cd|"
    r"super nintendo|nintendo 64|nintendo ds|nintendo 3ds|"
    r"32x|dreamcast|saturn|nintendo|playstation|psx|\bps[1-5]\b|"
    r"xbox|switch|gamecube|wii|3ds|ds|\bnes\b|\bsnes\b|\bn64\b"
    r")\b",
    re.I,
)


def mentions_other_platform(text: str, platform_slug: str) -> bool:
    allowed = PLATFORM_ALIAS_GROUPS.get(platform_slug, {platform_slug})
    for match in PLATFORM_TERM_RE.finditer(text):
        term = match.group(1).lower().strip()
        if term not in allowed:
            return True
    return False


def listing_matches_game(product: dict[str, Any], game: dict[str, Any], platform_slug: str) -> bool:
    title = product_title(product)
    full_text = f"{title} {product.get('description') or ''}"
    if mentions_other_platform(full_text, platform_slug):
        return False
    game_title = str(game.get("title") or "")
    if edition_numbers_conflict(title, game_title):
        return False
    listing_core = product_core_title(title)
    game_core = product_core_title(game_title)
    return token_similarity(game_core, listing_core) >= MIN_TITLE_SCORE


def default_sweep_queries(platform_slug: str) -> list[str]:
    keyword = platform_search_keyword(platform_slug)
    aliases = PLATFORM_ALIAS_GROUPS.get(platform_slug, {keyword})
    preferred = [keyword, *sorted(a for a in aliases if a != keyword)]
    queries: list[str] = []
    for alias in preferred[:3]:
        queries.append(f"{alias} juego")
        queries.append(f"{alias} videojuegos")
    return list(dict.fromkeys(q.strip() for q in queries if q.strip()))


def collect_platform_sweep(
    platform_slug: str,
    args: argparse.Namespace,
    session: VintedSession,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    platform_games = platform_catalog_games(platform_slug)
    _, ref_to_ids = build_platform_reference_index(platform_slug)
    queries = [args.sweep_query] if args.sweep_query else default_sweep_queries(platform_slug)
    cache_file = CACHE_DIR / platform_slug / "_platform-sweep.json"
    match_opts = match_kwargs(args)

    products: list[dict[str, Any]] | None = None
    if args.use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        if cache_policy_matches(cached):
            products = list(cached.get("products") or [])
            queries = list(cached.get("queries") or queries)
    if products is None:
        seen: set[str] = set()
        products = []
        rate_limited = False
        stopped_at = 0
        for index, query in enumerate(queries, start=1):
            try:
                fetched = fetch_search_products(
                    query,
                    session,
                    max_pages=args.sweep_pages if args.sweep_pages is not None else args.max_pages,
                    delay_s=args.delay,
                )
            except VintedRateLimitError as exc:
                suffix = f" Retry-After: {exc.retry_after}" if exc.retry_after else ""
                print(f"  Sweep [{index}/{len(queries)}] RATE LIMIT «{query}»: {exc}.{suffix}")
                rate_limited = True
                stopped_at = index
                break
            accepted = []
            for product in fetched:
                full_text = f"{product_title(product)} {product.get('description') or ''}"
                key = str(product.get("externalId") or product.get("productUrl") or "")
                if not key or key in seen:
                    continue
                if mentions_other_platform(full_text, platform_slug):
                    continue
                if not is_vinted_game_product(product):
                    continue
                seen.add(key)
                accepted.append(product)
            products.extend(accepted)
            print(f"  Sweep [{index}/{len(queries)}] «{query}» → {len(accepted)} candidatos")
            if index < len(queries):
                time.sleep(args.delay)
        if args.use_cache:
            save_json(cache_file, attach_policy_version({
                "queries": queries,
                "products": products,
                "rateLimited": rate_limited,
                "stoppedAt": stopped_at or None,
            }))
    else:
        rate_limited = bool(cached.get("rateLimited")) if "cached" in locals() else False
        stopped_at = int(cached.get("stoppedAt") or 0) if "cached" in locals() else 0

    def row_builder(product: dict[str, Any], matched_game: dict[str, Any], result) -> dict[str, Any] | None:
        row = product_to_ingest_row(
            product,
            str(matched_game["id"]),
            str(matched_game.get("region") or ""),
            platform_slug,
            ref_to_ids=ref_to_ids,
            game_title=str(matched_game.get("title") or ""),
            **match_row_kwargs(result),
        )
        return row if row else None

    stats_match = run_match_pipeline(
        products,
        platform_games,
        platform_slug,
        source="vinted-es",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_vinted_region_product,
        is_valid_product=is_vinted_game_product,
        use_ai=match_opts["use_ai"],
        use_match_cache=match_opts["use_match_cache"],
    )
    print_match_stats(stats_match, label="Vinted sweep")

    stats = {
        "games_requested": len(platform_games),
        "games_with_listings": len({row.get("catalogId") for row in stats_match.rows}),
        "searches": len(queries),
        "listings": len(stats_match.rows),
        "listings_verified": sum(1 for row in stats_match.rows if row.get("regionVerified") is True),
        "listings_review": sum(1 for row in stats_match.rows if row.get("regionReviewNeeded")),
        "rate_limited": int(rate_limited),
        "stopped_at": stopped_at,
    }
    return stats_match.rows, stats


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
        if cache_policy_matches(cached):
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
            attach_policy_version({
                "query": build_vinted_search_query(game),
                "products": len(products),
                "listings": rows,
            }),
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

    games = prioritize_catalog_games(platform_catalog_games(platform_slug), args.limit)

    _, ref_to_ids = build_platform_reference_index(platform_slug)
    search_pages = args.max_pages if args.max_pages is not None else search_per_game_pages()

    stats = {
        "games_requested": len(games),
        "games_with_listings": 0,
        "searches": 0,
        "listings": 0,
        "listings_verified": 0,
        "listings_review": 0,
        "rate_limited": 0,
        "stopped_at": 0,
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
        except VintedRateLimitError as exc:
            stats["rate_limited"] = 1
            stats["stopped_at"] = index
            suffix = f" Retry-After: {exc.retry_after}" if exc.retry_after else ""
            print(f"  [{index}/{len(games)}] RATE LIMIT {game['title'][:40]}: {exc}.{suffix}")
            print("  Vinted ha limitado la sesión. Se corta esta fuente para no perder tiempo ni empeorar el bloqueo.")
            break
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
    if args.sweep_platform:
        listing_rows, stats = collect_platform_sweep(platform_slug, args, session)
    else:
        listing_rows, stats = collect_platform(platform_slug, args, session)
    print(
        f"\n  Juegos consultados: {stats['games_requested']} · "
        f"con anuncios: {stats['games_with_listings']} · "
        f"filas ingest: {stats['listings']} · "
        f"verificados: {stats['listings_verified']} · "
        f"pendientes revisión: {stats['listings_review']}"
    )
    if stats.get("rate_limited"):
        print(f"  Vinted rate limit: recolección cortada en {stats.get('stopped_at')}/{stats['games_requested']}.")

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
        "searchMode": "platform-sweep" if args.sweep_platform else "title",
        "notes": (
            f"Vinted ES — {'barrido por plataforma' if args.sweep_platform else 'búsqueda por juego'} "
            "(título + plataforma). "
            "Orden: más recientes. Paginación numérica al final de resultados."
        ),
        "rateLimited": bool(stats.get("rate_limited")),
        "stoppedAt": stats.get("stopped_at") or None,
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
    add_match_flags(parser)
    parser.add_argument(
        "--max-pages",
        type=int,
        help="Páginas de resultados por juego (default: ver data/ingest-recency.json)",
    )
    parser.add_argument("--delay", type=float, default=request_delay_default(), help="Segundos entre búsquedas")
    parser.add_argument(
        "--sweep-platform",
        action="store_true",
        help="Buscar por términos amplios de plataforma y clasificar contra todo el catálogo",
    )
    parser.add_argument("--sweep-query", help="Query única para barrido de plataforma")
    parser.add_argument("--sweep-pages", type=int, help="Páginas por query del barrido")
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
