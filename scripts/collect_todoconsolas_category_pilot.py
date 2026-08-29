#!/usr/bin/env python3
"""Piloto prudente de precios usados desde categorías públicas de TodoConsolas.

No usa el buscador interno, no visita fichas de producto y no sincroniza precios.
Cada ejecución queda limitada a cinco páginas y se detiene ante HTTP 403/429.
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.tcns_client import (  # noqa: E402
    TodoConsolasRequestError,
    fetch_category_page,
    tcns_category_paths_for_platform,
)
from collectors.tcns_match import infer_tcns_region_product, match_tcns_product  # noqa: E402

SOURCE = "todoconsolas"
MIN_DELAY_SECONDS = 5.0
MAX_PAGES_PER_RUN = 5


def is_preowned_product(product: dict[str, Any]) -> bool:
    condition = str(product.get("conditionRaw") or "").strip().lower()
    return "segunda mano" in condition


def classify_candidate(product: dict[str, Any], result) -> dict[str, Any]:
    listing_region = infer_tcns_region_product(product)
    matched_game = result.game if not result.ambiguous else None
    catalog_region = str((matched_game or {}).get("region") or "").strip() or None
    score = round(float(result.match_score), 3) if result.match_score is not None else None
    margin = round(float(result.margin), 3) if result.margin is not None else None

    if not listing_region:
        status = "blocked_missing_region"
        reason = "El anuncio no declara una región verificable."
    elif result.ambiguous:
        status = "manual_review"
        reason = "Hay varias fichas de catálogo plausibles."
    elif not matched_game:
        status = "unmatched"
        reason = "No hay una ficha compatible en el catálogo."
    else:
        exact_region = listing_region.casefold() == str(catalog_region or "").casefold()
        strong_title = result.match_method == "reference" or (
            score is not None and score >= 0.9 and margin is not None and margin >= 0.15
        )
        if exact_region and strong_title:
            status = "strong_review"
            reason = "Título y región permiten una revisión rápida, pero el piloto no sincroniza."
        else:
            status = "manual_review"
            reason = "Debe confirmarse la variante, edición o equivalencia regional."

    return {
        "status": status,
        "reason": reason,
        "sourceTitle": str(product.get("title") or ""),
        "priceEur": product.get("priceEur"),
        "conditionRaw": product.get("conditionRaw"),
        "listingRegion": listing_region,
        "productUrl": product.get("productUrl"),
        "externalId": product.get("externalId"),
        "catalogId": str((matched_game or {}).get("id") or "") or None,
        "catalogTitle": str((matched_game or {}).get("title") or "") or None,
        "catalogRegion": catalog_region,
        "matchMethod": result.match_method,
        "matchScore": score,
        "matchMargin": margin,
        "alternatives": result.alternatives,
    }


def validate_window(start_page: int, max_pages: int) -> None:
    if start_page < 1:
        raise ValueError("--start-page debe ser mayor o igual que 1")
    if max_pages < 1 or max_pages > MAX_PAGES_PER_RUN:
        raise ValueError(f"--max-pages debe estar entre 1 y {MAX_PAGES_PER_RUN}")


def collect_category_pages(
    category_paths: list[str],
    *,
    start_page: int,
    max_pages: int,
    delay_seconds: float,
    jitter_seconds: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    validate_window(start_page, max_pages)
    delay = max(MIN_DELAY_SECONDS, float(delay_seconds))
    jitter = max(0.0, min(float(jitter_seconds), 5.0))
    products: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    request_count = 0

    for category_path in category_paths:
        known_last_page: int | None = None
        for page in range(start_page, start_page + max_pages):
            if known_last_page is not None and page > known_last_page:
                break
            if request_count:
                time.sleep(delay + random.uniform(0, jitter))
            page_products, last_page = fetch_category_page(category_path, page)
            request_count += 1
            known_last_page = last_page
            pages.append(
                {
                    "categoryPath": category_path,
                    "page": page,
                    "lastPage": last_page,
                    "products": len(page_products),
                }
            )
            print(f"  {category_path} · página {page}/{last_page}: {len(page_products)} productos")
            for product in page_products:
                product_url = str(product.get("productUrl") or "")
                if not product_url or product_url in seen_urls:
                    continue
                seen_urls.add(product_url)
                products.append(product)

    return products, pages


def run(args: argparse.Namespace) -> int:
    category_paths = tcns_category_paths_for_platform(args.platform)
    if not category_paths:
        raise SystemExit(f"TodoConsolas no tiene categoría configurada para {args.platform}")
    validate_window(args.start_page, args.max_pages)

    print(f"=== TodoConsolas prudente · {args.platform} · solo segunda mano ===")
    print("  Modo: referencia y revisión; nunca sincroniza el catálogo")
    print(
        f"  Ventana: página {args.start_page}, máximo {args.max_pages} · "
        f"pausa mínima {max(MIN_DELAY_SECONDS, args.delay):.1f}s"
    )
    products, pages = collect_category_pages(
        category_paths,
        start_page=args.start_page,
        max_pages=args.max_pages,
        delay_seconds=args.delay,
        jitter_seconds=args.jitter,
    )
    preowned = [product for product in products if is_preowned_product(product)]
    if args.limit is not None:
        preowned = preowned[: max(0, args.limit)]

    games = platform_catalog_games(args.platform)
    _, ref_to_ids = build_platform_reference_index(args.platform)
    candidates = [
        classify_candidate(
            product,
            match_tcns_product(product, games, args.platform, ref_to_ids=ref_to_ids),
        )
        for product in preowned
    ]
    counts: dict[str, int] = {}
    for candidate in candidates:
        status = str(candidate["status"])
        counts[status] = counts.get(status, 0) + 1

    print(f"  Tarjetas leídas: {len(products)} · segunda mano: {len(preowned)}")
    print(
        "  Resultado: "
        f"revisión fuerte {counts.get('strong_review', 0)} · "
        f"revisión manual {counts.get('manual_review', 0)} · "
        f"sin región {counts.get('blocked_missing_region', 0)} · "
        f"sin ficha {counts.get('unmatched', 0)}"
    )
    for candidate in candidates[:12]:
        target = candidate.get("catalogTitle") or "sin ficha"
        print(
            f"  [{candidate['status']}] {candidate['priceEur']} € · "
            f"{candidate['sourceTitle'][:52]} -> {str(target)[:45]}"
        )
    if len(candidates) > 12:
        print(f"  ... y {len(candidates) - 12} candidatos más")

    report = {
        "schemaVersion": 1,
        "source": SOURCE,
        "mode": "public_category_preowned_review_only",
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "safety": {
            "searchControllerUsed": False,
            "productDetailsVisited": False,
            "catalogSyncAvailable": False,
            "maxPagesPerRun": MAX_PAGES_PER_RUN,
            "delaySeconds": max(MIN_DELAY_SECONDS, args.delay),
            "jitterSeconds": max(0.0, min(args.jitter, 5.0)),
        },
        "pages": pages,
        "stats": {
            "productsRead": len(products),
            "preownedConsidered": len(preowned),
            **counts,
        },
        "candidates": candidates,
    }
    if args.output:
        save_json(args.output, report)
        print(f"  Informe guardado: {args.output}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="TodoConsolas category-only preowned pilot")
    parser.add_argument("--platform", default="ps4")
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--delay", type=float, default=MIN_DELAY_SECONDS)
    parser.add_argument("--jitter", type=float, default=1.5)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path, help="Informe JSON opcional; nunca es un payload de sync")
    parser.add_argument("--dry-run", action="store_true", help="Alias documental: el piloto siempre es dry-run")
    args = parser.parse_args()
    try:
        raise SystemExit(run(args))
    except (TodoConsolasRequestError, ValueError) as exc:
        print(f"  PARADA SEGURA: {exc}")
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
