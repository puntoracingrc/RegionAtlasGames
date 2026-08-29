#!/usr/bin/env python3
from __future__ import annotations

import urllib.error

from collect_todoconsolas_category_pilot import (
    classify_candidate,
    is_preowned_product,
    merge_ingest_payload,
    validate_window,
)
from collectors.catalog_match import CatalogMatchResult
from collectors.tcns_client import (
    TodoConsolasRequestError,
    category_page_url,
    fetch_html,
    fetch_search_products,
    parse_category_page,
)
from collectors import tcns_client


def assert_raises_value_error(callback) -> None:
    try:
        callback()
    except ValueError:
        return
    raise AssertionError("Se esperaba ValueError")


def assert_search_is_disabled() -> None:
    try:
        fetch_search_products("Juego de Prueba")
    except TodoConsolasRequestError as exc:
        assert "desactivado" in str(exc).lower()
        return
    raise AssertionError("El buscador interno no debe poder ejecutarse")


def assert_rate_limit_stops_without_retry() -> None:
    original_urlopen = tcns_client.urllib.request.urlopen
    calls = 0

    def blocked(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise urllib.error.HTTPError(
            "https://www.todoconsolas.com/28-juegos-ps4",
            429,
            "Too Many Requests",
            {"Retry-After": "120"},
            None,
        )

    tcns_client.urllib.request.urlopen = blocked
    try:
        try:
            fetch_html("https://www.todoconsolas.com/28-juegos-ps4")
        except TodoConsolasRequestError as exc:
            assert exc.status_code == 429
            assert exc.retry_after == "120"
        else:
            raise AssertionError("HTTP 429 debe detener el recolector")
    finally:
        tcns_client.urllib.request.urlopen = original_urlopen
    assert calls == 1


def main() -> None:
    html = """
    <article class="product-miniature product">
      <a href="https://www.todoconsolas.com/juegos-ps4/123-prueba-8424365720111.html">
        <h2 class="h3 product-title">Juego de Prueba PS4 (SP)</h2>
      </a>
      <span class="condition-label-primary no-border">Segunda mano</span>
      <span itemprop="price" content="19,95 €"></span>
    </article>
    <article class="product-miniature product">
      <a href="https://www.todoconsolas.com/juegos-ps4/124-nuevo-222.html">
        <h2 class="h3 product-title">Juego Nuevo PS4 (SP)</h2>
      </a>
      <span class="condition-label-primary no-border">Nuevo</span>
      <span itemprop="price" content="39,95 €"></span>
    </article>
    """
    products = parse_category_page(html)
    assert len(products) == 2
    assert products[0]["priceEur"] == 19.95
    assert products[0]["sourceReference"] == "8424365720111"
    assert is_preowned_product(products[0]) is True
    assert is_preowned_product(products[1]) is False

    assert category_page_url("28-juegos-ps4") == "https://www.todoconsolas.com/28-juegos-ps4"
    assert category_page_url("28-juegos-ps4", 3).endswith("?page=3")
    assert_raises_value_error(lambda: category_page_url("busqueda?controller=search", 1))
    assert_raises_value_error(lambda: category_page_url("28-juegos-ps4", 0))
    assert_search_is_disabled()
    assert_rate_limit_stops_without_retry()
    validate_window(1, 5)
    assert_raises_value_error(lambda: validate_window(1, 6))

    product = {
        "title": "Juego de Prueba PS4 (SP)",
        "priceEur": 19.95,
        "conditionRaw": "Segunda mano",
        "productUrl": "https://www.todoconsolas.com/juegos-ps4/123-prueba-8424365720111.html",
        "externalId": "123",
    }
    strong = classify_candidate(
        product,
        CatalogMatchResult(
            game={"id": "ps4-test", "title": "Juego de Prueba", "region": "PAL España"},
            match_method="title",
            match_score=0.95,
            margin=0.3,
        ),
    )
    assert strong["status"] == "auto_approved"

    missing_region = classify_candidate(
        {**product, "title": "Juego de Prueba PS4"},
        CatalogMatchResult(
            game={"id": "ps4-test", "title": "Juego de Prueba", "region": "PAL España"},
            match_method="title",
            match_score=1.0,
            margin=0.4,
        ),
    )
    assert missing_region["status"] == "manual_review"

    merged = merge_ingest_payload(
        {
            "collectedAt": "2026-08-29T09:00:00Z",
            "tcns": [{"catalogId": "a", "retailPriceEur": 20}],
            "regionalCandidates": [{"productUrl": "https://example.test/review-a", "title": "A"}],
        },
        {
            "collectedAt": "2026-08-29T10:00:00Z",
            "tcns": [
                {"catalogId": "a", "retailPriceEur": 18},
                {"catalogId": "b", "retailPriceEur": 12},
            ],
            "regionalCandidates": [{"productUrl": "https://example.test/review-b", "title": "B"}],
        },
    )
    assert {row["catalogId"] for row in merged["tcns"]} == {"a", "b"}
    assert next(row for row in merged["tcns"] if row["catalogId"] == "a")["retailPriceEur"] == 18
    assert len(merged["regionalCandidates"]) == 2
    assert_raises_value_error(
        lambda: merge_ingest_payload(
            {"collectedAt": "2026-08-28T09:00:00Z", "tcns": [{"catalogId": "a"}]},
            {"collectedAt": "2026-08-29T10:00:00Z", "tcns": []},
        )
    )
    print("OK TodoConsolas category pilot")


if __name__ == "__main__":
    main()
