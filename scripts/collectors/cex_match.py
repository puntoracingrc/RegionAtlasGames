"""Matching catálogo ↔ productos CeX (Algolia ES) — wrapper sobre catalog_match."""

from __future__ import annotations

import re
from typing import Any

from collectors.catalog_match import (
    AI_MIN_CONFIDENCE,
    AUTO_MARGIN_MIN,
    AUTO_SCORE_HIGH,
    AUTO_SCORE_MIN,
    CatalogMatchResult,
    is_likely_game_product,
    match_catalog_product,
    product_title,
)
from collectors.condition_buckets import infer_condition_bucket
from collectors.listing_images import attach_image_urls

ORIGIN_REGION_MAP: dict[str, str] = {
    "ES": "PAL España",
    "UK": "PAL UK/ENG",
    "IE": "PAL UK/ENG",
    "FR": "PAL Europa",
    "DE": "PAL Alemania",
    "IT": "PAL Europa",
    "EU": "PAL Europa",
    "US": "USA",
    "JP": "Japón",
    "AU": "Australia",
}

TITLE_REGION_SUFFIX_RE = re.compile(
    r"\((SP|EU|UK|JP|FR|US|USA|DE|IT|JAP|PAL)\)\s*$",
    re.I,
)

REGION_SUFFIX_MAP: dict[str, str] = {
    **ORIGIN_REGION_MAP,
    "SP": "PAL España",
    "JAP": "Japón",
    "PAL": "PAL Europa",
}

CexMatchResult = CatalogMatchResult


def infer_cex_region(product: dict[str, Any]) -> str | None:
    title = product_title(product)
    suffix = TITLE_REGION_SUFFIX_RE.search(title.strip())
    if suffix:
        return REGION_SUFFIX_MAP.get(suffix.group(1).upper())
    origin = str(product.get("origin") or "").upper()
    if origin:
        return ORIGIN_REGION_MAP.get(origin)
    return None


def is_cex_game_product(product: dict[str, Any]) -> bool:
    return is_likely_game_product(product)


def match_cex_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> CexMatchResult:
    return match_catalog_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
        infer_listing_region=infer_cex_region,
        is_valid_product=is_cex_game_product,
    )


def best_cex_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> tuple[dict[str, Any] | None, str | None]:
    result = match_cex_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
    )
    if result.ambiguous or not result.game:
        return None, None
    return result.game, result.matched_reference


def pick_best_cex_rows(matches: dict[str, list[dict[str, Any]]]) -> dict[str, dict[str, Any]]:
    chosen: dict[str, dict[str, Any]] = {}
    for catalog_id, rows in matches.items():
        usable = [r for r in rows if r.get("sellPriceEur") is not None or r.get("cashPriceEur") is not None]
        if not usable:
            continue

        def sort_key(row: dict[str, Any]) -> float:
            sell = row.get("sellPriceEur")
            return float(sell) if sell is not None else float(row.get("cashPriceEur") or 0)

        chosen[catalog_id] = sorted(usable, key=sort_key)[0]
    return chosen


def product_to_ingest_row(
    product: dict[str, Any],
    catalog_id: str,
    *,
    catalog_region: str,
    matched_reference: str | None = None,
    match_method: str = "title",
    match_score: float | None = None,
    match_margin: float | None = None,
    match_alternatives: list[dict[str, Any]] | None = None,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    sell = product.get("sellPriceEur")
    cash = product.get("cashPriceEur")
    if sell is None and cash is None:
        return {}

    title = product_title(product)
    listing_region = (catalog_region or infer_cex_region(product) or "PAL España").strip()
    evidence = ["retail_trusted_es"]
    if matched_reference:
        evidence.append("sku_regional")

    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "sellPriceEur": round(float(sell), 2) if sell is not None else None,
        "cashPriceEur": round(float(cash), 2) if cash is not None else None,
        "productUrl": str(product.get("productUrl") or ""),
        "listingRegion": listing_region,
        "regionVerified": True,
        "regionEvidence": evidence,
        "externalId": str(product.get("boxId") or ""),
        "title": title,
        "matchMethod": match_method,
    }
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
    bucket = infer_condition_bucket(title, condition_raw=str(product.get("conditionRaw") or ""))
    if bucket:
        row["condition"] = bucket
    row["source"] = "cex"
    attach_image_urls(row, product, "cex")
    return row


__all__ = [
    "AI_MIN_CONFIDENCE",
    "AUTO_MARGIN_MIN",
    "AUTO_SCORE_HIGH",
    "AUTO_SCORE_MIN",
    "CexMatchResult",
    "best_cex_match",
    "infer_cex_region",
    "is_cex_game_product",
    "match_cex_product",
    "pick_best_cex_rows",
    "product_to_ingest_row",
]
