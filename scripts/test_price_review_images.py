#!/usr/bin/env python3
from __future__ import annotations

import json

from auto_price_review_vision import (
    canonical_product_url,
    capture_todoconsolas_category_images,
    extract_images_from_html,
    item_image_urls,
    map_condition,
    map_region,
)


def main() -> None:
    product_url = "https://www.todoconsolas.com/juegos-ps4/123-prueba.html"
    item = {
        "id": "review-test",
        "status": "pending",
        "source": "todoconsolas",
        "platformSlug": "ps4",
        "evidence": {"url": f"{product_url}?utm_source=test"},
    }
    existing = {
        "id": "review-existing",
        "status": "pending",
        "source": "todoconsolas",
        "platformSlug": "ps4",
        "evidence": {
            "url": "https://www.todoconsolas.com/juegos-ps4/999-existente.html",
            "imageUrl": "https://www.todoconsolas.com/999-large_default/existente.jpg",
        },
    }
    calls: list[tuple[str, int]] = []

    def fake_fetch(category_path: str, page: int):
        calls.append((category_path, page))
        return ([{
            "productUrl": product_url,
            "imageUrl": "https://www.todoconsolas.com/123-large_default/prueba.jpg",
        }], 12)

    stats = capture_todoconsolas_category_images(
        [item, existing],
        delay_seconds=0,
        fetch_page=fake_fetch,
    )

    assert canonical_product_url(f"{product_url}?utm_source=test#foto") == product_url
    assert calls == [("28-juegos-ps4", 1)]
    assert stats == {"pagesFetched": 1, "captured": 1, "remaining": 0, "errors": 0}
    assert item_image_urls(item) == ["https://www.todoconsolas.com/123-large_default/prueba.jpg"]
    assert item["evidence"]["imageSource"] == "todoconsolas_category"
    assert item["evidence"]["imageCapturedAt"].endswith("Z")
    assert item_image_urls(existing) == ["https://www.todoconsolas.com/999-large_default/existente.jpg"]

    wallapop_item = {
        "images": [
            {"urls": {"medium": f"https://cdn.example/{index}.jpg"}}
            for index in range(1, 5)
        ]
    }
    wallapop_html = (
        '<script id="__NEXT_DATA__" type="application/json">'
        + json.dumps({"props": {"pageProps": {"item": wallapop_item}}})
        + "</script>"
    )
    assert extract_images_from_html(
        wallapop_html,
        "https://es.wallapop.com/item/test-123",
    ) == [f"https://cdn.example/{index}.jpg" for index in range(1, 5)]
    assert map_condition("desprecintado") == "complete"
    assert map_region("PAL UK/ENG") == "PAL UK/ENG"
    print("OK price review images")


if __name__ == "__main__":
    main()
