"""Matching catálogo ↔ productos Kaoto Store."""

from __future__ import annotations

import re
from html import unescape
from typing import Any

from collectors.catalog_match import CatalogMatchResult, match_catalog_product, product_title
from collectors.jgo_match import pick_best_product_rows, product_core_title
from collectors.listing_images import attach_image_urls
from collectors.reference_match import product_search_text

KAOTO_PLATFORM_COLLECTIONS: dict[str, str] = {
    "nes": "nintendo-nes",
    "snes": "super-nintendo",
    "n64": "nintendo-64",
    "gameboy": "game-boy-game-boy-color",
    "gamecube": "gamecube",
    "wii": "wii",
    "ds": "nintendo-ds",
    "3ds": "nintendo-3ds",
    "megadrive": "mega-drive",
    "sega32x": "32x",
    "megacd": "mega-cd",
    "saturn": "saturn",
    "dreamcast": "dreamcast",
    "gamegear": "game-gear",
    "neogeo": "neo-geo-aes",
    "neogeocd": "neo-geo-cd",
    "neogeopocket": "neo-geo-pocket-color",
    "ps1": "playstation",
    "ps2": "playstation-2",
    "ps3": "playstation-3",
    "ps4": "playstation-4",
}

# Kaoto vende import JP (y algún USA); no encaja con filas PAL ES/EU del catálogo.
KAOTO_CATALOG_REGIONS = frozenset({"Japón", "USA"})

PLATFORM_SUFFIX_RE = re.compile(
    r"\s+(saturn|dreamcast|mega drive|megadrive|genesis|snes|super nintendo|nes|nintendo 64|n64|"
    r"game boy|gameboy|gamecube|wii|playstation|ps1|ps2|ps3|ps4|game gear|neo geo|32x|"
    r"switch|3ds|ds)\b.*$",
    re.I,
)


def normalize_kaoto_title(title: str) -> str:
    t = unescape(title)
    t = re.sub(r"\(.*importaci[oó]n[^)]*\)", "", t, flags=re.I)
    t = PLATFORM_SUFFIX_RE.sub("", t)
    return product_core_title(t)


def infer_kaoto_region_product(product: dict[str, Any]) -> str | None:
    region = str(product.get("listingRegion") or "").strip()
    return region or "Japón"


def match_kaoto_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> CatalogMatchResult:
    title = str(product.get("title") or "")
    adapted = dict(product)
    adapted["title"] = normalize_kaoto_title(title)
    adapted["_referenceText"] = product_search_text(
        {
            "name": title,
            "description": title,
            "short_description": "",
            "sku": "",
        }
    )
    return match_catalog_product(
        adapted,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
        infer_listing_region=infer_kaoto_region_product,
    )


def best_kaoto_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> tuple[dict[str, Any] | None, str | None]:
    result = match_kaoto_product(
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
    evidence = ["listing_title_region", "seller_states_region"]
    if matched_reference:
        evidence.append("sku_regional")
    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "kaotostore",
        "retailPriceEur": round(float(price), 2),
        "priceEur": round(float(price), 2),
        "listingRegion": str(product.get("listingRegion") or "Japón"),
        "regionVerified": True,
        "regionEvidence": evidence,
        "productUrl": str(product.get("productUrl") or ""),
        "condition": str(product.get("condition") or "unknown"),
        "inStock": bool(product.get("inStock", True)),
        "externalId": str(product.get("externalId") or ""),
        "title": product_title(product),
        "matchMethod": match_method,
        **({"matchedReference": matched_reference} if matched_reference else {}),
    }
    if match_score is not None:
        row["matchScore"] = round(float(match_score), 3)
    if match_margin is not None:
        row["matchMargin"] = round(float(match_margin), 3)
    if match_alternatives:
        row["matchAlternatives"] = match_alternatives
    if ai_confidence is not None:
        row["aiConfidence"] = round(float(ai_confidence), 3)
    attach_image_urls(row, product, "kaoto")
    return row


__all__ = [
    "KAOTO_PLATFORM_COLLECTIONS",
    "best_kaoto_match",
    "infer_kaoto_region_product",
    "match_kaoto_product",
    "pick_best_product_rows",
    "product_to_ingest_row",
]
