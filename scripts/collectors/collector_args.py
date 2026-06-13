"""Flags CLI compartidos para collectors con matching unificado."""

from __future__ import annotations

import argparse


def add_match_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--no-ai", action="store_true", help="No llamar LLM (Wallapop anuncios ni match ambiguo)")
    parser.add_argument(
        "--no-match-cache",
        action="store_true",
        help="No reutilizar caché IA (Wallapop listing-ai ni catalog-matches)",
    )


def match_kwargs(args: argparse.Namespace) -> dict:
    return {
        "use_ai": not args.no_ai,
        "use_match_cache": not args.no_match_cache,
    }


__all__ = ["add_match_flags", "match_kwargs"]
