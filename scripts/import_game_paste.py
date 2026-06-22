#!/usr/bin/env python3
"""Importador de texto pegado desde el catálogo GAME España.

Formato esperado del pegado web:
  Título - Seminuevo
  Título - Seminuevo
  Comprar
  24 '99 €

Genera el mismo JSON de ingest que el collector GAME API, sin llamar a GAME.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import collect_game_es  # noqa: E402
from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402

PRICE_RE = re.compile(r"(?P<euros>\d{1,5})\s*['’]\s*(?P<cents>\d{2})\s*€")
BUY_WORDS = {"comprar", "añadir", "anadir"}
LIKELY_NON_GAME_RE = re.compile(
    r"\b("
    r"figura|figurine|funko|amiibo|peluche|camiseta|poster|póster|merchandising|"
    r"mando|controller|consola|auriculares|headset|accesorio|accesorios|cargador|"
    r"cable|funda|soporte|volante|teclado|rat[oó]n|alfombrilla|skin|pack consola"
    r")\b",
    re.IGNORECASE,
)


def clean_line(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split()).strip()


def parse_price(value: str) -> float | None:
    match = PRICE_RE.search(value)
    if not match:
        return None
    return round(float(f"{match.group('euros')}.{match.group('cents')}"), 2)


def is_buy_line(value: str) -> bool:
    return clean_line(value).lower() in BUY_WORDS


def is_likely_non_game(title: str) -> bool:
    return bool(LIKELY_NON_GAME_RE.search(title))


def normalize_source_title(title: str) -> str:
    title = clean_line(title)
    title = re.sub(r"\s*[-–—]\s*(seminuevo|nuevo)\s*$", "", title, flags=re.IGNORECASE)
    return title.strip(" -·")


def parse_game_paste(text: str, *, offer_type: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    lines = [clean_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    products: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    seen: set[str] = set()
    duplicate_count = 0
    stray_prices = 0
    unmatched_lines = 0
    index = 0

    while index < len(lines):
        line = lines[index]
        if parse_price(line) is not None:
            stray_prices += 1
            index += 1
            continue
        if is_buy_line(line):
            unmatched_lines += 1
            index += 1
            continue

        title = normalize_source_title(line)
        next_index = index + 1
        if next_index < len(lines) and clean_line(lines[next_index]).lower() == clean_line(line).lower():
            next_index += 1
        if next_index < len(lines) and is_buy_line(lines[next_index]):
            next_index += 1
        if next_index >= len(lines):
            unmatched_lines += 1
            index += 1
            continue
        price = parse_price(lines[next_index])
        if price is None:
            unmatched_lines += 1
            index += 1
            continue

        key = f"{title.lower()}|{price:.2f}"
        if key in seen:
            duplicate_count += 1
            index = next_index + 1
            continue
        seen.add(key)
        if is_likely_non_game(title):
            skipped.append({"title": title, "priceEur": price, "reason": "likely_non_game"})
            index = next_index + 1
            continue
        sku = "paste-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
        products.append(
            {
                "title": title,
                "priceEur": price,
                "productUrl": "https://www.game.es/",
                "listingUrl": "https://www.game.es/",
                "imageUrl": None,
                "conditionRaw": "preowned" if offer_type == "preowned" else "new",
                "sourceSku": sku,
                "offerType": offer_type,
                "pasteSource": True,
            }
        )
        index = next_index + 1

    stats = {
        "pastedLines": len(lines),
        "parsedProducts": len(products),
        "skippedLikelyNonGames": len(skipped),
        "duplicateSkipped": duplicate_count,
        "strayPrices": stray_prices,
        "unmatchedLines": unmatched_lines,
    }
    return products, skipped, stats


def run_import(args: argparse.Namespace) -> int:
    source = collect_game_es.OFFER_TYPES[args.offer_type]["source"]
    text = args.input.read_text(encoding="utf-8")
    products, skipped, paste_stats = parse_game_paste(text, offer_type=args.offer_type)
    print(f"=== GAME pegado manual · {args.platform} · {args.offer_type} ===")
    print(
        "  Pegado: "
        f"{paste_stats['pastedLines']} líneas · "
        f"{paste_stats['parsedProducts']} productos · "
        f"{paste_stats['skippedLikelyNonGames']} descartes obvios · "
        f"{paste_stats['duplicateSkipped']} duplicados"
    )
    if args.preview:
        for product in products[: args.preview_limit]:
            print(f"  {product['title']}: {product['priceEur']} €")
        if skipped:
            print("  Descartes obvios:")
            for item in skipped[: args.preview_limit]:
                print(f"  - {item['title']}: {item['priceEur']} € ({item['reason']})")

    games = platform_catalog_games(args.platform, args.region)
    _, ref_to_ids = build_platform_reference_index(args.platform)
    match_opts = match_kwargs(args)
    previous_region_vision_disabled = os.environ.get("REGION_VISION_DISABLED")
    if not match_opts["use_ai"]:
        os.environ["REGION_VISION_DISABLED"] = "1"
    try:
        match_stats = run_match_pipeline(
            products,
            games,
            args.platform,
            source=source,
            ref_to_ids=ref_to_ids,
            row_builder=lambda product, matched_game, result: collect_game_es.row_from_product(
                product,
                matched_game,
                result,
                source=source,
                offer_type=args.offer_type,
            ),
            infer_listing_region=None,
            is_valid_product=lambda product: bool(product.get("title") and product.get("priceEur")),
            use_ai=match_opts["use_ai"],
            use_match_cache=match_opts["use_match_cache"],
        )
    finally:
        if previous_region_vision_disabled is None:
            os.environ.pop("REGION_VISION_DISABLED", None)
        else:
            os.environ["REGION_VISION_DISABLED"] = previous_region_vision_disabled

    print_match_stats(match_stats, label=source, use_ai=match_opts["use_ai"])
    print(f"  Filas verificables/revisión: {len(match_stats.rows)}")
    for row in match_stats.rows[:8]:
        print(f"  {row['catalogId']}: {row['priceEur']} € · {row.get('title', '')[:60]}")

    payload = {
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "source": source,
        "searchMode": "manual_paste",
        "offerType": args.offer_type,
        "products": products,
        "skippedProducts": skipped,
        "listings": match_stats.rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
        "stats": {
            **paste_stats,
            "products": len(products),
            "products_matched": len(match_stats.rows),
            "matched_by_ai": match_stats.matched_by_ai,
            "ambiguous_skipped": match_stats.ambiguous_skipped,
            "region_rejected": match_stats.region_rejected,
        },
    }
    if not args.dry_run:
        save_json(args.output, payload)
        print(f"  Guardado: {args.output}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Importar texto pegado de GAME España al ingest de precios")
    parser.add_argument("--platform", required=True, choices=sorted(collect_game_es.HEADS_BY_PLATFORM))
    parser.add_argument("--offer-type", default="preowned", choices=sorted(collect_game_es.OFFER_TYPES))
    parser.add_argument("--region", help="Región exacta del catálogo")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "price-ingest" / "game-es-paste.json")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--preview-limit", type=int, default=8)
    parser.add_argument("--dry-run", action="store_true")
    add_match_flags(parser)
    args = parser.parse_args()
    raise SystemExit(run_import(args))


if __name__ == "__main__":
    main()
