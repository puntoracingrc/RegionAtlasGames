#!/usr/bin/env python3
"""Recolector prudente de precios usados desde categorías públicas TodoConsolas.

No usa el buscador interno ni visita fichas de producto. Genera un lote de
precios exactos y una cola separada de revisión, sin sincronizar por sí mismo.
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.tcns_client import (  # noqa: E402
    TodoConsolasRequestError,
    fetch_category_page,
    tcns_category_paths_for_platform,
)
from collectors.tcns_match import infer_tcns_region_product, match_tcns_product  # noqa: E402
from collectors.tcns_policy import POLICY_VERSION, tcns_auto_match_decision  # noqa: E402

SOURCE = "todoconsolas"
MIN_DELAY_SECONDS = 5.0
MAX_PAGES_PER_RUN = 5

REVIEW_REASON_LABELS = {
    "condition_not_plain_preowned": "El estado no es segunda mano normal.",
    "price_out_of_range": "El precio está fuera del rango de seguridad.",
    "catalog_match_not_unique": "No hay una única ficha de catálogo demostrada.",
    "listing_region_missing": "El anuncio no declara una región verificable.",
    "catalog_region_not_exact": "La región no coincide exactamente con la ficha.",
    "reference_missing": "Falta la referencia exacta que justificaría el enlace.",
    "catalog_title_not_exact": "El título o la edición no coinciden exactamente.",
    "match_metadata_invalid": "La confianza del enlace no se pudo validar.",
    "match_confidence_too_low": "La coincidencia necesita revisión humana.",
    "price_change_requires_review": "El cambio frente al precio anterior es demasiado grande.",
}


def is_preowned_product(product: dict[str, Any]) -> bool:
    condition = str(product.get("conditionRaw") or "").strip().lower()
    return "segunda mano" in condition


def classify_candidate(product: dict[str, Any], result, platform_slug: str = "ps4") -> dict[str, Any]:
    listing_region = infer_tcns_region_product(product)
    proposed_game = result.game
    catalog_region = str((proposed_game or {}).get("region") or "").strip() or None
    score = round(float(result.match_score), 3) if result.match_score is not None else None
    margin = round(float(result.margin), 3) if result.margin is not None else None
    approved, policy_reason = tcns_auto_match_decision(product, result, platform_slug)
    status = "auto_approved" if approved else "manual_review"
    reason = (
        "Título, edición, región y estado coinciden exactamente."
        if approved
        else REVIEW_REASON_LABELS.get(policy_reason, "Debe revisarse antes de aplicar el precio.")
    )

    return {
        "status": status,
        "reason": reason,
        "policyReason": policy_reason,
        "sourceTitle": str(product.get("title") or ""),
        "priceEur": product.get("priceEur"),
        "conditionRaw": product.get("conditionRaw"),
        "listingRegion": listing_region,
        "productUrl": product.get("productUrl"),
        "externalId": product.get("externalId"),
        "catalogId": str((proposed_game or {}).get("id") or "") or None,
        "catalogTitle": str((proposed_game or {}).get("title") or "") or None,
        "catalogRegion": catalog_region,
        "matchMethod": result.match_method,
        "matchScore": score,
        "matchMargin": margin,
        "alternatives": result.alternatives,
    }


def approved_ingest_row(product: dict[str, Any], result, collected_at: str) -> dict[str, Any]:
    game = result.game
    if not game:
        raise ValueError("Una fila aprobada necesita ficha de catálogo")
    listing_region = infer_tcns_region_product(product)
    row: dict[str, Any] = {
        "catalogId": str(game["id"]),
        "source": SOURCE,
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "title": str(product.get("title") or ""),
        "priceEur": round(float(product["priceEur"]), 2),
        "retailPriceEur": round(float(product["priceEur"]), 2),
        "currency": "EUR",
        "productUrl": str(product.get("productUrl") or ""),
        "externalId": str(product.get("externalId") or ""),
        "condition": "preowned",
        "conditionRaw": str(product.get("conditionRaw") or ""),
        "collectedAt": collected_at,
        "listingRegion": listing_region,
        "catalogRegion": str(game.get("region") or ""),
        "regionVerified": True,
        "regionEvidence": ["listing_title_region", "catalog_title_exact"],
        "matchMethod": result.match_method,
        "matchScore": result.match_score,
        "matchMargin": result.margin,
        "matchAlternatives": result.alternatives,
        "autoApproved": True,
        "acceptancePolicy": POLICY_VERSION,
    }
    if result.matched_reference:
        row["matchedReference"] = result.matched_reference
        row["regionEvidence"] = ["listing_title_region", "catalog_reference_exact"]
    return row


def review_ingest_row(product: dict[str, Any], result, candidate: dict[str, Any], collected_at: str) -> dict[str, Any]:
    return {
        "catalogId": None,
        "candidateCatalogId": candidate.get("catalogId"),
        "source": SOURCE,
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "title": str(product.get("title") or ""),
        "priceEur": round(float(product["priceEur"]), 2),
        "retailPriceEur": round(float(product["priceEur"]), 2),
        "currency": "EUR",
        "productUrl": str(product.get("productUrl") or ""),
        "externalId": str(product.get("externalId") or ""),
        "condition": "preowned",
        "conditionRaw": str(product.get("conditionRaw") or ""),
        "collectedAt": collected_at,
        "listingRegion": candidate.get("listingRegion"),
        "catalogRegion": candidate.get("catalogRegion"),
        "regionVerified": bool(candidate.get("listingRegion")),
        "regionEvidence": ["listing_title_region"] if candidate.get("listingRegion") else [],
        "regionReviewNeeded": True,
        "regionReviewReason": candidate.get("policyReason"),
        "regionReviewNotes": [candidate.get("reason")],
        "matchMethod": result.match_method,
        "matchScore": result.match_score,
        "matchMargin": result.margin,
        "matchAlternatives": result.alternatives,
    }


def merge_ingest_payload(existing: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    if (existing.get("tcns") or existing.get("regionalCandidates")) and not _same_collection_window(
        existing.get("collectedAt"), current.get("collectedAt")
    ):
        raise ValueError("--merge solo admite ventanas del mismo barrido (máximo 12 horas)")
    approved: dict[str, dict[str, Any]] = {}
    for row in [*(existing.get("tcns") or []), *(current.get("tcns") or [])]:
        catalog_id = str(row.get("catalogId") or "")
        if not catalog_id:
            continue
        previous = approved.get(catalog_id)
        if previous is None or float(row.get("retailPriceEur") or row.get("priceEur")) < float(
            previous.get("retailPriceEur") or previous.get("priceEur")
        ):
            approved[catalog_id] = row

    reviews: dict[str, dict[str, Any]] = {}
    for row in [*(existing.get("regionalCandidates") or []), *(current.get("regionalCandidates") or [])]:
        key = str(row.get("productUrl") or row.get("externalId") or row.get("title") or "")
        if key:
            reviews[key] = row

    merged = {**current}
    merged["tcns"] = list(approved.values())
    merged["regionalCandidates"] = list(reviews.values())
    merged["sourceStats"] = {
        SOURCE: {
            "auto_approved": len(merged["tcns"]),
            "manual_review": len(merged["regionalCandidates"]),
        }
    }
    return merged


def _same_collection_window(existing_at: Any, current_at: Any) -> bool:
    try:
        first = datetime.fromisoformat(str(existing_at).replace("Z", "+00:00"))
        second = datetime.fromisoformat(str(current_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if first.tzinfo is None:
        first = first.replace(tzinfo=timezone.utc)
    if second.tzinfo is None:
        second = second.replace(tzinfo=timezone.utc)
    return abs((second - first).total_seconds()) <= 12 * 60 * 60


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
    print("  Modo: aprobados exactos + cola de revisión; no sincroniza por sí mismo")
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
    collected_at = now_iso()
    candidates: list[dict[str, Any]] = []
    approved_rows: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []
    for product in preowned:
        result = match_tcns_product(product, games, args.platform, ref_to_ids=ref_to_ids)
        candidate = classify_candidate(product, result, args.platform)
        candidates.append(candidate)
        if candidate["status"] == "auto_approved":
            approved_rows.append(approved_ingest_row(product, result, collected_at))
        else:
            review_rows.append(review_ingest_row(product, result, candidate, collected_at))
    counts: dict[str, int] = {}
    for candidate in candidates:
        status = str(candidate["status"])
        counts[status] = counts.get(status, 0) + 1

    print(f"  Tarjetas leídas: {len(products)} · segunda mano: {len(preowned)}")
    print(
        "  Resultado: "
        f"autoaprobados {counts.get('auto_approved', 0)} · "
        f"revisión manual {counts.get('manual_review', 0)}"
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
        "mode": "public_category_preowned_exact_or_review",
        "platformSlug": args.platform,
        "collectedAt": collected_at,
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
    ingest = {
        "schemaVersion": 1,
        "platformSlug": args.platform,
        "collectedAt": collected_at,
        "source": SOURCE,
        "searchMode": "public_category_preowned_exact",
        "listings": [],
        "regionalCandidates": review_rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": approved_rows,
        "tc": [],
        "sourceStats": {
            SOURCE: {
                "products_read": len(products),
                "preowned_considered": len(preowned),
                "auto_approved": len(approved_rows),
                "manual_review": len(review_rows),
            }
        },
    }
    if args.output:
        save_json(args.output, report)
        print(f"  Informe guardado: {args.output}")
    if args.ingest_output:
        if args.merge and args.ingest_output.exists():
            ingest = merge_ingest_payload(load_json(args.ingest_output, {}), ingest)
        save_json(args.ingest_output, ingest)
        print(f"  Lote compatible guardado: {args.ingest_output}")
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
    parser.add_argument("--ingest-output", type=Path, help="Lote con autoaprobados y candidatos; no lo aplica")
    parser.add_argument("--merge", action="store_true", help="Une el lote con --ingest-output sin duplicados")
    parser.add_argument("--dry-run", action="store_true", help="Alias documental: el piloto siempre es dry-run")
    args = parser.parse_args()
    try:
        raise SystemExit(run(args))
    except (TodoConsolasRequestError, ValueError) as exc:
        print(f"  PARADA SEGURA: {exc}")
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
