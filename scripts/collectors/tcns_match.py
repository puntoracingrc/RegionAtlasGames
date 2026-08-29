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
    r"\((SP|PS|ES|ESP|EU|UK|JP|FR|US|USA|DE|IT|PL|AS|JAP)\)\s*$",
    re.I,
)

GAME_KEY_CARD_BEFORE_PLATFORM_RE = re.compile(
    r"\bKC\b(?=\s+(?:Nintendo\s+)?Switch\s*2\b)",
    re.I,
)
GAME_KEY_CARD_AFTER_PLATFORM_RE = re.compile(
    r"(\b(?:Nintendo\s+)?Switch\s*2\b)\s+KC\b",
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
    "PS": "PAL España",
    "ES": "PAL España",
    "ESP": "PAL España",
    "EU": "PAL Europa",
    "UK": "PAL UK/ENG",
    "JP": "Japón",
    "JAP": "Japón",
    "US": "USA",
    "USA": "USA",
    "FR": "PAL Francia",
    "DE": "PAL Alemania",
    "IT": "PAL Italia",
    "PL": "PAL Portugal",
    "AS": "Asia",
}

CONDITION_MAP: list[tuple[str, str]] = [
    ("incompleto", "used"),
    ("completo", "cib"),
    ("a estrenar", "sealed"),
    ("nuevo", "sealed"),
    ("excelente", "cib"),
    ("segunda mano", "used"),
]


def _decoded_tcns_title(value: str) -> str:
    text = str(value or "")
    for _ in range(2):
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
    return text


def tcns_region_suffix_code(value: str) -> str | None:
    suffix = TITLE_REGION_SUFFIX_RE.search(_decoded_tcns_title(value).strip())
    return suffix.group(1).upper() if suffix else None


def tcns_is_game_key_card(value: str, platform_slug: str = "") -> bool:
    text = _decoded_tcns_title(value)
    if platform_slug and platform_slug != "switch2":
        return False
    return bool(
        GAME_KEY_CARD_BEFORE_PLATFORM_RE.search(text)
        or GAME_KEY_CARD_AFTER_PLATFORM_RE.search(text)
    )


def tcns_display_title(value: str, platform_slug: str) -> str:
    text = _decoded_tcns_title(value)
    text = TITLE_REGION_SUFFIX_RE.sub("", text)
    if tcns_is_game_key_card(text, platform_slug):
        text = GAME_KEY_CARD_BEFORE_PLATFORM_RE.sub("", text)
        text = GAME_KEY_CARD_AFTER_PLATFORM_RE.sub(r"\1", text)
    for label in sorted(PLATFORM_LABELS.get(platform_slug, (platform_slug,)), key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(label)}\b", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip(" -_/\t\r\n")


def tcns_listing_metadata(value: str, platform_slug: str) -> dict[str, Any]:
    region_code = tcns_region_suffix_code(value)
    return {
        "displayTitle": tcns_display_title(value, platform_slug),
        "sourceRegionCode": region_code,
        "sourceRegionLabel": REGION_SUFFIX_MAP.get(region_code or ""),
        "gameKeyCard": tcns_is_game_key_card(value, platform_slug),
        "fullySpanishVersion": region_code in {"SP", "PS", "ES", "ESP"},
    }


def canonical_tcns_title(value: str, platform_slug: str) -> str:
    text = tcns_display_title(value, platform_slug)
    text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode("ascii")
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def infer_tcns_region(title: str) -> str | None:
    suffix_code = tcns_region_suffix_code(title)
    if suffix_code:
        return REGION_SUFFIX_MAP.get(suffix_code)
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
    platform_slug = str(catalog_id).partition("-")[0]
    metadata = tcns_listing_metadata(title, platform_slug)
    region_evidence = ["listing_title_region", "seller_states_region"]
    if metadata["sourceRegionCode"]:
        region_evidence.insert(0, f"tcns_suffix_{str(metadata['sourceRegionCode']).lower()}")
    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "todoconsolas",
        "retailPriceEur": round(float(price), 2),
        "priceEur": round(float(price), 2),
        "listingRegion": listing_region,
        "regionVerified": True,
        "regionEvidence": region_evidence,
        "productUrl": str(product.get("productUrl") or ""),
        "condition": infer_tcns_condition(str(product.get("conditionRaw") or ""), title),
        "inStock": True,
        "externalId": str(product.get("externalId") or ""),
        "title": title,
        "matchMethod": match_method,
        **metadata,
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
    "tcns_display_title",
    "tcns_is_game_key_card",
    "tcns_listing_metadata",
    "tcns_region_suffix_code",
]
