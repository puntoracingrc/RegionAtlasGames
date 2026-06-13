"""Disambiguación CeX ↔ catálogo — reexporta catalog_ai_match."""

from __future__ import annotations

from typing import Any

from collectors.catalog_ai_match import (
    ai_available,
    hydrate_cached_game,
    read_match_cache,
    resolve_ambiguous_match,
    write_match_cache,
)
from collectors.catalog_match import CatalogMatchResult
from collectors.cex_match import infer_cex_region

CexMatchResult = CatalogMatchResult


def resolve_ambiguous_cex_match(
    product: dict[str, Any],
    result: CexMatchResult,
    *,
    platform_slug: str,
    use_cache: bool = True,
) -> CexMatchResult | None:
    return resolve_ambiguous_match(
        product,
        result,
        source="cex",
        platform_slug=platform_slug,
        infer_listing_region=infer_cex_region,
        use_cache=use_cache,
    )


__all__ = [
    "ai_available",
    "hydrate_cached_game",
    "read_match_cache",
    "resolve_ambiguous_cex_match",
    "write_match_cache",
]
