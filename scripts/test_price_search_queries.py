#!/usr/bin/env python3
"""Regresión: Wallapop usa título base + plataforma; el resto conserva título."""

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
from collectors.tc_client import build_tc_search_query  # noqa: E402
from collectors.vinted_client import build_vinted_search_query  # noqa: E402
from collectors.wallapop_client import build_wallapop_query  # noqa: E402
from collectors.wallapop_client import fetch_game_products  # noqa: E402
from collectors.wallapop_client import wallapop_search_queries  # noqa: E402
import collectors.wallapop_client as wallapop_client  # noqa: E402


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
        wallapop_expected = f"{expected} neo geo pocket"
        if build_wallapop_query(game) != wallapop_expected:
            raise AssertionError(
                f"wallapop/{title}: esperado {wallapop_expected!r}, "
                f"recibido {build_wallapop_query(game)!r}"
            )
        queries = build_search_queries(game)
        if queries != [expected]:
            raise AssertionError(f"build_search_queries/{title}: esperado {[expected]!r}, recibido {queries!r}")
    html_game = {"title": "Professor Layton and Pandora&amp;#39;s Box", "platformSlug": "ds", "platform": "Nintendo DS"}
    html_expected = "Professor Layton and Pandora's Box"
    for label, builder in [*builders, ("todocoleccion", build_tc_search_query)]:
        assert_query(f"{label}/html-entities", builder(html_game), html_expected)
    assert_query("wallapop/html-entities", build_wallapop_query(html_game), f"{html_expected} ds")
    double_html_game = {"title": "Professor Layton and Pandora&amp;amp;#39;s Box", "platformSlug": "ds", "platform": "Nintendo DS"}
    assert_query("common/double-html-entities", build_search_query(double_html_game), html_expected)
    assert_query(
        "wallapop/ps4",
        build_wallapop_query({"title": "7 Days To Die", "platformSlug": "ps4"}),
        "7 Days To Die ps4",
    )
    assert_query(
        "wallapop/edition",
        build_wallapop_query({"title": "2Dark [Limited Edition]", "platformSlug": "ps4"}),
        "2Dark ps4",
    )
    edition_queries = wallapop_search_queries(
        {"title": "2Dark [Limited Edition]", "platformSlug": "ps4"}
    )
    if edition_queries != [
        "2Dark ps4",
        "2 Dark ps4",
        "2Dark playstation 4",
        "2 Dark playstation 4",
        "2Dark",
        "2 Dark",
    ]:
        raise AssertionError(f"wallapop/edition-variants: secuencia inesperada {edition_queries!r}")
    fallback_queries = wallapop_search_queries(
        {"title": "Super Mario World", "platformSlug": "snes"}
    )
    if fallback_queries != [
        "Super Mario World snes",
        "Super Mario World super nintendo",
        "Super Mario World",
    ]:
        raise AssertionError(f"wallapop/fallback: secuencia inesperada {fallback_queries!r}")

    calls: list[str] = []
    original_fetch = wallapop_client.fetch_query_products

    def fake_fetch(query: str, **_: object) -> list[dict[str, str]]:
        calls.append(query)
        count = 6 if query == "2Dark ps4" else 1
        return [
            {"externalId": f"{query}-{index}", "productUrl": f"https://example.test/{index}"}
            for index in range(count)
        ]

    try:
        wallapop_client.fetch_query_products = fake_fetch
        fetch_game_products({"title": "2Dark [Limited Edition]", "platformSlug": "ps4"})
    finally:
        wallapop_client.fetch_query_products = original_fetch
    if calls != ["2Dark ps4", "2 Dark ps4"]:
        raise AssertionError(f"wallapop/title-variants: consultas ejecutadas {calls!r}")
    print("OK: Wallapop usa título base + plataforma; resto sin sufijos")


if __name__ == "__main__":
    main()
