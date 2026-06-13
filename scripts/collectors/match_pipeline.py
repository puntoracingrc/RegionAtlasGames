"""Pipeline unificado de matching para todos los collectors."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from collectors.catalog_ai_match import ai_available, hydrate_cached_game, resolve_ambiguous_match
from collectors.catalog_match import CatalogMatchResult, is_likely_game_product, match_catalog_product


@dataclass
class MatchPipelineStats:
    products: int = 0
    unmatched: int = 0
    non_games: int = 0
    matched_by_ref: int = 0
    matched_by_title: int = 0
    matched_by_ai: int = 0
    ambiguous_skipped: int = 0
    rows: list[dict[str, Any]] = field(default_factory=list)


def run_match_pipeline(
    products: list[dict[str, Any]],
    platform_games: list[dict[str, Any]],
    platform_slug: str,
    *,
    source: str,
    ref_to_ids: dict[str, list[str]] | None,
    row_builder: Callable[[dict[str, Any], dict[str, Any], CatalogMatchResult], dict[str, Any] | None],
    infer_listing_region: Callable[[dict[str, Any]], str | None] | None = None,
    is_valid_product: Callable[[dict[str, Any]], bool] | None = None,
    use_ai: bool = True,
    use_match_cache: bool = True,
    pick_best: Callable[[dict[str, list[dict[str, Any]]]], dict[str, dict[str, Any]]] | None = None,
) -> MatchPipelineStats:
    stats = MatchPipelineStats(products=len(products))
    games_by_id = {str(g["id"]): g for g in platform_games}
    grouped: dict[str, list[dict[str, Any]]] = {}
    validator = is_valid_product or is_likely_game_product

    for product in products:
        if not validator(product):
            stats.non_games += 1
            continue

        result = match_catalog_product(
            product,
            platform_games,
            platform_slug,
            ref_to_ids=ref_to_ids,
            infer_listing_region=infer_listing_region,
            is_valid_product=validator,
        )

        if result.ambiguous:
            if use_ai:
                ai_result = resolve_ambiguous_match(
                    product,
                    result,
                    source=source,
                    platform_slug=platform_slug,
                    infer_listing_region=infer_listing_region,
                    use_cache=use_match_cache,
                )
                ai_result = hydrate_cached_game(ai_result, games_by_id) if ai_result else None
                if ai_result and ai_result.game:
                    result = ai_result
                else:
                    stats.ambiguous_skipped += 1
                    continue
            else:
                stats.ambiguous_skipped += 1
                continue

        if not result.game:
            stats.unmatched += 1
            continue

        game = games_by_id.get(str(result.game["id"]), result.game)
        row = row_builder(product, game, result)
        if not row:
            stats.unmatched += 1
            continue

        if result.match_method == "reference":
            stats.matched_by_ref += 1
        elif result.match_method == "ai":
            stats.matched_by_ai += 1
        else:
            stats.matched_by_title += 1

        grouped.setdefault(str(game["id"]), []).append(row)

    if pick_best:
        stats.rows = list(pick_best(grouped).values())
    else:
        for rows in grouped.values():
            stats.rows.extend(rows)

    return stats


def attach_match_metadata(row: dict[str, Any], result: CatalogMatchResult) -> None:
    row["matchMethod"] = result.match_method
    if result.match_score is not None:
        row["matchScore"] = round(float(result.match_score), 3)
    if result.margin is not None:
        row["matchMargin"] = round(float(result.margin), 3)
    if result.alternatives:
        row["matchAlternatives"] = result.alternatives
    if result.ai_confidence is not None:
        row["aiConfidence"] = round(float(result.ai_confidence), 3)
    if result.matched_reference:
        row["matchedReference"] = result.matched_reference


def print_match_stats(stats: MatchPipelineStats, *, label: str) -> None:
    print(f"  Productos {label}: {stats.products}")
    print(f"  Sin match catálogo: {stats.unmatched}")
    print(f"  No-juego / accesorio: {stats.non_games}")
    print(f"  Match por referencia: {stats.matched_by_ref}")
    print(f"  Match por título (auto): {stats.matched_by_title}")
    print(f"  Match por IA: {stats.matched_by_ai}")
    print(f"  Ambiguos omitidos: {stats.ambiguous_skipped}")
    if stats.ambiguous_skipped and not ai_available():
        print("  (OPENAI_API_KEY ausente — ambiguos no resueltos)")


__all__ = [
    "MatchPipelineStats",
    "attach_match_metadata",
    "print_match_stats",
    "run_match_pipeline",
]
