"""Matching catálogo ↔ productos Chollo Games."""

from __future__ import annotations

from typing import Any

from collectors.jgo_match import (
    pick_best_product_rows,
    product_core_title,
    regions_compatible,
    token_similarity,
    catalog_match_title,
)
from collectors.reference_match import extract_references_from_text

CHOLLO_PLATFORM_CATEGORIES: dict[str, str] = {
    "n64": "45-nintendo-64-importacion",
    "gamecube": "29-gamecube-importacion",
    "megadrive": "36-megadrive-importacion",
    "dreamcast": "20-dreamcast-importacion",
    "saturn": "65-saturn-importacion",
    "wii": "48-nintendo-wii-importacion",
    "ps1": "55-playstation-importacion",
    "ps2": "57-playstation-2-importacion",
    "ps3": "59-playstation-3-importacion",
}


def product_as_match_input(product: dict[str, Any]) -> dict[str, Any]:
    """Reservado por si adaptamos matchers WooCommerce en el futuro."""
    title = str(product.get("title") or "")
    return {"name": title, "categories": []}


def best_chollo_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> tuple[dict[str, Any] | None, str | None]:
    listing_region = str(product.get("listingRegion") or "")
    title = str(product.get("title") or "")

    refs = extract_references_from_text(title)
    if ref_to_ids and refs:
        games_by_id = {str(g["id"]): g for g in catalog_games}
        for ref in refs:
            for catalog_id in ref_to_ids.get(ref, []):
                game = games_by_id.get(catalog_id)
                if not game or game.get("platformSlug") != platform_slug:
                    continue
                if regions_compatible(str(game.get("region") or ""), listing_region):
                    return game, ref

    product_region = listing_region or "Japón"
    candidates = [
        g
        for g in catalog_games
        if g.get("platformSlug") == platform_slug
        and g.get("listingStatus") != "excluded"
        and regions_compatible(str(g.get("region") or ""), product_region)
    ]
    if not candidates:
        return None, None

    product_core = product_core_title(title)
    best: tuple[float, dict[str, Any]] | None = None
    for game in candidates:
        for candidate_title in filter(
            None,
            [game.get("title"), game.get("titlePc"), catalog_match_title(str(game.get("title") or ""))],
        ):
            score = token_similarity(str(candidate_title), product_core)
            if score >= min_score and (best is None or score > best[0]):
                best = (score, game)
    if best:
        return best[1], None
    return None, None


def product_to_ingest_row(
    product: dict[str, Any],
    catalog_id: str,
    *,
    matched_reference: str | None = None,
    match_method: str = "title",
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
        "title": str(product.get("title") or ""),
        "matchMethod": match_method,
    }
    if matched_reference:
        row["matchedReference"] = matched_reference
        row["regionEvidence"].append("sku_regional")
    return row


__all__ = [
    "CHOLLO_PLATFORM_CATEGORIES",
    "best_chollo_match",
    "pick_best_product_rows",
    "product_to_ingest_row",
]
