"""Matching catálogo ↔ lotes TodoColeccion."""

from __future__ import annotations

import re
from typing import Any

from collectors.catalog_match import CatalogMatchResult, is_manual_only_listing, match_catalog_product, product_title
from collectors.jgo_match import infer_condition
from collectors.condition_buckets import bucket_from_raw
from collectors.listing_images import attach_image_urls
from collectors.reference_match import listing_reference_valid_for_catalog
from collectors.region_inference import (
    detect_listing_region,
    infer_listing_evidence,
    regions_match,
    title_conflicts_region,
)
from region_evidence_rules import check_listing_evidence_meets_rules

NON_GAME_RE = re.compile(
    r"\b("
    r"consola|console|adaptador|adapter|cable|mando|controller|"
    r"pistola|cat[aá]logo|vhs|poster|mapa|"
    r"solamente la caja|solo la caja|solo caja|sin juego|caja vac[ií]a"
    r")\b",
    re.I,
)


def is_tc_game_listing(title: str) -> bool:
    if len(title.strip()) < 4:
        return False
    if is_manual_only_listing(title, title=title):
        return False
    return not NON_GAME_RE.search(title)


def is_tc_game_product(product: dict[str, Any]) -> bool:
    return is_tc_game_listing(product_title(product))


def infer_tc_region(title: str) -> str | None:
    return detect_listing_region(title)


def infer_tc_region_product(product: dict[str, Any]) -> str | None:
    return infer_tc_region(product_title(product))


def match_tc_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> CatalogMatchResult:
    return match_catalog_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
        infer_listing_region=infer_tc_region_product,
        is_valid_product=is_tc_game_product,
    )


def best_tc_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.44,
) -> tuple[dict[str, Any] | None, str | None]:
    result = match_tc_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
    )
    if result.ambiguous or not result.game:
        return None, None
    return result.game, result.matched_reference


def product_to_ingest_row(
    product: dict[str, Any],
    catalog_id: str,
    catalog_region: str,
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    matched_reference: str | None = None,
    match_method: str = "title",
    match_score: float | None = None,
    match_margin: float | None = None,
    match_alternatives: list[dict[str, Any]] | None = None,
    ai_confidence: float | None = None,
) -> dict[str, Any] | None:
    title = product_title(product)
    price = product.get("priceEur")
    if price is None or float(price) <= 0:
        return None
    if title_conflicts_region(title, catalog_region):
        return None

    ok_ref, matched_ref = listing_reference_valid_for_catalog(
        title,
        catalog_id,
        catalog_region,
        ref_to_ids=ref_to_ids,
    )
    if not ok_ref:
        return None
    if matched_ref and not matched_reference:
        matched_reference = matched_ref

    listing_region, evidence, ai_conf = infer_listing_evidence(
        title,
        catalog_region,
        matched_reference=matched_reference,
    )
    if not regions_match(catalog_region, listing_region):
        return None

    ok, _ = check_listing_evidence_meets_rules(platform_slug, catalog_region, evidence, ai_conf)
    if not ok:
        return None

    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "todocoleccion",
        "listingType": str(product.get("listingType") or "active"),
        "priceEur": round(float(price), 2),
        "listingRegion": listing_region,
        "regionVerified": True,
        "regionEvidence": evidence,
        "aiConfidence": ai_conf,
        "productUrl": str(product.get("productUrl") or ""),
        "title": title,
        "matchMethod": match_method,
    }
    external_id = str(product.get("externalId") or "").strip()
    if external_id:
        row["externalId"] = external_id
    if matched_reference:
        row["matchedReference"] = matched_reference
    if match_score is not None:
        row["matchScore"] = round(float(match_score), 3)
    if match_margin is not None:
        row["matchMargin"] = round(float(match_margin), 3)
    if match_alternatives:
        row["matchAlternatives"] = match_alternatives
    if ai_confidence is not None:
        row["aiConfidence"] = round(float(ai_confidence), 3)
    raw_cond = infer_condition(title)
    bucket = bucket_from_raw(raw_cond)
    if bucket:
        row["condition"] = bucket
    attach_image_urls(row, product, "todocoleccion")
    if product.get("listedAt"):
        row["listedAt"] = product["listedAt"]
    return row


__all__ = [
    "best_tc_match",
    "infer_tc_region",
    "infer_tc_region_product",
    "is_tc_game_listing",
    "is_tc_game_product",
    "match_tc_product",
    "product_to_ingest_row",
]
