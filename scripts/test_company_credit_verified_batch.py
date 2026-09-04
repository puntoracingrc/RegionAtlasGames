#!/usr/bin/env python3
"""Regression checks for the first verified company-credit batch."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISIONS_FILE = ROOT / "data/research/company-credit-verified-batch-1.csv"
REPORT_FILE = ROOT / "data/research/company-credit-verified-batch-1-report.json"
EXPECTED_BATCH_ROWS = 59_626
EXPECTED_ROWS = 65_434
EXPECTED_BATCH = "company-credit-verified-batch-1"
EXPECTED_REVIEW_DATE = "2026-09-04"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_decisions() -> list[dict[str, str]]:
    with DECISIONS_FILE.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug(value) -> str:
    return str(value.get("slug") or "") if isinstance(value, dict) else ""


def main() -> int:
    catalog = load_json(ROOT / "data/catalog.json")
    details = load_json(ROOT / "data/game-details.json")
    companies = load_json(ROOT / "data/index/companies.json")
    report = load_json(REPORT_FILE)
    decisions = load_decisions()

    assert len(catalog) == EXPECTED_ROWS
    assert len({row["id"] for row in catalog}) == EXPECTED_ROWS
    assert report["catalog"] == {
        "rowsBefore": EXPECTED_BATCH_ROWS,
        "rowsAfter": EXPECTED_BATCH_ROWS,
        "idsBefore": EXPECTED_BATCH_ROWS,
        "idsAfter": EXPECTED_BATCH_ROWS,
    }

    mutations = [
        row
        for row in decisions
        if row["confidence"] == "VERY_HIGH"
        and row["action"] in {"ADD_MISSING", "REPLACE"}
    ]
    assert len(mutations) == 19
    assert Counter(row["action"] for row in mutations) == {
        "ADD_MISSING": 8,
        "REPLACE": 11,
    }
    assert len({row["catalog_id"] for row in mutations}) == 14

    for row in mutations:
        detail = details[row["catalog_id"]]
        role = row["role"]
        entity = detail[role]
        assert entity["slug"] == row["proposed_company_slug"]
        assert entity["name"] == row["proposed_company_name"]
        assert entity["source"] == "official"
        assert detail["fieldSources"][role] == "official"
        provenance = detail["fieldProvenance"][role]
        assert provenance["source"] == "official"
        assert provenance["reviewedAt"] == EXPECTED_REVIEW_DATE
        assert provenance["reviewBatch"] == EXPECTED_BATCH
        assert provenance["evidenceSummary"] == row["evidence_summary"]
        assert provenance["evidenceUrls"] == [
            value for value in (row["source_1"], row["source_2"]) if value
        ]

        entry = companies[row["proposed_company_slug"]]
        role_key = "asDeveloper" if role == "developer" else "asPublisher"
        assert row["catalog_id"] in entry[role_key]
        assert row["catalog_id"] in entry["gameIds"]

    protected = [row for row in decisions if row not in mutations]
    assert len(protected) == 10
    assert sum(row["confidence"] == "VERY_HIGH" for row in protected) == 5
    assert sum(
        row["confidence"] == "HIGH" and row["action"] == "RETAIN"
        for row in protected
    ) == 2
    assert sum(
        row["confidence"] == "HIGH" and row["action"] == "REPLACE"
        for row in protected
    ) == 3

    for row in protected:
        detail = details[row["catalog_id"]]
        assert slug(detail[row["role"]]) == row["current_company_slug"]
        assert (detail.get("fieldProvenance") or {}).get(row["role"]) is None

    high_retains = [
        row
        for row in protected
        if row["confidence"] == "HIGH" and row["action"] == "RETAIN"
    ]
    assert {row["catalog_id"] for row in high_retains} == {
        "ps3-call-of-duty-advanced-warfare",
        "ps3-usa-call-of-duty-advanced-warfare",
    }
    for row in high_retains:
        assert details[row["catalog_id"]]["developer"]["name"] == "High Moon"

    high_blocked = [
        row
        for row in protected
        if row["confidence"] == "HIGH" and row["action"] == "REPLACE"
    ]
    assert {row["catalog_id"] for row in high_blocked} == {
        "ps4-call-of-duty-advanced-warfare",
        "ps4-usa-call-of-duty-advanced-warfare",
        "ps4-japon-call-of-duty-advanced-warfare",
    }
    for row in high_blocked:
        assert slug(details[row["catalog_id"]]["developer"]) == "high-moon"

    assert report["batchId"] == EXPECTED_BATCH
    assert report["reviewedAt"] == EXPECTED_REVIEW_DATE
    assert report["summary"] == {
        "decisions": 29,
        "mutations": 19,
        "addMissing": 8,
        "replace": 11,
        "changedCatalogIds": 14,
        "createdDetailRecords": 1,
        "confirmedCurrentNotRewritten": 5,
        "highRetainNotRewritten": 2,
        "highReplaceBlocked": 3,
    }
    assert len(report["mutations"]) == 19
    assert len(report["protectedDecisions"]) == 10
    assert {row["catalogId"] for row in report["detailChanges"]} == {
        row["catalog_id"] for row in mutations
    }

    expected_hashes = {
        "data/game-details.json": sha256(ROOT / "data/game-details.json"),
        "data/index/companies.json": sha256(ROOT / "data/index/companies.json"),
    }
    for relative_path in (
        "data/research/company-study/manifest.json",
        "data/research/person-study/manifest.json",
    ):
        manifest = load_json(ROOT / relative_path)
        for protected_path, expected_hash in expected_hashes.items():
            assert manifest["protectedFileHashes"][protected_path] == expected_hash
        update = next(
            row
            for row in manifest["protectedFileHashUpdates"]
            if row["batchId"] == EXPECTED_BATCH
        )
        assert update["reviewedAt"] == EXPECTED_REVIEW_DATE
        assert {
            protected_path: values["after"]
            for protected_path, values in update["files"].items()
        } == expected_hashes

    print(
        "OK company credit verified batch 1: "
        "19 exact mutations, 7 retained rows and 3 HIGH replacements blocked"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
