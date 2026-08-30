#!/usr/bin/env python3
"""Pruebas de las decisiones conservadoras de higiene del catálogo."""

from audit_catalog_html_entities import decision_for_issue
from curate_catalog import apply_curation


def test_distinct_regions_and_physical_editions_are_preserved() -> None:
    catalog = [
        {
            "id": "ps4-example-es-standard",
            "title": "Example Game",
            "platformSlug": "ps4",
            "region": "PAL España",
            "listingStatus": "listed",
        },
        {
            "id": "ps4-example-eu-standard",
            "title": "Example Game",
            "platformSlug": "ps4",
            "region": "PAL Europa",
            "listingStatus": "listed",
        },
        {
            "id": "ps4-example-es-collector",
            "title": "Example Game [Collector's Edition]",
            "platformSlug": "ps4",
            "region": "PAL España",
            "listingStatus": "listed",
        },
    ]
    curated, report = apply_curation(catalog, reset=True)
    assert report["listed"] == 3
    assert all(game["listingStatus"] == "listed" for game in curated)


def main() -> None:
    assert decision_for_issue({"field": "id"}) == "preserve_identifier"
    assert decision_for_issue({"field": "evidence.matches[0].catalogId"}) == "preserve_identifier"
    assert decision_for_issue({"field": "title", "severity": "text"}) == "runtime_decode"
    assert decision_for_issue({"field": "pcPath"}) == "preserve_source_path"
    assert (
        decision_for_issue(
            {
                "field": "id",
                "value": "ps4-old%27id",
                "suggestedId": "ps4-old-id",
                "suggestedIdExists": True,
            }
        )
        == "manual_collision"
    )
    test_distinct_regions_and_physical_editions_are_preserved()
    print("catalog hygiene decisions: ok")


if __name__ == "__main__":
    main()
