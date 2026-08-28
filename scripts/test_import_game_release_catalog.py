#!/usr/bin/env python3
from __future__ import annotations

import copy

from import_game_release_catalog import apply_import, update_entity_indexes, validate_payload


def candidate(title: str, sku: str, *, status: str = "new") -> dict:
    return {
        "title": title,
        "platformSlug": "ps5",
        "region": "PAL España",
        "releaseDate": "2026-08-20",
        "year": 2026,
        "sourceSku": sku,
        "productUrl": f"https://www.game.es/videojuegos/accion/playstation-5/{sku}/{sku}",
        "availabilityModes": ["new", "preowned"],
        "preownedSourceSku": f"9{sku}",
        "preownedProductUrl": f"https://www.game.es/videojuegos/accion/playstation-5/{sku}-seminuevo/9{sku}",
        "imageUrl": f"https://media.game.es/COVERV2/3D_L/{sku[:3]}/{sku}.png",
        "publisher": "Test Studio",
        "genres": ["ACCION", "SIMULADOR", "DEPORTES"],
        "pegi": 12,
        "availability": "available",
        "regionEvidence": "game_es_retail_catalog",
        "catalogStatus": status,
        "matches": [],
    }


def payload() -> dict:
    return {
        "source": "game-es-release-discovery",
        "mode": "released_catalog_candidates",
        "containsPrices": False,
        "platformSlug": "ps5",
        "region": "PAL España",
        "collectedAt": "2026-08-28T10:00:00Z",
        "asOf": "2026-08-28",
        "candidates": [
            candidate("Juego publicado", "123456"),
            candidate("Posible duplicado", "999999", status="possible_duplicate"),
        ],
    }


def test_import_is_strict_and_idempotent() -> None:
    catalog: list[dict] = []
    details: dict = {}
    platforms = [
        {
            "slug": "ps5",
            "name": "PlayStation 5",
            "status": "semi-closed",
            "estimatedCatalogSize": 0,
            "active": False,
        }
    ]
    collection = [
        {
            "id": "juego-publicado",
            "title": "Juego publicado",
            "platformSlug": "ps5",
            "catalogId": None,
            "inRetroCatalog": False,
        }
    ]
    first = apply_import(
        payload=payload(),
        catalog=catalog,
        details=details,
        platforms=platforms,
        collection=collection,
        available_cover_ids={"ps5-juego-publicado"},
        require_covers=True,
    )
    assert first["added"] == 1
    assert first["linkedCollectionRows"] == 1
    assert len(catalog) == 1
    assert catalog[0]["recommendedPrice"] is None
    assert catalog[0]["hasEsPrice"] is False
    assert catalog[0]["regionVerified"] is False
    assert catalog[0]["gameEsSku"] == "123456"
    assert catalog[0]["gameEsPreownedSku"] == "9123456"
    assert catalog[0]["gameEsPreownedProductUrl"].endswith("/9123456")
    assert details["ps5-juego-publicado"]["pegi"] == 12
    assert [genre["slug"] for genre in details["ps5-juego-publicado"]["genres"]] == [
        "action",
        "simulation",
        "sports",
    ]
    assert details["ps5-juego-publicado"]["sources"]["gameEs"]["sku"] == "123456"
    assert details["ps5-juego-publicado"]["sources"]["gameEs"]["preowned"]["sku"] == "9123456"
    assert platforms[0]["active"] is True
    assert platforms[0]["status"] == "open"
    assert collection[0]["catalogId"] == "ps5-juego-publicado"

    snapshot = copy.deepcopy(catalog)
    second = apply_import(
        payload=payload(),
        catalog=catalog,
        details=details,
        platforms=platforms,
        collection=collection,
        available_cover_ids={"ps5-juego-publicado"},
        require_covers=True,
    )
    assert second["added"] == 0
    assert second["updated"] == 0
    assert second["unchanged"] == 1
    assert catalog == snapshot


def test_collection_link_does_not_collapse_distinct_editions() -> None:
    data = payload()
    collection = [
        {
            "id": "juego-publicado-deluxe",
            "title": "Juego publicado Deluxe",
            "platformSlug": "ps5",
            "catalogId": None,
            "inRetroCatalog": False,
        }
    ]
    result = apply_import(
        payload=data,
        catalog=[],
        details={},
        platforms=[{"slug": "ps5", "status": "open", "estimatedCatalogSize": 0, "active": True}],
        collection=collection,
    )
    assert result["linkedCollectionRows"] == 0
    assert collection[0]["catalogId"] is None


def test_indexes_are_incremental_and_idempotent() -> None:
    catalog = [{"id": "ps5-juego", "platformSlug": "ps5", "listingStatus": "listed"}]
    details = {
        "ps5-juego": {
            "year": 2026,
            "publisher": {"name": "Editor", "slug": "editor"},
            "genres": [{"name": "Acción", "slug": "accion"}],
        }
    }
    companies: dict = {}
    genres: dict = {}
    first = update_entity_indexes(companies, genres, catalog, details, {"ps5-juego"})
    second = update_entity_indexes(companies, genres, catalog, details, {"ps5-juego"})
    assert first["indexedGames"] == 1
    assert second["indexedGames"] == 1
    assert companies["editor"]["gameIds"] == ["ps5-juego"]
    assert companies["editor"]["asPublisher"] == ["ps5-juego"]
    assert companies["editor"]["byPlatform"] == {"ps5": 1}
    assert genres["accion"]["gameIds"] == ["ps5-juego"]
    assert genres["accion"]["byPlatform"] == {"ps5": 1}


def test_existing_manual_details_are_preserved() -> None:
    catalog = [
        {
            "id": "ps5-juego-publicado",
            "slug": "juego-publicado",
            "title": "Juego publicado",
            "platformSlug": "ps5",
            "region": "PAL España",
            "listingStatus": "excluded",
            "coverUrl": "/covers/ps5/portada-manual.jpg",
            "hasEsPrice": True,
            "regionVerified": True,
        }
    ]
    details = {
        "ps5-juego-publicado": {
            "year": 2025,
            "releaseDate": "2025-01-01",
            "support": "Blu-ray revisado",
            "publisher": {"name": "Editor manual", "slug": "editor-manual"},
            "genres": [{"name": "Género manual", "slug": "genero-manual"}],
            "pegi": 18,
            "sources": {"wikidata": {"wikidataId": "Q1", "fetchedAt": "2025-01-01T00:00:00Z"}},
            "fieldSources": {"year": "wikidata"},
            "fetchedAt": "2025-01-01T00:00:00Z",
        }
    }
    platforms = [{"slug": "ps5", "status": "open", "estimatedCatalogSize": 1, "active": True}]
    result = apply_import(
        payload=payload(),
        catalog=catalog,
        details=details,
        platforms=platforms,
        collection=[],
        available_cover_ids={"ps5-juego-publicado"},
        require_covers=True,
    )
    assert result["added"] == 0
    assert result["updated"] == 1
    assert catalog[0]["listingStatus"] == "excluded"
    assert catalog[0]["coverUrl"] == "/covers/ps5/portada-manual.jpg"
    assert catalog[0]["hasEsPrice"] is True
    assert catalog[0]["regionVerified"] is True
    assert details["ps5-juego-publicado"]["year"] == 2025
    assert details["ps5-juego-publicado"]["publisher"]["name"] == "Editor manual"
    assert details["ps5-juego-publicado"]["sources"]["gameEs"]["sku"] == "123456"


def test_rejects_price_payloads() -> None:
    bad = payload()
    bad["containsPrices"] = True
    try:
        validate_payload(bad)
    except ValueError:
        return
    raise AssertionError("Un lote con precios no puede convertirse en fichas.")


def test_rejects_hidden_price_fields() -> None:
    bad = payload()
    bad["candidates"][0]["priceEur"] = 69.99
    try:
        validate_payload(bad)
    except ValueError:
        return
    raise AssertionError("Un candidato con precios no puede convertirse en ficha.")


def main() -> None:
    test_import_is_strict_and_idempotent()
    test_collection_link_does_not_collapse_distinct_editions()
    test_indexes_are_incremental_and_idempotent()
    test_existing_manual_details_are_preserved()
    test_rejects_price_payloads()
    test_rejects_hidden_price_fields()
    print("OK GAME catalog import")


if __name__ == "__main__":
    main()
