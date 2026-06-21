#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import collect_game_es  # noqa: E402


def fake_product(sku: str, name: str) -> dict:
    return {
        "Name": name,
        "SKU": sku,
        "Navigation": f"producto/{sku}",
        "ImageUrl": "",
        "Offers": [
            {
                "BasketCode": "PREOWNED",
                "IsPreowned": True,
                "SellPrice": 12.99,
            }
        ],
    }


def main() -> None:
    calls: list[int] = []

    def fake_fetch(_platform_slug: str, _offer_type: str, page: int) -> dict:
        calls.append(page)
        products = [fake_product("seen-1", "Juego repetido")] if page == 0 else [fake_product("new-1", "Juego nuevo")]
        return {"TotalResults": 2, "TotalPages": 2, "Products": products}

    collect_game_es.fetch_search_page = fake_fetch
    products, stats = collect_game_es.collect_products(
        "ps4",
        "preowned",
        start_page=0,
        max_pages=2,
        limit=1,
        delay=0,
        skip_seen={"sku:seen-1"},
    )

    assert calls == [0, 1]
    assert [product["sourceSku"] for product in products] == ["new-1"]
    assert stats["skippedRecent"] == 1
    assert stats["stopReason"] == "max_products"
    print("OK GAME recent skip")


if __name__ == "__main__":
    main()
