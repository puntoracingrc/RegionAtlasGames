#!/usr/bin/env python3
"""Regresión: las queries por juego no añaden sufijos de plataforma."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.cex_client import build_cex_search_query  # noqa: E402
from collectors.common import build_ebay_search_query, build_search_queries, build_search_query  # noqa: E402
from collectors.jgo_client import build_jgo_search_query  # noqa: E402
from collectors.kaoto_client import build_kaoto_search_query  # noqa: E402
from collectors.tcns_client import build_tcns_search_query  # noqa: E402
from collectors.vinted_client import build_vinted_search_query  # noqa: E402
from collectors.wallapop_client import build_wallapop_query  # noqa: E402


NGPC_GAMES = [
    ("Baseball Stars", "Baseball Stars"),
    ("Samurai Shodown", "Samurai Shodown"),
    ("Puzzle Bobble Mini", "Puzzle Bobble Mini"),
    ("Baseball Stars Color", "Baseball Stars Color"),
]


def assert_query(label: str, value: str, expected: str) -> None:
    if value != expected:
        raise AssertionError(f"{label}: esperado {expected!r}, recibido {value!r}")
    lower = value.lower()
    if lower.endswith(" ngpc") or lower.endswith(" neo geo pocket") or lower.endswith(" neo geo pocket color"):
        raise AssertionError(f"{label}: sufijo de plataforma añadido en {value!r}")


def main() -> None:
    builders = [
        ("common", build_search_query),
        ("ebay", build_ebay_search_query),
        ("wallapop", build_wallapop_query),
        ("vinted", build_vinted_search_query),
        ("jgo", build_jgo_search_query),
        ("kaoto", build_kaoto_search_query),
        ("cex", build_cex_search_query),
        ("todoconsolas", build_tcns_search_query),
    ]
    for title, expected in NGPC_GAMES:
        game = {"title": title, "platformSlug": "neogeopocket", "platform": "Neo Geo Pocket Color"}
        for label, builder in builders:
            assert_query(f"{label}/{title}", builder(game), expected)
        queries = build_search_queries(game)
        if queries != [expected]:
            raise AssertionError(f"build_search_queries/{title}: esperado {[expected]!r}, recibido {queries!r}")
    print("OK: queries NGPC limpias sin sufijos automáticos")


if __name__ == "__main__":
    main()
