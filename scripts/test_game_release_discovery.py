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
        "Pegi": 12,
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
    assert released["pegi"] == 12
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

    ps4_released, reason = discovery.candidate_from_product(
        product(
            "Juego PS4 publicado",
            "100005",
            family="PS4",
            navigation="videojuegos/accion/playstation-4/juego-ps4-publicado/100005",
        ),
        "ps4",
        as_of=date(2026, 8, 28),
    )
    assert reason is None
    assert ps4_released is not None
    assert ps4_released["platformSlug"] == "ps4"

    merchandise, reason = discovery.candidate_from_product(
        product("Destiny 2 Stranger Edition - Figura", "100006"),
        "ps5",
        as_of=date(2026, 8, 28),
    )
    assert merchandise is None and reason == "not_a_game"


def test_html_entities_and_excluded_variants_are_not_new_candidates() -> None:
    listed = {
        "id": "ps4-farmers-dynasty",
        "title": "Farmer&#39;s Dynasty",
        "titlePc": None,
        "platformSlug": "ps4",
        "region": "PAL España",
        "listingStatus": "listed",
    }
    excluded = {
        "id": "ps4-zapling-bygone-deluxe-edition",
        "title": "Zapling Bygone Deluxe Edition",
        "titlePc": None,
        "platformSlug": "ps4",
        "region": "PAL España",
        "listingStatus": "excluded",
    }
    games = [listed]
    excluded_games = [excluded]
    source_index = discovery.source_catalog_index([listed, excluded])

    status, matches = discovery.classify_catalog_candidate(
        {"title": "Farmer´s Dynasty", "platformSlug": "ps4", "region": "PAL España"},
        games,
        discovery.exact_catalog_index(games),
        discovery.exact_catalog_index(excluded_games),
        source_index,
    )
    assert status == "existing"
    assert matches[0]["catalogId"] == listed["id"]

    status, matches = discovery.classify_catalog_candidate(
        {"title": "Zapling Bygone Deluxe Edition", "platformSlug": "ps4", "region": "PAL España"},
        games,
        discovery.exact_catalog_index(games),
        discovery.exact_catalog_index(excluded_games),
        source_index,
    )
    assert status == "excluded"
    assert matches[0]["catalogId"] == excluded["id"]

    ps_hits = {
        "id": "ps4-mad-max-playstation-hits",
        "title": "Mad Max [PlayStation Hits]",
        "titlePc": None,
        "platformSlug": "ps4",
        "region": "PAL España",
        "listingStatus": "excluded",
    }
    status, matches = discovery.classify_catalog_candidate(
        {"title": "Mad Max PS Hits", "platformSlug": "ps4", "region": "PAL España"},
        games,
        discovery.exact_catalog_index(games),
        discovery.exact_catalog_index([ps_hits]),
        discovery.source_catalog_index([*games, ps_hits]),
    )
    assert status == "excluded"
    assert matches[0]["catalogId"] == ps_hits["id"]


def test_preowned_noise_is_not_treated_as_a_new_release() -> None:
    mixed_feed = product("Dolmen Day One Edition - Seminuevo", "100007")
    candidate, reason = discovery.candidate_from_product(
        mixed_feed,
        "ps5",
        as_of=date(2026, 8, 28),
    )
    assert candidate is None and reason == "preowned_in_new_feed"

    mixed_feed["Offers"] = [{
        "BasketCode": "PREOWNED",
        "IsPreowned": True,
        "ButtonText": "Comprar",
        "PaintButton": True,
    }]
    candidate, reason = discovery.candidate_from_product(
        mixed_feed,
        "ps5",
        as_of=date(2026, 8, 28),
        offer_type="preowned",
    )
    assert reason is None
    assert candidate is not None
    assert candidate["title"] == "Dolmen Day One Edition"


def test_ps4_uses_direct_preowned_feed_without_product_page_scraping() -> None:
    original_catalog = discovery.platform_catalog_games
    original_search = discovery.fetch_search_page
    original_product_page = discovery.fetch_game_product_page
    new_row = product(
        "Juego PS4",
        "110001",
        family="PS4",
        navigation="videojuegos/accion/playstation-4/juego-ps4/110001",
    )
    preowned_row = product(
        "Juego PS4 - Seminuevo",
        "110002",
        family="PS4",
        navigation="videojuegos/accion/playstation-4/juego-ps4-seminuevo/110002",
    )
    preowned_row["Offers"] = [{
        "BasketCode": "PREOWNED",
        "IsPreowned": True,
        "ButtonText": "Comprar",
        "PaintButton": True,
    }]

    discovery.platform_catalog_games = lambda *_args, **_kwargs: []
    discovery.fetch_search_page = lambda _platform, offer, *_args, **_kwargs: {
        "Products": [new_row if offer == "new" else preowned_row],
        "TotalResults": 1,
        "TotalPages": 0,
    }
    discovery.fetch_game_product_page = lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("PS4 no debe inspeccionar fichas si el feed seminuevo es suficiente")
    )
    try:
        with tempfile.TemporaryDirectory() as tmp:
            result = discovery.collect_release_candidates(
                "ps4",
                limit=80,
                max_pages=1,
                repeat_stop_count=0,
                delay=0,
                as_of=date(2026, 8, 28),
                recent_dir=Path(tmp),
                include_preowned=True,
            )
    finally:
        discovery.platform_catalog_games = original_catalog
        discovery.fetch_search_page = original_search
        discovery.fetch_game_product_page = original_product_page

    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["availabilityModes"] == ["new", "preowned"]
    assert result["candidates"][0]["preownedSourceSku"] == "110002"
    assert result["stats"]["preownedLinked"] == 0


def test_preowned_source_is_verified_without_prices() -> None:
    original_fetch_page = discovery.fetch_game_product_page
    new_url = "https://www.game.es/videojuegos/accion/nintendo-switch-2/hades-ii/251055"
    used_url = "https://www.game.es/videojuegos/accion/nintendo-switch-2/hades-ii-seminuevo/256841"

    def fake_fetch(url: str) -> str:
        if url == new_url:
            return f'<html><body><a href="{used_url}">Seminuevo</a></body></html>'
        if url == used_url:
            return "<html><body><h1>Hades II</h1><p>SEMINUEVO</p><button>Añadir a la cesta</button></body></html>"
        raise AssertionError(url)

    discovery.fetch_game_product_page = fake_fetch
    try:
        source, error = discovery.discover_preowned_source(new_url, "switch2")
    finally:
        discovery.fetch_game_product_page = original_fetch_page

    assert error is None
    assert source == {"sourceSku": "256841", "productUrl": used_url}
    assert not any("price" in key.lower() for key in source)


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


def test_game_sku_remains_identity_when_title_changes() -> None:
    original_catalog = discovery.platform_catalog_games
    original_fetch = discovery.fetch_search_page
    discovery.platform_catalog_games = lambda *_args, **_kwargs: [
        {
            "id": "ps5-titulo-anterior",
            "title": "Título anterior",
            "titlePc": None,
            "platformSlug": "ps5",
            "region": "PAL España",
            "gameEsSku": "400001",
            "gameEsProductUrl": "https://www.game.es/videojuegos/accion/playstation-5/titulo-anterior/400001",
        }
    ]
    discovery.fetch_search_page = lambda *_args, **_kwargs: {
        "Products": [product("Título comercial corregido", "400001")],
        "TotalResults": 1,
        "TotalPages": 0,
    }
    try:
        with tempfile.TemporaryDirectory() as tmp:
            result = discovery.collect_release_candidates(
                "ps5",
                limit=80,
                max_pages=1,
                repeat_stop_count=0,
                delay=0,
                as_of=date(2026, 8, 28),
                recent_dir=Path(tmp),
            )
    finally:
        discovery.platform_catalog_games = original_catalog
        discovery.fetch_search_page = original_fetch

    assert result["candidates"] == []
    assert len(result["existingProducts"]) == 1
    assert result["existingProducts"][0]["matches"][0]["catalogId"] == "ps5-titulo-anterior"


def main() -> None:
    test_release_filters()
    test_html_entities_and_excluded_variants_are_not_new_candidates()
    test_preowned_noise_is_not_treated_as_a_new_release()
    test_ps4_uses_direct_preowned_feed_without_product_page_scraping()
    test_preowned_source_is_verified_without_prices()
    test_known_streak_and_no_prices()
    test_game_price_collector_reads_last_page()
    test_game_sku_remains_identity_when_title_changes()
    print("OK GAME release discovery")


if __name__ == "__main__":
    main()
