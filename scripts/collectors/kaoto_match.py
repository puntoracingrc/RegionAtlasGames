"""Matching catálogo ↔ productos Kaoto Store."""

from __future__ import annotations

import re
from html import unescape
from typing import Any

from collectors.jgo_match import (
    catalog_match_title,
    pick_best_product_rows,
    product_core_title,
    regions_compatible,
    token_similarity,
)
from collectors.reference_match import extract_references_from_text, product_search_text

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


def best_kaoto_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
) -> tuple[dict[str, Any] | None, str | None]:
    listing_region = str(product.get("listingRegion") or "")
    title = str(product.get("title") or "")

    search_text = product_search_text(
        {
            "name": title,
            "description": title,
            "short_description": "",
            "sku": "",
        }
    )
    refs = extract_references_from_text(search_text)
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

    product_core = normalize_kaoto_title(title)
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
    evidence = ["listing_title_region", "seller_states_region"]
    if matched_reference:
        evidence.append("sku_regional")
    return {
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
        "title": str(product.get("title") or ""),
        "matchMethod": match_method,
        **({"matchedReference": matched_reference} if matched_reference else {}),
    }


__all__ = [
    "KAOTO_PLATFORM_COLLECTIONS",
    "best_kaoto_match",
    "pick_best_product_rows",
    "product_to_ingest_row",
]
