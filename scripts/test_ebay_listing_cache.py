#!/usr/bin/env python3

from collectors.ebay_listing_cache import cache_is_fresh


def main() -> None:
    cached = {
        "title": "Juego PS4",
        "priceEur": 30,
        "listingType": "active",
        "shippingEur": 5,
        "estimatedTotalToSpainEur": 35,
        "originCountry": "JP",
    }
    item = {
        "title": "Juego PS4",
        "priceEur": 30,
        "listingType": "active",
        "shippingEur": 5,
        "estimatedTotalToSpainEur": 35,
        "originCountry": "JP",
    }
    assert cache_is_fresh(cached, item)
    assert not cache_is_fresh(cached, {**item, "shippingEur": 7, "estimatedTotalToSpainEur": 37})
    assert not cache_is_fresh(cached, {**item, "originCountry": "US"})
    print("OK: eBay listing cache tracks delivery and origin")


if __name__ == "__main__":
    main()
