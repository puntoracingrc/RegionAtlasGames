#!/usr/bin/env python3

from sync_es_prices import apply_ebay_delivery_estimates


def listing(item_id: str, price: float, shipping: float) -> dict:
    return {
        "catalogId": "ps4-game",
        "source": "ebay-es",
        "externalId": item_id,
        "title": "Game PS4 completo PAL España",
        "condition": "complete",
        "priceEur": price,
        "shippingEur": shipping,
        "estimatedTotalToSpainEur": price + shipping,
        "listingRegion": "PAL España",
        "regionVerified": True,
        "regionEvidence": ["cover_spain"],
        "aiConfidence": 0.95,
    }


def main() -> None:
    game: dict = {}
    changed = apply_ebay_delivery_estimates(
        game,
        [listing("one", 20, 4), listing("two", 30, 6)],
        catalog_region="PAL España",
        platform_slug="ps4",
    )
    assert changed is True
    assert game["estimatedShippingToSpainComplete"] == 5
    assert game["estimatedTotalToSpainComplete"] == 30
    assert "estimatedPriceComplete" not in game
    print("OK: eBay delivery estimates stay separate from item price")


if __name__ == "__main__":
    main()
