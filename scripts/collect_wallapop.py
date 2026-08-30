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
from collectors.listing_recency import (  # noqa: E402
    max_listing_age_days,
    wallapop_listing_age_days,
    wallapop_per_game_pages,
    wallapop_time_filter,
)
from collectors.game_content_profile import game_content_profile  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.regional_variant_routing import regional_variants_for, strict_regions_match  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.physical_edition import physical_edition_base_title  # noqa: E402
from collectors.wallapop_client import (  # noqa: E402
    build_wallapop_query,
    enrich_product_details,
    fetch_game_products,
    fetch_query_products,
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
from collectors.wallapop_match import (  # noqa: E402
    dedupe_wallapop_rows,
    infer_wallapop_region_product,
    is_wallapop_game_product,
    listing_has_unmatched_extras,
    product_to_ingest_row,
)
from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "wallapop"
WALLAPOP_EVIDENCE_POLICY = "wallapop_full_listing_evidence_v2"
REQUEST_DELAY = 0.35
MIN_TITLE_SCORE = 0.42


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

REGION_SUFFIX_RE = re.compile(
    r"(?:\s+(?:"
    r"pal(?:\s+(?:esp|es|espana|eu|europa|europe|uk))?|"
    r"esp|espana|spain|eu|europa|europe|uk|it|italia|pl|portugal|"
    r"usa|us|ntsc(?:\s*[uj])?|jp|jap|japon|japan|asia|as"
    r"))+\s*$",
    re.I,
)


def mentions_other_platform(text: str, platform_slug: str) -> bool:
    allowed = PLATFORM_ALIAS_GROUPS.get(platform_slug, {platform_slug})
    for match in PLATFORM_TERM_RE.finditer(text):
        term = match.group(1).lower().strip()
        if term not in allowed:
            return True
    return False


def wallapop_match_core(title: str) -> str:
    """Quita edición, consola y sufijo regional solo para comparar títulos."""
    core = physical_edition_base_title(title)
    core = PLATFORM_TERM_RE.sub(" ", core)
    core = REGION_SUFFIX_RE.sub(" ", core)
    return product_core_title(re.sub(r"\s+", " ", core).strip())


def listing_matches_game(product: dict[str, Any], game: dict[str, Any], platform_slug: str) -> bool:
    title = product_title(product)
    full_text = f"{title} {product.get('description') or ''} {product.get('characteristics') or ''}"
    if mentions_other_platform(full_text, platform_slug):
        return False
    if listing_has_unmatched_extras(product, game):
        return False
    game_title = str(game.get("title") or "")
    if edition_numbers_conflict(title, game_title):
        return False
    listing_core = wallapop_match_core(title)
    game_core = wallapop_match_core(game_title)
    return token_similarity(game_core, listing_core) >= MIN_TITLE_SCORE


def route_row_to_detected_variant(
    row: dict[str, Any],
    searched_game: dict[str, Any],
    platform_games: list[dict[str, Any]],
) -> dict[str, Any]:
    """Aprovecha una región encontrada sin confundir anuncios ni variantes."""
    listing_region = str(row.get("listingRegion") or "").strip()
    searched_region = str(searched_game.get("region") or "").strip()
    if not listing_region or strict_regions_match(searched_region, listing_region):
        return row

    variants = regional_variants_for(searched_game, platform_games, listing_region)
    routed = dict(row)
    routed["searchedCatalogId"] = str(searched_game.get("id") or "")
    routed["searchedCatalogRegion"] = searched_region
    if len(variants) != 1:
        routed["regionVerified"] = False
        routed["regionReviewNeeded"] = True
        routed["regionalRoutingReason"] = (
            "regional_variant_missing" if not variants else "regional_variant_ambiguous"
        )
        if variants:
            routed["matchAlternatives"] = [
                {
                    "catalogId": str(game.get("id") or ""),
                    "title": game.get("title"),
                    "region": game.get("region"),
                    "coverUrl": game.get("coverUrl"),
                    "score": row.get("matchScore"),
                }
                for game in variants
            ]
        return routed

    destination = variants[0]
    destination_region = str(destination.get("region") or listing_region)
    rules_ok, rules_reason = check_listing_evidence_meets_rules(
        str(destination.get("platformSlug") or searched_game.get("platformSlug") or ""),
        destination_region,
        list(routed.get("regionEvidence") or []),
        float(routed.get("aiConfidence") or 0),
    )
    routed["catalogId"] = str(destination.get("id") or "")
    routed["catalogRegion"] = destination_region
    routed["catalogTitle"] = destination.get("title")
    routed["catalogCoverUrl"] = destination.get("coverUrl")
    routed["regionalRoutingReason"] = "detected_region_variant"
    routed["regionVerified"] = bool(
        rules_ok and strict_regions_match(destination_region, listing_region)
    )
    if routed["regionVerified"]:
        routed.pop("regionReviewNeeded", None)
        routed.pop("regionReviewNotes", None)
    else:
        routed["regionReviewNeeded"] = True
        notes = list(routed.get("regionReviewNotes") or [])
        if rules_reason and rules_reason not in notes:
            notes.append(str(rules_reason))
        routed["regionReviewNotes"] = notes
    return routed


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
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    platform_games = platform_catalog_games(platform_slug)
    _, ref_to_ids = build_platform_reference_index(platform_slug)
    queries = [args.sweep_query] if args.sweep_query else default_sweep_queries(platform_slug)
    cache_file = CACHE_DIR / platform_slug / "_platform-sweep.json"
    match_opts = match_kwargs(args)

    products: list[dict[str, Any]] | None = None
    if args.use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        if (
            cache_policy_matches(cached)
            and cached.get("wallapopEvidencePolicy") == WALLAPOP_EVIDENCE_POLICY
        ):
            products = list(cached.get("products") or [])
            queries = list(cached.get("queries") or queries)
    if products is None:
        seen: set[str] = set()
        products = []
        for index, query in enumerate(queries, start=1):
            fetched = fetch_query_products(
                query,
                max_pages=args.sweep_pages if args.sweep_pages is not None else args.max_pages,
                delay_s=args.delay,
            )
            accepted = []
            for product in fetched:
                full_text = f"{product_title(product)} {product.get('description') or ''}"
                key = str(product.get("externalId") or product.get("productUrl") or "")
                if not key or key in seen:
                    continue
                if mentions_other_platform(full_text, platform_slug):
                    continue
                if not is_wallapop_game_product(product):
                    continue
                seen.add(key)
                accepted.append(product)
            products.extend(accepted)
            print(f"  Sweep [{index}/{len(queries)}] «{query}» → {len(accepted)} candidatos")
            if index < len(queries):
                time.sleep(args.delay)
        if args.use_cache:
            save_json(
                cache_file,
                attach_policy_version(
                    {
                        "wallapopEvidencePolicy": WALLAPOP_EVIDENCE_POLICY,
                        "queries": queries,
                        "products": products,
                    }
                ),
            )

    products, detail_stats = enrich_product_details(products, delay_s=args.delay)

    def row_builder(product: dict[str, Any], matched_game: dict[str, Any], result) -> dict[str, Any] | None:
        if listing_has_unmatched_extras(product, matched_game):
            return None
        content_profile = game_content_profile(matched_game)
        row = product_to_ingest_row(
            product,
            str(matched_game["id"]),
            str(matched_game.get("region") or ""),
            platform_slug,
            ref_to_ids=ref_to_ids,
            game_title=str(matched_game.get("title") or ""),
            manual_expected=content_profile["manualExpected"],
            manual_expectation_source=content_profile["manualExpectationSource"],
            original_contents_expected=content_profile["originalContentsExpected"],
            original_contents_source=content_profile["originalContentsSource"],
            **match_row_kwargs(result),
        )
        return row if row else None

    stats_match = run_match_pipeline(
        products,
        platform_games,
        platform_slug,
        source="wallapop",
        ref_to_ids=ref_to_ids,
        row_builder=row_builder,
        infer_listing_region=infer_wallapop_region_product,
        is_valid_product=is_wallapop_game_product,
        use_ai=match_opts["use_ai"],
        use_match_cache=match_opts["use_match_cache"],
    )
    deduped_rows, duplicates_removed = dedupe_wallapop_rows(stats_match.rows)
    stats_match.rows = deduped_rows
    print_match_stats(stats_match, label="Wallapop sweep")
    stats = {
        "games_requested": len(platform_games),
        "games_with_listings": len({row.get("catalogId") for row in stats_match.rows}),
        "listings": len(stats_match.rows),
        "listings_verified": sum(1 for row in stats_match.rows if row.get("regionVerified") is True),
        "listings_review": sum(1 for row in stats_match.rows if row.get("regionReviewNeeded")),
        "api_calls": len(queries),
        "ai_cache_hits": 0,
        "ai_batches": 0,
        "ai_rejected": 0,
        "ai_regex_rejected": 0,
        **detail_stats,
        "duplicate_catalog_rows_removed": duplicates_removed,
        "catalog_edition_gaps_count": len(stats_match.catalog_edition_gaps),
        "catalog_edition_gaps": stats_match.catalog_edition_gaps,
    }
    return stats_match.rows, stats


def collect_game_listings(
    game: dict[str, Any],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None,
    platform_games: list[dict[str, Any]],
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
        "details_requested": 0,
        "details_loaded": 0,
        "details_failed": 0,
    }

    if use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        if (
            cache_policy_matches(cached)
            and cached.get("wallapopEvidencePolicy") == WALLAPOP_EVIDENCE_POLICY
        ):
            return list(cached.get("listings") or []), game_stats

    products = fetch_game_products(game, max_pages=max_pages, delay_s=delay_s)
    matched = [
        product
        for product in products
        if listing_matches_game(product, game, platform_slug)
    ]
    matched, detail_stats = enrich_product_details(matched, delay_s=delay_s)
    game_stats.update(detail_stats)
    matched = [
        product
        for product in matched
        if listing_matches_game(product, game, platform_slug)
    ]

    ai_by_key: dict[str, Any] = {}
    content_profile = game_content_profile(game)
    if use_listing_ai and ai_available() and matched:
        game_for_ai = {
            **game,
            "manualExpected": content_profile["manualExpected"],
            "originalContentsExpected": content_profile["originalContentsExpected"],
        }
        ai_by_key, ai_stats = classify_products_for_game(
            matched,
            game_for_ai,
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
            game_title=str(game.get("title") or ""),
            manual_expected=content_profile["manualExpected"],
            manual_expectation_source=content_profile["manualExpectationSource"],
            original_contents_expected=content_profile["originalContentsExpected"],
            original_contents_source=content_profile["originalContentsSource"],
            match_score=round(
                token_similarity(str(game.get("title") or ""), product_title(product)),
                3,
            ),
            listing_ai=ai_result,
        )
        if row:
            rows.append(route_row_to_detected_variant(row, game, platform_games))

    if use_cache:
        save_json(
            cache_file,
            attach_policy_version(
                {
                    "wallapopEvidencePolicy": WALLAPOP_EVIDENCE_POLICY,
                    "query": build_wallapop_query(game),
                    "listings": rows,
                }
            ),
        )
    return rows, game_stats


def collect_platform(
    platform_slug: str,
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    if not wallapop_sources_for_platform(platform_slug):
        raise SystemExit(f"Plataforma no soportada: {platform_slug}")

    platform = load_platforms().get(platform_slug)
    region_key = os.environ.get("PRICE_COLLECT_REGION", "").strip() or "all"
    platform_games = [
        game
        for game in load_json(CATALOG_FILE, [])
        if game.get("platformSlug") == platform_slug and game.get("listingStatus") != "excluded"
    ]
    games = prioritize_catalog_games(
        platform_catalog_games(platform_slug),
        args.limit,
        rotation_key=f"wallapop:{platform_slug}:{region_key}",
    )
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
        "details_requested": 0,
        "details_loaded": 0,
        "details_failed": 0,
        "duplicate_catalog_rows_removed": 0,
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
                platform_games=platform_games,
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
        stats["details_requested"] += game_stats.get("details_requested", 0)
        stats["details_loaded"] += game_stats.get("details_loaded", 0)
        stats["details_failed"] += game_stats.get("details_failed", 0)
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

    all_rows, duplicates_removed = dedupe_wallapop_rows(all_rows)
    stats["duplicate_catalog_rows_removed"] = duplicates_removed
    stats["listings"] = len(all_rows)
    stats["listings_verified"] = sum(1 for row in all_rows if row.get("regionVerified") is True)
    stats["listings_review"] = sum(1 for row in all_rows if row.get("regionReviewNeeded"))
    stats["games_with_listings"] = len({row.get("catalogId") for row in all_rows if row.get("catalogId")})
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

    if args.sweep_platform:
        listing_rows, stats = collect_platform_sweep(platform_slug, args)
    else:
        listing_rows, stats = collect_platform(platform_slug, args)
    print(
        f"\n  Juegos consultados: {stats['games_requested']} · "
        f"con anuncios: {stats['games_with_listings']} · "
        f"filas ingest: {stats['listings']} · "
        f"verificados: {stats['listings_verified']} · "
        f"pendientes revisión: {stats['listings_review']}"
    )
    print(
        f"  Detalle: {stats.get('details_loaded', 0)}/{stats.get('details_requested', 0)} fichas · "
        f"fallos {stats.get('details_failed', 0)} · "
        f"asociaciones regionales duplicadas retiradas {stats.get('duplicate_catalog_rows_removed', 0)}"
    )
    if stats.get("catalog_edition_gaps_count"):
        print(
            "  Catálogo incompleto: "
            f"{stats['catalog_edition_gaps_count']} edición(es) física(s) separadas detectadas"
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
            f"Wallapop ES — {'barrido por plataforma' if args.sweep_platform else 'búsqueda por juego'} "
            "(categoría videojuegos). "
            "Filtrado IA por anuncio con caché en data/price-ingest/cache/wallapop-listing-ai/ "
            "(re-analiza si cambia título, precio, descripción o galería). Desactivar: --no-ai."
        ),
        "searchMode": "platform-sweep" if args.sweep_platform else "title",
        "stats": stats,
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
    parser.add_argument(
        "--sweep-platform",
        action="store_true",
        help="Buscar por términos amplios de plataforma y clasificar contra todo el catálogo",
    )
    parser.add_argument("--sweep-query", help="Query única para barrido de plataforma")
    parser.add_argument("--sweep-pages", type=int, help="Páginas por query del barrido")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.no_ai:
        os.environ["PRICE_AI_DISABLED"] = "1"
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
