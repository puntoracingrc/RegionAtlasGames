#!/usr/bin/env python3
from __future__ import annotations

from collect_xtralife import infer_edition, infer_region, parse_products


def main() -> None:
    html = """
    <script type="application/ld+json">
    [
      {
        "@type": "Product",
        "name": "The Church In The Darkness (LRG) - Imp USA",
        "image": "https://example.test/church.webp",
        "gtin13": "111",
        "offers": {"@type": "Offer", "price": 49.95, "availability": "https://schema.org/InStock"}
      },
      {
        "@type": "Product",
        "name": "Solarpunk PS5",
        "image": "https://example.test/solarpunk.webp",
        "gtin13": "222",
        "offers": {"@type": "Offer", "price": 34.95, "availability": "https://schema.org/PreOrder"}
      }
    ]
    </script>
    """
    products, stats = parse_products(html, page_url="https://www.xtralife.com/test", platform_slug="ps4")
    assert stats["jsonLdProducts"] == 2
    assert stats["usableInStock"] == 1
    assert stats["skippedUnavailable"] == 1
    assert products[0]["title"] == "The Church In The Darkness (LRG) - Imp USA"
    assert products[0]["listingRegion"] == "USA"
    assert products[0]["regionVerified"] is False
    assert products[0]["regionEvidence"] == ["xtralife_title_import_usa"]
    assert products[0]["sourceType"] == "retail_es_current"
    assert products[0]["condition"] == "sealed"
    preowned_products, _ = parse_products(html, page_url="https://www.xtralife.com/test", platform_slug="ps3")
    assert preowned_products[0]["sourceType"] == "retail_es_preowned_complete"
    assert preowned_products[0]["condition"] == "complete"
    assert infer_region("Dragon Quest Heroes 2 - Imp UK")[0] == "PAL España"
    assert infer_edition("Autobahn Police Simulator 3 - Complete Edition", ["PS4"]) == "complete"
    print("OK XtraLife collector parser")


if __name__ == "__main__":
    main()
