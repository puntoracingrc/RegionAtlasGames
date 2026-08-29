"""Política fail-closed para aplicar precios TodoConsolas al catálogo."""

from __future__ import annotations

import html
import re
import unicodedata
from typing import Any

from collectors.region_inference import normalize_region
from collectors.tcns_match import infer_tcns_region_product

POLICY_VERSION = "tcns_exact_title_region_used_v1"
MIN_PRICE_EUR = 3.0
MAX_PRICE_EUR = 1000.0
MIN_EXISTING_PRICE_RATIO = 0.5
MAX_EXISTING_PRICE_RATIO = 2.0

REGION_SUFFIX_RE = re.compile(r"\s*\((?:SP|ES|EU|UK|JP|JAP|US|USA|FR|DE|IT)\)\s*$", re.I)
PLATFORM_LABELS: dict[str, tuple[str, ...]] = {
    "ps1": ("ps1", "playstation 1"),
    "ps2": ("ps2", "playstation 2"),
    "ps3": ("ps3", "playstation 3"),
    "ps4": ("ps4", "playstation 4"),
    "ps5": ("ps5", "playstation 5"),
    "switch": ("nintendo switch", "switch"),
    "switch2": ("nintendo switch 2", "switch 2"),
}


def canonical_tcns_title(value: str, platform_slug: str) -> str:
    text = str(value or "")
    for _ in range(2):
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
    text = REGION_SUFFIX_RE.sub("", text)
    text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode("ascii")
    text = text.replace("&", " and ")
    for label in sorted(PLATFORM_LABELS.get(platform_slug, (platform_slug,)), key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(label)}\b", " ", text, flags=re.I)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _price(value: Any) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    if price < MIN_PRICE_EUR or price > MAX_PRICE_EUR:
        return None
    return round(price, 2)


def _price_change_is_safe(game: dict[str, Any], price: float) -> bool:
    previous = _price(game.get("tcnsRetailPrice"))
    if previous is None:
        return True
    ratio = price / previous
    return MIN_EXISTING_PRICE_RATIO <= ratio <= MAX_EXISTING_PRICE_RATIO


def tcns_auto_match_decision(
    product: dict[str, Any],
    result,
    platform_slug: str,
) -> tuple[bool, str]:
    condition = str(product.get("conditionRaw") or "").strip().casefold()
    if condition != "segunda mano":
        return False, "condition_not_plain_preowned"
    price = _price(product.get("priceEur"))
    if price is None:
        return False, "price_out_of_range"
    if result.ambiguous or not result.game:
        return False, "catalog_match_not_unique"

    listing_region = infer_tcns_region_product(product)
    catalog_region = str(result.game.get("region") or "").strip()
    if not listing_region:
        return False, "listing_region_missing"
    if normalize_region(listing_region) != normalize_region(catalog_region):
        return False, "catalog_region_not_exact"

    if result.match_method == "reference":
        if not result.matched_reference:
            return False, "reference_missing"
    else:
        source_title = canonical_tcns_title(str(product.get("title") or ""), platform_slug)
        catalog_title = canonical_tcns_title(str(result.game.get("title") or ""), platform_slug)
        if not source_title or source_title != catalog_title:
            return False, "catalog_title_not_exact"
        try:
            score = float(result.match_score or 0)
            margin = float(result.margin or 0)
        except (TypeError, ValueError):
            return False, "match_metadata_invalid"
        if score < 0.55 or margin < 0.15:
            return False, "match_confidence_too_low"

    if not _price_change_is_safe(result.game, price):
        return False, "price_change_requires_review"
    return True, POLICY_VERSION


def tcns_row_is_auto_approved(row: dict[str, Any], game: dict[str, Any]) -> bool:
    if str(row.get("source") or "").strip().lower() != "todoconsolas":
        return False
    if row.get("autoApproved") is not True or row.get("acceptancePolicy") != POLICY_VERSION:
        return False
    if str(row.get("condition") or "").strip().lower() != "preowned":
        return False
    if row.get("regionVerified") is not True:
        return False
    listing_region = str(row.get("listingRegion") or "").strip()
    catalog_region = str(game.get("region") or "").strip()
    if not listing_region or normalize_region(listing_region) != normalize_region(catalog_region):
        return False
    price = _price(row.get("retailPriceEur") if row.get("retailPriceEur") is not None else row.get("priceEur"))
    if price is None or not _price_change_is_safe(game, price):
        return False
    evidence = {str(item) for item in (row.get("regionEvidence") or [])}
    if "listing_title_region" not in evidence:
        return False

    method = str(row.get("matchMethod") or "").strip().lower()
    if method == "reference":
        return bool(row.get("matchedReference"))
    if method != "title":
        return False
    if canonical_tcns_title(str(row.get("title") or ""), str(game.get("platformSlug") or "")) != canonical_tcns_title(
        str(game.get("title") or ""), str(game.get("platformSlug") or "")
    ):
        return False
    try:
        return float(row.get("matchScore") or 0) >= 0.55 and float(row.get("matchMargin") or 0) >= 0.15
    except (TypeError, ValueError):
        return False


__all__ = [
    "POLICY_VERSION",
    "canonical_tcns_title",
    "tcns_auto_match_decision",
    "tcns_row_is_auto_approved",
]
