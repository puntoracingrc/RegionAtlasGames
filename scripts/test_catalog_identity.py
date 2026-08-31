#!/usr/bin/env python3

from audit_catalog_duplicates import duplicate_report
from catalog_identity import catalog_identity_key, slugify


def test_apostrophe_variants() -> None:
    variants = (
        "Adam's Venture Origins",
        "Adam&#39;s Venture Origins",
        "Adam´s Venture Origins",
        "Adam’s Venture Origins",
    )
    assert {slugify(value) for value in variants} == {"adam-s-venture-origins"}


def test_identity_keeps_real_variants_separate() -> None:
    base = dict(
        platform_slug="ps4",
        region="PAL España",
        edition="standard",
        physical_variant=None,
        title="Example",
    )
    identity = catalog_identity_key(**base)
    assert catalog_identity_key(**{**base, "region": "USA"}) != identity
    assert catalog_identity_key(**{**base, "edition": "collector"}) != identity
    assert catalog_identity_key(**{**base, "physical_variant": "steelbook"}) != identity


def test_audit_marks_collection_collisions() -> None:
    catalog = [
        {
            "id": "ps4-adam-encoded",
            "title": "Adam&#39;s Venture Origins",
            "platformSlug": "ps4",
            "region": "PAL España",
            "edition": "standard",
            "listingStatus": "listed",
            "pcId": 1,
        },
        {
            "id": "ps4-adam-owned",
            "title": "Adam´s Venture Origins",
            "platformSlug": "ps4",
            "region": "PAL España",
            "edition": "standard",
            "listingStatus": "listed",
            "pcId": 1,
        },
    ]
    report = duplicate_report(catalog, [{"catalogId": "ps4-adam-owned"}])
    assert report["duplicateGroups"] == 1
    assert report["ownedDuplicateGroups"] == 1
    assert report["groups"][0]["ownedCatalogIds"] == ["ps4-adam-owned"]


if __name__ == "__main__":
    test_apostrophe_variants()
    test_identity_keeps_real_variants_separate()
    test_audit_marks_collection_collisions()
    print("catalog identity tests: ok")
