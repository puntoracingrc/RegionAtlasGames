#!/usr/bin/env python3

import os
from unittest.mock import patch

from run_ebay_regional_campaign import (
    default_state,
    reconcile_state,
    record_result,
    select_batch,
    validate_runtime_environment,
)


def game(catalog_id: str, region: str, priced: bool = False) -> dict:
    return {
        "id": catalog_id,
        "title": catalog_id,
        "platformSlug": "ps4",
        "region": region,
        "listingStatus": "listed",
        "hasEsPrice": priced,
    }


def main() -> None:
    with patch.dict(os.environ, {}, clear=True):
        try:
            validate_runtime_environment()
        except RuntimeError as exc:
            assert "credenciales eBay" in str(exc)
        else:
            raise AssertionError("La campaña debe fallar si faltan secretos")
    with patch.dict(
        os.environ,
        {
            "EBAY_CLIENT_ID": "client",
            "EBAY_CLIENT_SECRET": "secret",
            "OPENAI_API_KEY": "openai",
        },
        clear=True,
    ):
        validate_runtime_environment()

    catalog = [
        game("es-priced", "PAL España", True),
        game("es-missing", "PAL España"),
        game("uk", "PAL UK/ENG"),
        game("usa", "USA"),
        game("jp", "Japón"),
        {**game("excluded", "PAL España"), "listingStatus": "excluded"},
    ]
    state = reconcile_state(default_state(), catalog)
    region, ids = select_batch(state, catalog, 2)
    assert region and region["key"] == "pal_es"
    assert ids == ["es-missing", "es-priced"]
    state = record_result(
        state,
        "pal_es",
        selected=ids,
        processed=ids,
        matched=["es-missing"],
        failed=[],
        listings_added=3,
        retry_limit=3,
    )
    state = reconcile_state(state, catalog)
    region, ids = select_batch(state, catalog, 2)
    assert region and region["key"] == "pal_uk"
    assert ids == ["uk"]
    assert state["totals"]["catalogGames"] == 5
    assert state["totals"]["completed"] == 2
    print("OK: eBay PS4 regional campaign")


if __name__ == "__main__":
    main()
