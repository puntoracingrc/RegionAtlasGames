#!/usr/bin/env python3

from collectors.ebay_region_policy import (
    browse_filters,
    ebay_regional_policy,
    end_user_context,
)


def main() -> None:
    expected = {
        "PAL España": "ES",
        "PAL UK/ENG": "GB",
        "USA": "US",
        "Japón": "JP",
        "JAPAN": "JP",
    }
    for region, country in expected.items():
        policy = ebay_regional_policy(region, "28001")
        assert policy.marketplace_id == "EBAY_ES"
        assert policy.destination_country == "ES"
        assert policy.item_location_country == country
        assert f"itemLocationCountry:{country}" in browse_filters(policy)
        assert end_user_context(policy) == "contextualLocation=country%3DES%2Czip%3D28001"

    europe = ebay_regional_policy("PAL Europa")
    assert europe.item_location_region == "EUROPEAN_UNION"
    assert europe.item_location_country is None
    print("OK: eBay regional policy")


if __name__ == "__main__":
    main()
