#!/usr/bin/env python3
"""Regression and semantic guards for the verified PS4 PAL credit batch."""

from __future__ import annotations

import copy
import csv
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISIONS_FILE = ROOT / "data/research/company-credit-ps4-pal-batch-1.csv"
REPORT_FILE = ROOT / "data/research/company-credit-ps4-pal-batch-1-report.json"
VERIFIED_CREDITS_FILE = ROOT / "data/index/verified-company-credits.json"
BATCH_ID = "company-credit-ps4-pal-batch-1"
REVIEWED_AT = "2026-09-05"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_decisions() -> list[dict[str, str]]:
    with DECISIONS_FILE.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_importer():
    path = ROOT / "scripts/apply_company_credit_ps4_pal_batch_1.py"
    spec = importlib.util.spec_from_file_location("ps4_pal_credit_importer", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load PS4 PAL credit importer")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_verified_credit_builder():
    path = ROOT / "scripts/build_verified_company_credit_index.py"
    spec = importlib.util.spec_from_file_location("verified_credit_builder", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load verified company credit index builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assert_rejected(callback, label: str) -> None:
    try:
        callback()
    except ValueError:
        return
    raise AssertionError(f"Expected semantic guard to reject {label}")


def main() -> int:
    importer = load_importer()
    verified_credit_builder = load_verified_credit_builder()
    decisions = load_decisions()
    catalog = load_json(ROOT / "data/catalog.json")
    details = load_json(ROOT / "data/game-details.json")
    companies = load_json(ROOT / "data/index/companies.json")
    report = load_json(REPORT_FILE)
    verified_credits = load_json(VERIFIED_CREDITS_FILE)

    assert verified_credits == verified_credit_builder.build_index(details)

    importer.validate_decisions(decisions)
    assert len(decisions) == 53
    assert len({(row["catalog_id"], row["target_field"]) for row in decisions}) == 53
    assert len({row["catalog_id"] for row in decisions}) == 49
    assert Counter(row["recommended_action"] for row in decisions) == {
        "ADD_MISSING": 48,
        "REPLACE_OR_ADD_VERIFIED": 5,
    }
    assert Counter(row["target_field"] for row in decisions) == {
        "developer": 49,
        "publisher": 4,
    }

    ids = [row["id"] for row in catalog]
    assert len(ids) == len(set(ids))
    assert report["catalog"]["rowsBefore"] == len(catalog)
    assert report["catalog"]["rowsAfter"] == len(catalog)
    assert report["catalog"]["idsBefore"] == len(set(ids))
    assert report["catalog"]["idsAfter"] == len(set(ids))
    assert report["catalog"]["sha256Before"] == sha256(ROOT / "data/catalog.json")
    assert report["catalog"]["sha256After"] == sha256(ROOT / "data/catalog.json")
    assert report["catalog"]["unchanged"] is True
    assert report["companies"] == {
        "rowsBefore": len(companies),
        "rowsAfter": len(companies),
        "created": 0,
    }

    assert report["batchId"] == BATCH_ID
    assert report["reviewedAt"] == REVIEWED_AT
    assert report["writesPerformed"] is True
    assert report["dryRun"] == {
        "readyRows": 53,
        "blockedRows": 0,
        "addMissing": 48,
        "replaceOrAddVerified": 5,
        "catalogIds": 49,
        "differencesFromExpected": {
            "rows": 0,
            "addMissing": 0,
            "replaceOrAddVerified": 0,
            "catalogIds": 0,
        },
    }
    assert report["summary"] == {
        "decisions": 53,
        "mutations": 53,
        "addMissing": 48,
        "replaceOrAddVerified": 5,
        "developerCredits": 49,
        "publisherCredits": 4,
        "changedCatalogIds": 49,
        "createdDetailRecords": 8,
        "staleInput": 0,
        "competingHighConfidenceCandidates": 0,
        "orphanedCurrentCompanySlugs": ["namco-bandai-entertainment"],
    }
    assert report["blockedDecisions"] == []
    assert report["packageControls"]["performed"] is True
    assert report["packageControls"]["manifest"] == {
        "filesChecked": 34,
        "failures": [],
    }
    assert report["packageControls"]["packageValidation"]["checks"] == 21
    assert report["packageControls"]["highConfidenceTargetCandidates"] == 53
    assert report["packageControls"]["competingCandidates"] == []

    catalog_by_id = {row["id"]: row for row in catalog}
    expected_keys = {(row["catalog_id"], row["target_field"]) for row in decisions}
    actual_keys = {(row["catalogId"], row["targetField"]) for row in report["mutations"]}
    assert actual_keys == expected_keys
    assert {row["catalogId"] for row in report["detailChanges"]} == {
        row["catalog_id"] for row in decisions
    }
    assert sum(row["createdDetailRecord"] for row in report["detailChanges"]) == 8

    for decision in decisions:
        catalog_row = catalog_by_id[decision["catalog_id"]]
        assert catalog_row["platformSlug"] == "ps4"
        assert str(catalog_row["region"]).startswith("PAL")

        role = decision["target_field"]
        entity = details[decision["catalog_id"]][role]
        assert entity["name"] == decision["proposed_company"]
        assert entity["slug"] == decision["proposed_company_slug"]
        assert entity["source"] == "official"
        assert details[decision["catalog_id"]]["fieldSources"][role] == "official"
        provenance = details[decision["catalog_id"]]["fieldProvenance"][role]
        assert provenance == importer.desired_provenance(decision)
        indexed_credit = verified_credits["credits"][decision["catalog_id"]]
        assert indexed_credit[role] == entity
        assert indexed_credit["fieldSources"][role] == "official"
        assert indexed_credit["fieldProvenance"][role] == provenance

        company = companies[decision["proposed_company_slug"]]
        role_key = "asDeveloper" if role == "developer" else "asPublisher"
        assert decision["catalog_id"] in company[role_key]
        assert decision["catalog_id"] in company["gameIds"]

        mutation = next(
            row
            for row in report["mutations"]
            if row["catalogId"] == decision["catalog_id"]
            and row["targetField"] == role
        )
        assert mutation["status"] == "APPLIED"
        assert mutation["after"] == entity
        assert mutation["provenance"] == provenance
        assert mutation["evidenceUrls"] == importer.split_pipe(decision["source_urls"])
        if decision["recommended_action"] == "ADD_MISSING":
            assert mutation["before"] is None
        else:
            assert mutation["before"]["name"] == decision["current_company"]

    expected_special_cases = {
        ("ps4-destiny-2", "developer"): "bungie",
        ("ps4-destiny-2", "publisher"): "activision",
        ("ps4-hogwarts-legacy", "developer"): "avalanche-software",
        ("ps4-marvel-avengers", "developer"): "crystal-dynamics",
        ("ps4-one-piece-world-seeker", "developer"): "ganbarion",
    }
    for (catalog_id, role), slug in expected_special_cases.items():
        assert details[catalog_id][role]["slug"] == slug
    assert details["ps4-one-piece-world-seeker"]["publisher"]["slug"] in {
        "bandai-namco-entertainment",
        "namco-bandai-entertainment",
        "namco-bandai-games",
    }

    scope = report["scopeChecks"]
    assert all(scope.values())
    verification = report["verification"]
    assert verification["packageSemanticControls"] == "21/21 PASS"
    assert verification["catalogCountSemantics"] == "7/7 PASS"
    assert verification["unitTests"] == "217/217 PASS"
    assert verification["runtimeOverlayCreditMerge"] == {
        "status": "5/5 PASS",
        "fields": ["developer", "publisher"],
        "verifiedStaticWinsWhenNewerOrOverlayEmpty": True,
        "newerVerifiedRuntimeWins": True,
        "unverifiedStaticCannotReplaceRuntime": True,
        "unrelatedOverlayFieldsPreserved": True,
        "verifiedFallbackWhenStaticUnavailable": True,
    }
    assert verification["verifiedCompanyCreditIndex"] == {
        "status": "PASS",
        "entries": 63,
        "fields": 72,
        "derivedOnlyFromCompleteFieldProvenance": True,
        "bytes": 67476,
    }
    assert verification["collectorControls"] == "PASS"
    assert verification["affiliateOffersV1"] == "PASS"
    assert verification["build"] == "PASS"
    assert verification["localVisualQa"] == {
        "status": "20/20 PASS",
        "viewports": ["1440x1000", "390x844"],
        "catalogEntries": [
            "ps4-destiny-2",
            "ps4-hogwarts-legacy",
            "ps4-marvel-avengers",
            "ps4-one-piece-world-seeker",
            "ps4-airport-simulator-2019",
        ],
        "companySlugs": [
            "bungie",
            "activision",
            "avalanche-software",
            "crystal-dynamics",
            "ganbarion",
        ],
        "brokenImages": 0,
        "consoleErrors": 0,
        "pageErrors": 0,
        "overflowFailures": 0,
    }
    assert all(
        row["role"] not in importer.FORBIDDEN_ROLES for row in report["mutations"]
    )
    assert all(
        not importer.looks_composite_company(row["after"]["name"])
        for row in report["mutations"]
    )

    lower_confidence = copy.deepcopy(decisions)
    lower_confidence[0]["confidence"] = "HIGH"
    assert_rejected(
        lambda: importer.validate_decisions(lower_confidence),
        "a confidence below VERY_HIGH",
    )

    digital_publisher = copy.deepcopy(decisions)
    digital_publisher[0]["role"] = "DIGITAL_PUBLISHER"
    digital_publisher[0]["target_field"] = "publisher"
    assert_rejected(
        lambda: importer.validate_decisions(digital_publisher),
        "a digital publisher in the physical publisher field",
    )

    composite_company = copy.deepcopy(decisions)
    composite_company[0]["proposed_company"] = "Company A | Company B"
    assert_rejected(
        lambda: importer.validate_decisions(composite_company),
        "a concatenated company",
    )

    precondition_probe = next(
        row for row in decisions if row["recommended_action"] == "ADD_MISSING"
    )
    stale_details = copy.deepcopy(details)
    stale_details[precondition_probe["catalog_id"]][precondition_probe["target_field"]] = {
        "name": "Unexpected Company",
        "slug": "unexpected-company",
    }
    stale_result = importer.evaluate_decisions(
        [precondition_probe], catalog, stale_details, companies
    )
    assert stale_result[0]["status"] == "STALE_INPUT"
    assert stale_result[0]["issues"]

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
            if row["batchId"] == BATCH_ID
        )
        assert update["reviewedAt"] == REVIEWED_AT
        next_update = next(
            row
            for row in manifest["protectedFileHashUpdates"]
            if row["batchId"] == "company-credit-ps4-pal-high-additions-1"
        )
        assert {
            protected_path: values["after"]
            for protected_path, values in update["files"].items()
        } == {
            protected_path: values["before"]
            for protected_path, values in next_update["files"].items()
        }

    print(
        "OK PS4 PAL company credits: 53 exact mutations, 49 entries, "
        "no stale rows or regional propagation"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
