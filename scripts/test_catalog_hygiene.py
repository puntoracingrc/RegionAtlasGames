#!/usr/bin/env python3
"""Pruebas de las decisiones conservadoras de higiene del catálogo."""

from audit_catalog_html_entities import decision_for_issue


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
    print("catalog hygiene decisions: ok")


if __name__ == "__main__":
    main()
