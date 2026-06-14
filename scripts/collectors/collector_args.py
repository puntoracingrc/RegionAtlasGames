"""Flags CLI compartidos para collectors con matching unificado."""

from __future__ import annotations

import argparse


def add_match_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--no-ai", action="store_true", help="Forzar sin LLM en este collector (anula política prioritaria de precios)")
    parser.add_argument(
        "--no-match-cache",
        action="store_true",
        help="No reutilizar caché IA (Wallapop listing-ai ni catalog-matches)",
    )


def match_kwargs(args: argparse.Namespace) -> dict:
    from collectors.price_ai_policy import price_collectors_use_ai

    # --no-ai manual override; DAILY_NO_AI ya no desactiva IA de precios (política prioritaria).
    use_ai = price_collectors_use_ai() and not args.no_ai
    return {
        "use_ai": use_ai,
        "use_match_cache": not args.no_match_cache,
    }


__all__ = ["add_match_flags", "match_kwargs"]
