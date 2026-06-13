#!/usr/bin/env python3
"""Prueba Wallapop Sonic — misma búsqueda API, clasificación solo IA (sin regex/rules)."""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.catalog_ai_match import ai_available  # noqa: E402
from collectors.common import CATALOG_FILE, load_json, save_json  # noqa: E402
from collectors.wallapop_client import (  # noqa: E402
    DEFAULT_CATEGORY_ID,
    build_wallapop_query,
    fetch_game_products,
    wallapop_order_by,
)
from collectors.listing_recency import wallapop_listing_age_days, wallapop_time_filter  # noqa: E402
from collectors.wallapop_listing_ai import (  # noqa: E402
    MIN_CONFIDENCE,
    classify_products_for_game,
    passes_listing_ai,
)

TARGET_ID = "megadrive-sonic-the-hedgehog"


def main() -> None:
    parser = argparse.ArgumentParser(description="Prueba Sonic Wallapop solo IA")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--limit", type=int, help="Limitar anuncios API (debug)")
    args = parser.parse_args()

    if not ai_available():
        raise SystemExit("Falta OPENAI_API_KEY")

    game = next(g for g in load_json(CATALOG_FILE, []) if g["id"] == TARGET_ID)
    query = build_wallapop_query(game)

    print("=== PRUEBA SOLO IA · Wallapop Sonic ===")
    print(f"Query: {query}")
    print(f"Categoría: {DEFAULT_CATEGORY_ID} (Videojuegos)")
    print(f"Orden: {wallapop_order_by()} · Tiempo: {wallapop_time_filter()} (~{wallapop_listing_age_days()} días)")
    print(f"Catálogo: {game['title']} · {game['region']} · {game['platformSlug']}")
    print()

    products = fetch_game_products(game, max_pages=None)
    if args.limit:
        products = products[: args.limit]
    print(f"Anuncios API (misma búsqueda Wallapop): {len(products)}")
    print("Clasificando con IA…")
    print()

    ai_by_key, ai_stats = classify_products_for_game(
        products,
        game,
        str(game["platformSlug"]),
        use_cache=not args.no_cache,
    )
    ai_rows = list(ai_by_key.values())
    catalog_region = str(game.get("region") or "")

    games = [r for r in ai_rows if r.is_video_game]
    targets = [r for r in ai_rows if passes_listing_ai(r, catalog_region=catalog_region)]
    verified = [r for r in targets if r.region_matches_catalog is True]
    review = [r for r in targets if r.region_matches_catalog is not True]

    print("RESULTADOS IA")
    print(f"  Anuncios analizados:     {len(ai_rows)}")
    print(f"  cache hits:              {ai_stats.get('ai_cache_hits', 0)}")
    print(f"  lotes API:               {ai_stats.get('ai_batches', 0)}")
    print(f"  isVideoGame:             {len(games)}")
    print(f"  Sonic 1 Mega Drive (IA): {len(targets)}")
    print(f"    · PAL verificado:      {len(verified)}")
    print(f"    · revisar región/otro: {len(review)}")
    print()

    reject_reasons = Counter(str(r.reason or "otro")[:60] for r in ai_rows if not r.is_target_game)
    print("Motivos rechazo (top 8):")
    for reason, count in reject_reasons.most_common(8):
        print(f"  {count:4} · {reason}")

    if verified:
        print()
        print(f"PRECIOS Sonic 1 PAL verificado ({len(verified)}): (usa collector para precios en ingest)")

    out = ROOT / "data" / "price-ingest" / "reports" / "wallapop-sonic-ai-test.json"
    save_json(
        out,
        {
            "query": query,
            "apiCount": len(products),
            "summary": {
                "videoGame": len(games),
                "targetGame": len(targets),
                "verifiedPal": len(verified),
                "review": len(review),
                "minConfidence": MIN_CONFIDENCE,
                **ai_stats,
            },
        },
    )
    print()
    print(f"Informe: {out}")


if __name__ == "__main__":
    main()
