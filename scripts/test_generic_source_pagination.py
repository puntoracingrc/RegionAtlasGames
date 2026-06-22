#!/usr/bin/env python3
"""Regression checks for generic source URL pagination helpers."""

from __future__ import annotations

from types import SimpleNamespace

from collect_generic_source import (
    detected_page_count,
    estimated_page_count,
    expected_product_count,
    offset_update_url,
    page_url,
    parse_products,
    row_from_product,
)


def test_relative_query_template() -> None:
    url = page_url("https://retroplayzone.com/30-videojuegos-sega-mega-drive/", 2, "?page={page}")
    assert url == "https://retroplayzone.com/30-videojuegos-sega-mega-drive/?page=2"


def test_url_template_with_base_placeholder() -> None:
    url = page_url("https://example.com/category/", 3, "{url}?page={page}")
    assert url == "https://example.com/category?page=3"


def test_detect_total_from_prestashop_text() -> None:
    html = "<p>326 productos</p><p>Mostrando 1-25 de 326 artículo(s)</p>"
    assert expected_product_count(html) == 326
    assert estimated_page_count(html, 30) == 14
    assert detected_page_count(html, 30) == 14


def test_missing_total_does_not_invent_single_page() -> None:
    html = "<html><body><article class='product-miniature'>Juego</article></body></html>"
    assert expected_product_count(html) is None
    assert detected_page_count(html, 30) is None


def test_offset_update_url() -> None:
    url = offset_update_url(
        "https://www.cashconverters.es/es/es/comprar/videojuegos-y-consolas/",
        {
            "offsetEndpoint": "/on/demandware.store/Sites-CashConvertersSpain-Site/es/Search-UpdateGrid",
            "categoryParam": "cgid",
            "categoryValue": "1103",
            "offsetParam": "start",
            "pageSizeParam": "sz",
        },
        24,
        24,
    )
    assert url == "https://www.cashconverters.es/on/demandware.store/Sites-CashConvertersSpain-Site/es/Search-UpdateGrid?cgid=1103&start=24&sz=24"


def test_parse_demandware_tile() -> None:
    html = """
    <div class="product-tile" data-product-datalayer="{&quot;id&quot;:&quot;CC001&quot;,&quot;name&quot;:&quot;grand theft auto v ps4&quot;,&quot;category&quot;:&quot;Videojuegos y consolas/Videojuegos/Juego PS4&quot;,&quot;price&quot;:21.94,&quot;variant&quot;:&quot;Bueno&quot;}">
      <a class="link" href="/es/es/comprar/videojuegos-y-consolas/videojuegos/juego-ps4/grand-theft-auto-v-ps4/" title="grand theft auto v ps4">grand theft auto v ps4</a>
      <img class="tile-image" src="https://images.cashconverters.es/productslive/grand-theft-auto-v.jpg" />
      <div class="status">Bueno</div>
    </div>
    """
    products = parse_products(html, "https://www.cashconverters.es/es/es/comprar/videojuegos-y-consolas/")
    assert len(products) == 1
    assert products[0]["title"] == "grand theft auto v ps4"
    assert products[0]["priceEur"] == 21.94
    assert "/videojuegos/" in products[0]["productUrl"]


def test_generic_row_infers_eur_cartucho_nes() -> None:
    row = row_from_product(
        {
            "title": "Gauntlet II (EUR) (cartucho) - Nintendo NES",
            "priceEur": 19.99,
            "productUrl": "https://retroplayzone.com/gauntlet-ii/",
        },
        {
            "id": "nes-pal-gauntlet-ii",
            "title": "Gauntlet II",
            "region": "PAL Europa",
        },
        SimpleNamespace(
            matched_reference=None,
            match_method="title",
            match_score=0.9,
            margin=0.3,
            alternatives=[],
            ai_confidence=None,
        ),
        source_slug="retroplayzone",
    )
    assert row is not None
    assert row["listingRegion"] == "PAL Europa"
    assert "cover_pal_eu" in row["regionEvidence"]
    assert row["regionVerified"] is True
    assert row["condition"] == "loose"


if __name__ == "__main__":
    test_relative_query_template()
    test_url_template_with_base_placeholder()
    test_detect_total_from_prestashop_text()
    test_missing_total_does_not_invent_single_page()
    test_offset_update_url()
    test_parse_demandware_tile()
    test_generic_row_infers_eur_cartucho_nes()
    print("OK")
