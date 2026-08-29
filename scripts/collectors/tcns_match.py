"""Matching catálogo ↔ productos TodoConsolas."""

from __future__ import annotations

import html
import re
import unicodedata
from typing import Any

from collectors.catalog_match import CatalogMatchResult, match_catalog_product, product_title
from collectors.jgo_match import pick_best_product_rows
from collectors.listing_images import attach_image_urls
from collectors.region_inference import detect_listing_region

TITLE_REGION_SUFFIX_RE = re.compile(
    r"\((SP|ES|EU|UK|JP|FR|US|USA|DE|IT|JAP)\)\s*$",
    re.I,
)

PLATFORM_LABELS: dict[str, tuple[str, ...]] = {
    "ps1": ("ps1", "playstation 1"),
    "ps2": ("ps2", "playstation 2"),
    "ps3": ("ps3", "playstation 3"),
    "ps4": ("ps4", "playstation 4"),
    "ps5": ("ps5", "playstation 5"),
    "switch": ("nintendo switch", "switch"),
    "switch2": ("nintendo switch 2", "switch 2"),
}

REGION_SUFFIX_MAP: dict[str, str] = {
    "SP": "PAL España",
    "ES": "PAL España",
    "EU": "PAL Europa",
    "UK": "PAL UK/ENG",
    "JP": "Japón",
    "JAP": "Japón",
    "US": "USA",
    "USA": "USA",
    "FR": "PAL Europa",
    "DE": "PAL Alemania",
    "IT": "PAL Europa",
}

CONDITION_MAP: list[tuple[str, str]] = [
    ("incompleto", "used"),
    ("completo", "cib"),
    ("a estrenar", "sealed"),
    ("nuevo", "sealed"),
    ("excelente", "cib"),
    ("segunda mano", "used"),
]


def canonical_tcns_title(value: str, platform_slug: str) -> str:
    text = str(value or "")
    for _ in range(2):
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
    text = TITLE_REGION_SUFFIX_RE.sub("", text)
    text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode("ascii")
    text = text.replace("&", " and ")
    for label in sorted(PLATFORM_LABELS.get(platform_slug, (platform_slug,)), key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(label)}\b", " ", text, flags=re.I)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def infer_tcns_region(title: str) -> str | None:
    suffix = TITLE_REGION_SUFFIX_RE.search(title.strip())
    if suffix:
        return REGION_SUFFIX_MAP.get(suffix.group(1).upper())
    return detect_listing_region(title)


def infer_tcns_region_product(product: dict[str, Any]) -> str | None:
    return infer_tcns_region(product_title(product))


def match_tcns_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> CatalogMatchResult:
    adapted = dict(product)
    adapted["title"] = canonical_tcns_title(product_title(product), platform_slug)
    return match_catalog_product(
        adapted,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
        infer_listing_region=lambda _product: infer_tcns_region_product(product),
    )


def best_tcns_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> tuple[dict[str, Any] | None, str | None]:
    result = match_tcns_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
    )
    if result.ambiguous or not result.game:
        return None, None
    return result.game, result.matched_reference


def infer_tcns_condition(condition_raw: str, title: str) -> str:
    text = f"{condition_raw} {title}".lower()
    for needle, label in CONDITION_MAP:
        if needle in text:
            return label
    return "unknown"


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
    title = product_title(product)
    listing_region = infer_tcns_region(title) or "PAL España"
    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "todoconsolas",
        "retailPriceEur": round(float(price), 2),
        "priceEur": round(float(price), 2),
        "listingRegion": listing_region,
        "regionVerified": True,
        "regionEvidence": ["listing_title_region", "seller_states_region"],
        "productUrl": str(product.get("productUrl") or ""),
        "condition": infer_tcns_condition(str(product.get("conditionRaw") or ""), title),
        "inStock": True,
        "externalId": str(product.get("externalId") or ""),
        "title": title,
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
    attach_image_urls(row, product, "todoconsolas")
    return row


__all__ = [
    "best_tcns_match",
    "canonical_tcns_title",
    "infer_tcns_region",
    "infer_tcns_region_product",
    "match_tcns_product",
    "pick_best_product_rows",
    "product_to_ingest_row",
]
