"""Matching catálogo ↔ productos Japan Game Online."""

from __future__ import annotations

import re
import unicodedata
from typing import Any
from collectors.jgo_client import product_in_stock, product_price_eur
from collectors.listing_images import attach_image_urls
from collectors import platform_sources as ps
from collectors.reference_match import (
    extract_references_from_text,
    product_search_text,
)
from collectors.region_inference import regions_match as catalog_regions_compatible

JGO_PLATFORM_CATEGORIES = ps.legacy_jgo_categories()

STOPWORDS = {
    "the",
    "and",
    "for",
    "juego",
    "juegos",
    "game",
    "video",
    "version",
    "edition",
    "original",
    "only",
    "cart",
    "box",
    "complete",
}

REGION_SUFFIX_RE = re.compile(
    r"\s+(japón|japan|usa|pal europa|pal españa|españa|pal uk|europa)\s*$",
    re.I,
)

JAPAN_TITLE_RE = re.compile(r"\b(japan|japanese|jap|japón|ntsc\s*j)\b", re.I)
USA_TITLE_RE = re.compile(r"\b(usa|u\.s\.|us version|ntsc\s*u)\b", re.I)
PAL_TITLE_RE = re.compile(r"\b(pal|europe|european|españa|spanish|castellano)\b", re.I)

CONDITION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("sealed", re.compile(r"\b(brand new sealed|new sealed|precintado|sealed)\b", re.I)),
    ("no_manual", re.compile(r"\b(no manual|sin manual)\b", re.I)),
    ("used", re.compile(r"\b(used|usado|tested|probado|loose)\b", re.I)),
]

CONDITION_RANK = {"used": 1, "no_manual": 2, "cib": 3, "sealed": 4, "unknown": 5}

JGO_GAME_CATEGORIES = {slug for slugs in JGO_PLATFORM_CATEGORIES.values() for slug in slugs}

NON_GAME_RE = re.compile(
    r"\b(cable|consola|console|controller|mando|adaptador|adapter|"
    r"memory card|visual memory|power supply|av cable|scart|taza|merchandising)\b",
    re.I,
)


def is_game_product(product: dict[str, Any]) -> bool:
    title = str(product.get("name") or "")
    if NON_GAME_RE.search(title):
        return False
    slugs = {str(c.get("slug") or "").lower() for c in product.get("categories") or []}
    return bool(slugs.intersection(JGO_GAME_CATEGORIES))


def norm_title(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    t = t.encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^\w\s-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def catalog_match_title(title: str) -> str:
    return REGION_SUFFIX_RE.sub("", title).strip()


def tokens(title: str) -> set[str]:
    return {w for w in norm_title(title).split() if w not in STOPWORDS and len(w) > 1}


def token_similarity(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


PLATFORM_NOISE = re.compile(
    r"\b(sega|nintendo|sony|saturn|dreamcast|megadrive|mega drive|genesis|"
    r"super famicom|snes|nes|famicom|game boy|gameboy|neo geo|neogeo|"
    r"playstation|ps1|ps2|gamecube|n64|nintendo 64|game gear|32x|"
    r"mega cd|pc engine|pce|ngp|ngpc|aes|mvs|cd)\b",
    re.I,
)


def infer_product_region(title: str) -> str | None:
    if USA_TITLE_RE.search(title):
        return "USA"
    if PAL_TITLE_RE.search(title):
        return "PAL Europa"
    if JAPAN_TITLE_RE.search(title):
        return "Japón"
    # Tienda especializada en import JP: sin USA/PAL explícito → Japón
    return "Japón"


def product_core_title(title: str) -> str:
    t = norm_title(title)
    t = PLATFORM_NOISE.sub(" ", t)
    for label, pattern in CONDITION_PATTERNS:
        t = pattern.sub(" ", t)
    t = re.sub(r"\b(no manual|sin manual|tested|probado|original|complete|cib)\b", " ", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip()


def infer_condition(title: str) -> str:
    for label, pattern in CONDITION_PATTERNS:
        if pattern.search(title):
            return label
    return "unknown"


def product_platform_slug(categories: list[dict[str, Any]]) -> str | None:
    slugs = {str(c.get("slug") or "").lower() for c in categories}
    for platform_slug, cat_slugs in JGO_PLATFORM_CATEGORIES.items():
        if slugs.intersection(cat_slugs):
            return platform_slug
    return None


def regions_compatible(catalog_region: str, product_region: str | None) -> bool:
    if not product_region:
        return False
    return catalog_regions_compatible(catalog_region, product_region)


def match_by_reference(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    ref_to_ids: dict[str, list[str]],
) -> tuple[dict[str, Any] | None, str | None]:
    text = product_search_text(product)
    refs = extract_references_from_text(text)
    if not refs:
        return None, None

    games_by_id = {str(g["id"]): g for g in catalog_games}
    candidates: list[dict[str, Any]] = []
    matched_ref: str | None = None

    for ref in refs:
        for catalog_id in ref_to_ids.get(ref, []):
            game = games_by_id.get(catalog_id)
            if not game or game.get("listingStatus") == "excluded":
                continue
            product_region = infer_product_region(str(product.get("name") or ""))
            if product_region and not regions_compatible(str(game.get("region") or ""), product_region):
                continue
            candidates.append(game)
            matched_ref = ref

    if not candidates:
        return None, None

    unique = {str(g["id"]): g for g in candidates}
    if len(unique) == 1:
        return next(iter(unique.values())), matched_ref

    title = str(product.get("name") or "")
    product_core = product_core_title(title)
    best: tuple[float, dict[str, Any]] | None = None
    for game in unique.values():
        for candidate_title in filter(
            None,
            [game.get("title"), game.get("titlePc"), catalog_match_title(str(game.get("title") or ""))],
        ):
            score = token_similarity(str(candidate_title), product_core)
            if best is None or score > best[0]:
                best = (score, game)
    if best and best[0] >= 0.35:
        return best[1], matched_ref
    return None, matched_ref


def infer_jgo_region_product(product: dict[str, Any]) -> str | None:
    return infer_product_region(str(product.get("name") or ""))


def match_jgo_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.42,
):
    from collectors.catalog_match import CatalogMatchResult, match_catalog_product

    if not is_game_product(product):
        return CatalogMatchResult()
    if product_platform_slug(product.get("categories") or []) != platform_slug:
        return CatalogMatchResult()
    adapted = dict(product)
    adapted["_referenceText"] = product_search_text(product)
    return match_catalog_product(
        adapted,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
        infer_listing_region=infer_jgo_region_product,
        is_valid_product=is_game_product,
    )


def best_catalog_match(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = 0.45,
) -> tuple[dict[str, Any] | None, str | None]:
    platform_slug = product_platform_slug(product.get("categories") or [])
    if not platform_slug:
        return None, None
    result = match_jgo_product(
        product,
        catalog_games,
        platform_slug,
        ref_to_ids=ref_to_ids,
        min_score=min_score,
    )
    if result.ambiguous or not result.game:
        return None, None
    return result.game, result.matched_reference


def pick_best_product_rows(
    matches: dict[str, list[dict[str, Any]]],
) -> dict[str, dict[str, Any]]:
    """Elige una fila JGO por catalogId (stock + condición usada preferida)."""
    chosen: dict[str, dict[str, Any]] = {}

    for catalog_id, rows in matches.items():
        usable = [r for r in rows if r.get("priceEur") and r.get("inStock", True)]
        if not usable:
            usable = [r for r in rows if r.get("priceEur")]
        if not usable:
            continue

        def sort_key(row: dict[str, Any]) -> tuple[int, float]:
            cond = str(row.get("condition") or "unknown")
            rank = CONDITION_RANK.get(cond, 99)
            return (rank, float(row["priceEur"]))

        best = sorted(usable, key=sort_key)[0]
        chosen[catalog_id] = best

    return chosen


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
) -> dict[str, Any] | None:
    price = product_price_eur(product)
    if price is None:
        return None
    title = str(product.get("name") or "")
    region = infer_product_region(title) or "Japón"
    evidence = ["listing_title_region", "seller_states_region"]
    if matched_reference:
        evidence.append("sku_regional")
    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "japangameonline",
        "retailPriceEur": price,
        "priceEur": price,
        "listingRegion": region,
        "regionVerified": True,
        "regionEvidence": evidence,
        "productUrl": str(product.get("permalink") or ""),
        "condition": infer_condition(title),
        "inStock": product_in_stock(product),
        "externalId": str(product.get("id") or ""),
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
    attach_image_urls(row, product, "jgo")
    return row
