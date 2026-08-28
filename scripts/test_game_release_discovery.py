#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from datetime import date
from pathlib import Path

import collect_game_es
import discover_game_releases as discovery


def product(
    title: str,
    sku: str,
    *,
    release_date: str = "20/08/2026 0:00:00",
    button: str = "Comprar",
    navigation: str | None = None,
    family: str = "PS5",
) -> dict:
    return {
        "Name": title,
        "SKU": sku,
        "Family": family,
        "FamilyName": "PLAYSTATION 5",
        "Navigation": navigation or f"videojuegos/accion/playstation-5/{title.lower().replace(' ', '-')}/{sku}",
        "ReleaseDate": release_date,
        "ImageUrl": f"https://media.game.es/COVERV2/3D_L/{sku[:3]}/{sku}.png",
        "Publisher": "Test Studio",
        "Genres": ["Acción"],
        "IsAvailable": True,
        "Offers": [
            {
                "BasketCode": "NEW",
                "IsNew": True,
                "ButtonText": button,
                "PaintButton": True,
                "SellPrice": 69.99,
            }
        ],
    }


def test_release_filters() -> None:
    released, reason = discovery.candidate_from_product(
        product("Juego publicado", "100001"),
        "ps5",
        as_of=date(2026, 8, 28),
    )
    assert reason is None
    assert released is not None
    assert released["releaseDate"] == "2026-08-20"
    assert "price" not in {key.lower() for key in released}

    reserved, reason = discovery.candidate_from_product(
        product("Juego reservado", "100002", button="Pre-compra"),
        "ps5",
        as_of=date(2026, 8, 28),
    )
    assert reserved is None and reason == "not_for_sale"

    future, reason = discovery.candidate_from_product(
        product("Juego futuro", "100003", release_date="01/09/2026 0:00:00"),
        "ps5",
        as_of=date(2026, 8, 28),
    )
    assert future is None and reason == "future_release"

    accessory, reason = discovery.candidate_from_product(
        product("Mando", "100004", navigation="accesorios/mando/playstation-5/mando/100004"),
        "ps5",
        as_of=date(2026, 8, 28),
    )
    assert accessory is None and reason == "not_a_game"


def test_known_streak_and_no_prices() -> None:
    original_catalog = discovery.platform_catalog_games
    original_fetch = discovery.fetch_search_page
    rows = [
        product("Novedad real", "200001"),
        product("Novedad real", "200006"),
        product("Conocido uno", "200002"),
        product("Conocido dos", "200003"),
        product("Conocido tres", "200004"),
        product("No debe alcanzarse", "200005"),
    ]
    discovery.platform_catalog_games = lambda *_args, **_kwargs: [
        {"id": "ps5-conocido-uno", "title": "Conocido uno", "titlePc": None, "platformSlug": "ps5", "region": "PAL España"},
        {"id": "ps5-conocido-dos", "title": "Conocido dos", "titlePc": None, "platformSlug": "ps5", "region": "PAL España"},
        {"id": "ps5-conocido-tres", "title": "Conocido tres", "titlePc": None, "platformSlug": "ps5", "region": "PAL España"},
    ]
    discovery.fetch_search_page = lambda *_args, **_kwargs: {
        "Products": rows,
        "TotalResults": len(rows),
        "TotalPages": 0,
    }
    try:
        with tempfile.TemporaryDirectory() as tmp:
            result = discovery.collect_release_candidates(
                "ps5",
                limit=80,
                max_pages=4,
                repeat_stop_count=3,
                delay=0,
                as_of=date(2026, 8, 28),
                recent_dir=Path(tmp),
            )
    finally:
        discovery.platform_catalog_games = original_catalog
        discovery.fetch_search_page = original_fetch

    assert [row["title"] for row in result["candidates"]] == ["Novedad real"]
    assert len(result["existingProducts"]) == 3
    assert result["stats"]["rejectedByReason"]["duplicate_source"] == 1
    assert result["stats"]["stopReason"] == "known_streak"
    assert "No debe alcanzarse" not in json.dumps(result, ensure_ascii=False)
    for candidate in result["candidates"]:
        assert not any("price" in key.lower() for key in candidate)


def test_game_price_collector_reads_last_page() -> None:
    original_fetch = collect_game_es.fetch_search_page

    def fake_fetch(_platform: str, _offer: str, page: int, **_kwargs):
        if page > 1:
            return {"Products": [], "TotalResults": 2, "TotalPages": 1}
        row = product(f"Juego página {page}", f"30000{page}")
        return {"Products": [row], "TotalResults": 2, "TotalPages": 1}

    collect_game_es.fetch_search_page = fake_fetch
    try:
        products, stats = collect_game_es.collect_products(
            "ps5",
            "new",
            start_page=0,
            max_pages=4,
            limit=10,
            delay=0,
        )
    finally:
        collect_game_es.fetch_search_page = original_fetch

    assert len(products) == 2
    assert stats["pages"] == 2
    assert stats["stopReason"] == "last_page"


def main() -> None:
    test_release_filters()
    test_known_streak_and_no_prices()
    test_game_price_collector_reads_last_page()
    print("OK GAME release discovery")


if __name__ == "__main__":
    main()
