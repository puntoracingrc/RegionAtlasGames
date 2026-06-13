"""Matching catálogo ↔ productos Chollo Games."""

from __future__ import annotations

from typing import Any

from collectors.catalog_match import CatalogMatchResult, match_catalog_product, product_title
from collectors.jgo_match import pick_best_product_rows
from collectors.listing_images import attach_image_urls
from collectors import platform_sources as ps

CHOLLO_PLATFORM_CATEGORIES = ps.legacy_chollo_categories()


def infer_chollo_region_product(product: dict[str, Any]) -> str | None:
    region = str(product.get("listingRegion") or "").strip()
    return region or "Japón"


def match_chollo_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> CatalogMatchResult:
    listing_region = infer_chollo_region_product(product)
    return match_catalog_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
        infer_listing_region=lambda _: listing_region,
    )


def best_chollo_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> tuple[dict[str, Any] | None, str | None]:
    result = match_chollo_product(
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
    *,
    matched_reference: str | None = None,
    match_method: str = "title",
    match_score: float | None = None,
    match_margin: float | None = None,
    match_alternatives: list[dict[str, Any]] | None = None,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    price = product.get("priceEur")
    if price is None or float(price) <= 0:
        return {}
    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "chollogames",
        "retailPriceEur": round(float(price), 2),
        "priceEur": round(float(price), 2),
        "listingRegion": str(product.get("listingRegion") or "Japón"),
        "regionVerified": True,
        "regionEvidence": ["listing_title_region", "seller_states_region"],
        "productUrl": str(product.get("productUrl") or ""),
        "condition": str(product.get("condition") or "unknown"),
        "inStock": True,
        "externalId": str(product.get("externalId") or ""),
        "title": product_title(product),
        "matchMethod": match_method,
    }
    if matched_reference:
        row["matchedReference"] = matched_reference
        row["regionEvidence"].append("sku_regional")
    if match_score is not None:
        row["matchScore"] = round(float(match_score), 3)
    if match_margin is not None:
        row["matchMargin"] = round(float(match_margin), 3)
    if match_alternatives:
        row["matchAlternatives"] = match_alternatives
    if ai_confidence is not None:
        row["aiConfidence"] = round(float(ai_confidence), 3)
    attach_image_urls(row, product, "chollogames")
    return row


__all__ = [
    "CHOLLO_PLATFORM_CATEGORIES",
    "best_chollo_match",
    "infer_chollo_region_product",
    "match_chollo_product",
    "pick_best_product_rows",
    "product_to_ingest_row",
]
