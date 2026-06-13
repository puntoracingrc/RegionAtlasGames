"""Matching catálogo unificado — referencia, título (score+margen), IA ambigua."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable

from collectors.jgo_match import (
    catalog_match_title,
    product_core_title,
    regions_compatible,
    token_similarity,
)
from collectors.reference_match import extract_references_from_text

NON_GAME_RE = re.compile(
    r"\b("
    r"cable|consola|console|controller|mando|adaptador|adapter|"
    r"memory card|visual memory|power supply|av cable|scart|"
    r"merchandising|figura|poster|"
    r"consola|adaptador|cable|mando|"
    r"pistola|cat[aá]logo|vhs|poster|mapa|"
    r"solamente la caja|solo la caja|solo caja|sin juego|caja vac[ií]a"
    r")\b",
    re.I,
)

# Manual/instrucciones sueltos — no «completo con manual de instrucciones».
MANUAL_ONLY_RE = re.compile(
    r"\b("
    r"solo el manual|solo manual|solamente el manual|solamente manual|"
    r"solo las instrucciones|solamente las instrucciones|instrucciones solamente|"
    r"solo instrucciones|solamente instrucciones|"
    r"pack manuales|pack de manuales|"
    r"manual original|manual nintendo|"
    r"vendo manual|venta de manual|se vende manual"
    r")\b",
    re.I,
)
MANUAL_TITLE_RE = re.compile(r"^\s*manual\b", re.I)


def is_manual_only_listing(text: str, *, title: str = "") -> bool:
    if title.strip() and MANUAL_TITLE_RE.search(title.strip()):
        return True
    return bool(MANUAL_ONLY_RE.search(text))

ROMAN_NUMERALS: dict[str, int] = {
    "i": 1,
    "ii": 2,
    "iii": 3,
    "iv": 4,
    "v": 5,
    "vi": 6,
    "vii": 7,
    "viii": 8,
    "ix": 9,
    "x": 10,
}

AUTO_SCORE_HIGH = 0.75
AUTO_SCORE_MIN = 0.55
AUTO_MARGIN_MIN = 0.15
CANDIDATE_MIN_SCORE = 0.42
AI_MIN_CONFIDENCE = 0.85


@dataclass
class RankedCandidate:
    game: dict[str, Any]
    score: float
    raw_score: float


@dataclass
class CatalogMatchResult:
    game: dict[str, Any] | None = None
    matched_reference: str | None = None
    match_method: str = "none"
    match_score: float | None = None
    margin: float | None = None
    ambiguous: bool = False
    alternatives: list[dict[str, Any]] = field(default_factory=list)
    ai_confidence: float | None = None


def product_title(product: dict[str, Any]) -> str:
    for key in ("title", "name", "boxName"):
        val = str(product.get(key) or "").strip()
        if val:
            return val
    return ""


def product_reference_text(product: dict[str, Any]) -> str:
    extra = str(product.get("_referenceText") or "").strip()
    title = product_title(product)
    return f"{title} {extra}".strip() if extra else title


def is_likely_game_product(product: dict[str, Any]) -> bool:
    title = product_title(product)
    if len(title.strip()) < 4:
        return False
    if MANUAL_ONLY_RE.search(title) or is_manual_only_listing(title, title=title):
        return False
    return not NON_GAME_RE.search(title)


def _norm_token(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    t = t.encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^\w\s-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def extract_edition_numbers(text: str) -> set[int]:
    t = _norm_token(text)
    nums: set[int] = set()
    for match in re.finditer(r"\b(19|20)\d{2}\b", t):
        nums.add(int(match.group(0)))
    for match in re.finditer(r"\b(\d+)\b", t):
        n = int(match.group(1))
        if n <= 20:
            nums.add(n)
    for word in t.split():
        if word in ROMAN_NUMERALS:
            nums.add(ROMAN_NUMERALS[word])
    return nums


def _sequel_numbers(nums: set[int]) -> set[int]:
    return {n for n in nums if n <= 10}


def edition_numbers_conflict(product_core: str, catalog_title: str) -> bool:
    core_nums = _sequel_numbers(extract_edition_numbers(product_core))
    cat_nums = _sequel_numbers(extract_edition_numbers(catalog_title))
    if not core_nums and not cat_nums:
        return False
    if core_nums == cat_nums:
        return False
    if core_nums and cat_nums and core_nums.isdisjoint(cat_nums):
        return True
    if bool(core_nums) != bool(cat_nums):
        return True
    return False


def _region_rank(catalog_region: str, listing_region: str | None) -> int:
    if not listing_region:
        return 0
    cat = catalog_region.strip().lower()
    listing = listing_region.strip().lower()
    if cat == listing:
        return 3
    if cat in ("pal europa", "pal uk/eng", "pal alemania") and listing in (
        "pal españa",
        "españa",
        "pal europa",
        "pal uk/eng",
        "pal alemania",
    ):
        return 2
    if regions_compatible(catalog_region, listing_region):
        return 1
    return 0


def _best_title_score(game: dict[str, Any], core: str) -> float:
    best = 0.0
    for candidate_title in filter(
        None,
        [game.get("title"), game.get("titlePc"), catalog_match_title(str(game.get("title") or ""))],
    ):
        best = max(best, token_similarity(str(candidate_title), core))
    return best


def rank_catalog_candidates(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    listing_region: str | None,
    min_score: float = CANDIDATE_MIN_SCORE,
) -> list[RankedCandidate]:
    title = product_title(product)
    core = product_core_title(title)

    if listing_region:
        pool = [
            g
            for g in catalog_games
            if g.get("platformSlug") == platform_slug
            and g.get("listingStatus") != "excluded"
            and regions_compatible(str(g.get("region") or ""), listing_region)
        ]
    else:
        pool = [
            g
            for g in catalog_games
            if g.get("platformSlug") == platform_slug and g.get("listingStatus") != "excluded"
        ]

    ranked: list[RankedCandidate] = []
    for game in pool:
        raw = _best_title_score(game, core)
        if raw < min_score:
            continue
        if edition_numbers_conflict(core, str(game.get("title") or "")):
            continue
        boost = _region_rank(str(game.get("region") or ""), listing_region) * 0.01
        ranked.append(RankedCandidate(game=game, score=raw + boost, raw_score=raw))

    ranked.sort(
        key=lambda item: (
            -item.score,
            -_region_rank(str(item.game.get("region") or ""), listing_region),
            str(item.game.get("id") or ""),
        )
    )
    return ranked


def _alternatives_payload(ranked: list[RankedCandidate], *, limit: int = 5) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in ranked[:limit]:
        out.append(
            {
                "catalogId": str(item.game.get("id") or ""),
                "title": str(item.game.get("title") or ""),
                "region": str(item.game.get("region") or ""),
                "score": round(item.raw_score, 3),
            }
        )
    return out


def _auto_accept(score: float, margin: float, *, sequel_conflict: bool) -> bool:
    if sequel_conflict:
        return False
    if score >= AUTO_SCORE_HIGH:
        return True
    return score >= AUTO_SCORE_MIN and margin >= AUTO_MARGIN_MIN


def match_catalog_product(
    product: dict[str, Any],
    catalog_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    min_score: float = CANDIDATE_MIN_SCORE,
    infer_listing_region: Callable[[dict[str, Any]], str | None] | None = None,
    is_valid_product: Callable[[dict[str, Any]], bool] | None = None,
) -> CatalogMatchResult:
    validator = is_valid_product or is_likely_game_product
    if not validator(product):
        return CatalogMatchResult()

    title = product_title(product)
    listing_region = infer_listing_region(product) if infer_listing_region else None

    refs = extract_references_from_text(product_reference_text(product))
    if ref_to_ids and refs:
        games_by_id = {str(g["id"]): g for g in catalog_games}
        for ref in refs:
            for catalog_id in ref_to_ids.get(ref, []):
                game = games_by_id.get(catalog_id)
                if not game or game.get("platformSlug") != platform_slug:
                    continue
                if listing_region and not regions_compatible(
                    str(game.get("region") or ""), listing_region
                ):
                    continue
                return CatalogMatchResult(
                    game=game,
                    matched_reference=ref,
                    match_method="reference",
                    match_score=1.0,
                    margin=1.0,
                    ai_confidence=0.93,
                )

    ranked = rank_catalog_candidates(
        product,
        catalog_games,
        platform_slug,
        listing_region=listing_region,
        min_score=min_score,
    )
    if not ranked:
        return CatalogMatchResult()

    top = ranked[0]
    second_score = ranked[1].raw_score if len(ranked) > 1 else 0.0
    margin = round(top.raw_score - second_score, 3)
    alternatives = _alternatives_payload(ranked)
    sequel_conflict = edition_numbers_conflict(product_core_title(title), str(top.game.get("title") or ""))

    if _auto_accept(top.raw_score, margin, sequel_conflict=sequel_conflict):
        return CatalogMatchResult(
            game=top.game,
            match_method="title",
            match_score=round(top.raw_score, 3),
            margin=margin,
            alternatives=alternatives,
            ai_confidence=0.88 if top.raw_score >= AUTO_SCORE_HIGH else 0.86,
        )

    return CatalogMatchResult(
        game=top.game,
        ambiguous=True,
        match_score=round(top.raw_score, 3),
        margin=margin,
        alternatives=alternatives,
    )


__all__ = [
    "AI_MIN_CONFIDENCE",
    "AUTO_MARGIN_MIN",
    "AUTO_SCORE_HIGH",
    "AUTO_SCORE_MIN",
    "CANDIDATE_MIN_SCORE",
    "CatalogMatchResult",
    "RankedCandidate",
    "edition_numbers_conflict",
    "is_likely_game_product",
    "match_catalog_product",
    "product_title",
    "rank_catalog_candidates",
]
