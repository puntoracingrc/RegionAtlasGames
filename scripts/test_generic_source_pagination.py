#!/usr/bin/env python3
"""Regression checks for generic source URL pagination helpers."""

from __future__ import annotations

from collect_generic_source import estimated_page_count, expected_product_count, page_url


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


if __name__ == "__main__":
    test_relative_query_template()
    test_url_template_with_base_placeholder()
    test_detect_total_from_prestashop_text()
    print("OK")
