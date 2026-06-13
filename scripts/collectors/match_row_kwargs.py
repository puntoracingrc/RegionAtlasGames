"""Helpers para construir kwargs de match metadata en filas ingest."""

from __future__ import annotations

from collectors.catalog_match import CatalogMatchResult


def match_row_kwargs(result: CatalogMatchResult) -> dict:
    kwargs: dict = {
        "matched_reference": result.matched_reference,
        "match_method": result.match_method,
        "match_score": result.match_score,
        "match_margin": result.margin,
        "match_alternatives": result.alternatives or None,
        "ai_confidence": result.ai_confidence,
    }
    return kwargs


__all__ = ["match_row_kwargs"]
