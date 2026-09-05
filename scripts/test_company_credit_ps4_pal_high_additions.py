#!/usr/bin/env python3
"""Semantic and regression guards for the PS4 PAL HIGH additions phase."""

from __future__ import annotations

import copy
import csv
import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BATCH_ID = "company-credit-ps4-pal-high-additions-1"
REVIEWED_AT = "2026-09-05"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_module(relative_path: str, name: str):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {relative_path}")
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
    importer = load_module(
        "scripts/apply_company_credit_ps4_pal_high_additions.py",
        "ps4_pal_high_importer",
    )
    builder = load_module(
        "scripts/build_verified_company_credit_index.py",
        "verified_credit_builder_high",
    )
    catalog = load_json(ROOT / "data/catalog.json")
    details = load_json(ROOT / "data/game-details.json")
    companies = load_json(ROOT / "data/index/companies.json")
    verified = load_json(ROOT / "data/index/verified-company-credits.json")
    report = load_json(ROOT / "data/research/company-credit-ps4-pal-high-additions-report.json")
    publication = load_csv(ROOT / "data/research/ps4-pal-high-publication-candidates.csv")
    ready = load_csv(ROOT / "data/research/ps4-pal-high-additions-ready.csv")
    retains = load_csv(ROOT / "data/research/ps4-pal-high-retains.csv")
    replacements = load_csv(ROOT / "data/research/ps4-pal-high-replacements-review.csv")
    identifier_blocked = load_csv(ROOT / "data/research/ps4-pal-high-identifier-blocked.csv")
    conflicts = load_csv(ROOT / "data/research/ps4-pal-high-conflicting-candidates.csv")
    unresolved = load_csv(ROOT / "data/research/ps4-pal-high-unresolved-entities.csv")
    residual = load_csv(ROOT / "data/research/ps4-pal-residual-company-research-queue.csv")
    first_batch = load_csv(ROOT / "data/research/company-credit-ps4-pal-batch-1.csv")

    assert verified == builder.build_index(details)
    assert len(publication) == 2397
    assert Counter(row["target_field"] for row in publication) == {
        "developer": 1344,
        "publisher": 1053,
    }
    assert Counter(row["recommended_action"] for row in publication) == {
        "RETAIN": 1538,
        "ADD_MISSING": 759,
        "REPLACE_OR_ADD_REVIEW": 100,
    }
    assert len(identifier_blocked) == 126
    assert Counter(row["recommended_action"] for row in identifier_blocked) == {
        "RETAIN": 110,
        "ADD_MISSING": 10,
        "REPLACE_OR_ADD_REVIEW": 6,
    }
    assert len(retains) == 1428
    assert len(replacements) == 100
    assert sum(not row["identifier_warning"] for row in replacements) == 94

    assert len(ready) == 749
    assert len({(row["catalog_id"], row["target_field"]) for row in ready}) == 749
    assert len({row["catalog_id"] for row in ready}) == 657
    assert Counter(row["target_field"] for row in ready) == {
        "developer": 591,
        "publisher": 158,
    }
    fields_by_id: dict[str, set[str]] = {}
    for row in ready:
        fields_by_id.setdefault(row["catalog_id"], set()).add(row["target_field"])
    assert sum(fields == {"developer", "publisher"} for fields in fields_by_id.values()) == 92

    first_keys = {(row["catalog_id"], row["target_field"]) for row in first_batch}
    ready_keys = {(row["catalog_id"], row["target_field"]) for row in ready}
    assert not first_keys & ready_keys

    catalog_by_id = {row["id"]: row for row in catalog}
    assert len(catalog_by_id) == len(catalog)
    assert report["catalog"]["rowsBefore"] == report["catalog"]["rowsAfter"]
    assert report["catalog"]["idsBefore"] == report["catalog"]["idsAfter"]
    assert report["catalog"]["sha256Before"] == report["catalog"]["sha256After"]
    assert report["catalog"]["unchanged"] is True
    assert report["companies"]["rowsBefore"] == report["companies"]["rowsAfter"]
    assert report["companies"]["created"] == 0

    for row in ready:
        importer.validate_row_shape(row)
        assert row["confidence"] == "HIGH"
        assert row["recommended_action"] == "ADD_MISSING"
        assert row["company_resolution"] == "EXACT_NAME_OR_ALIAS"
        assert row["content_type"] in importer.ALLOWED_CONTENT_TYPES
        assert row["role"] in importer.ALLOWED_ROLES
        assert row["identifier_warning"] == ""
        assert row["previous_value"] == ""
        assert row["review_batch"] == BATCH_ID
        assert row["reviewed_at"] == REVIEWED_AT
        assert row["new_company_slug"] == row["proposed_company_slug"]
        assert row["new_company_name"] == companies[row["proposed_company_slug"]]["name"]
        assert row["field_source"] == importer.source_for(row)

        catalog_row = catalog_by_id[row["catalog_id"]]
        assert catalog_row["platformSlug"] == "ps4"
        assert str(catalog_row["region"]).startswith("PAL")
        assert catalog_row["region"] == row["region"]
        assert catalog_row["edition"] == row["edition"]

        field = row["target_field"]
        detail = details[row["catalog_id"]]
        provenance = detail["fieldProvenance"][field]
        if provenance["reviewBatch"] == BATCH_ID:
            assert detail[field] == importer.desired_entity(row, companies)
            assert detail["fieldSources"][field] == importer.source_for(row)
            assert provenance == importer.desired_provenance(row)
        else:
            assert importer.is_allowed_successor_application(row, detail)
        assert verified["credits"][row["catalog_id"]][field] == detail[field]
        assert verified["credits"][row["catalog_id"]]["fieldProvenance"][field] == provenance

        role_key = "asDeveloper" if field == "developer" else "asPublisher"
        company = companies[row["proposed_company_slug"]]
        assert row["catalog_id"] in company[role_key]
        assert row["catalog_id"] in company["gameIds"]

    assert {
        (row["catalog_id"], row["target_field"])
        for row in ready
        if details[row["catalog_id"]]["fieldProvenance"][row["target_field"]]["reviewBatch"]
        == importer.SUCCESSOR_BATCH_ID
    } == set(importer.ALLOWED_SUCCESSOR_APPLICATIONS)

    assert all(row["publication_status"].endswith("BLOCKED") for row in replacements)
    assert all(row["recommended_action"] == "RETAIN" for row in retains)
    assert all(row["identifier_warning"] for row in identifier_blocked)
    assert all(row["conflict_reason"] == "MULTIPLE_HIGH_COMPANIES" for row in conflicts)
    assert all(row["unresolved_reason"] for row in unresolved)
    assert len(residual) == report["residualQueue"]["rows"]
    assert [
        (int(row["priority"]), row["provisional_work_key"].casefold(), row["catalog_ids"])
        for row in residual
    ] == sorted(
        (
            int(row["priority"]),
            row["provisional_work_key"].casefold(),
            row["catalog_ids"],
        )
        for row in residual
    )
    for row in residual:
        categories = set(importer.split_pipe(row["conflict_reason"]))
        assert categories
        assert not categories - importer.RESIDUAL_CATEGORIES

    assert report["batchId"] == BATCH_ID
    assert report["reviewedAt"] == REVIEWED_AT
    assert report["writesPerformed"] is True
    assert report["sourceCut"]["initial"] == importer.EXPECTED_INITIAL
    assert report["sourceCut"]["identifierBlocked"] == importer.EXPECTED_IDENTIFIER_BLOCKED
    assert report["sourceCut"]["ready"] == importer.EXPECTED_READY
    assert report["summary"]["appliedAdditions"] == 749
    assert report["summary"]["retains"] == 1428
    assert report["summary"]["replacementCandidates"] == 100
    assert report["summary"]["identifierBlocked"] == 126
    assert report["summary"]["staleInput"] == 0
    assert all(report["scopeChecks"].values())

    probe = ready[0]
    medium = copy.deepcopy(probe)
    medium["confidence"] = "MEDIUM"
    assert_rejected(lambda: importer.validate_row_shape(medium), "MEDIUM confidence")
    low = copy.deepcopy(probe)
    low["confidence"] = "LOW"
    assert_rejected(lambda: importer.validate_row_shape(low), "LOW confidence")
    ambiguous = copy.deepcopy(probe)
    ambiguous["company_resolution"] = "AMBIGUOUS_NAME"
    assert_rejected(lambda: importer.validate_row_shape(ambiguous), "ambiguous entity")
    digital = copy.deepcopy(probe)
    digital["role"] = "DIGITAL_PUBLISHER"
    digital["target_field"] = "publisher"
    assert_rejected(lambda: importer.validate_row_shape(digital), "digital publisher as physical")
    replacement = copy.deepcopy(probe)
    replacement["recommended_action"] = "REPLACE_OR_ADD_REVIEW"
    replacement_result = importer.evaluate_additions([replacement], catalog, details, companies)[0]
    assert replacement_result["status"] == "STALE_INPUT"
    warning = copy.deepcopy(probe)
    warning["identifier_warning"] = "CUSA_TITLE_CONFLICT"
    warning_result = importer.evaluate_additions([warning], catalog, details, companies)[0]
    assert warning_result["status"] == "STALE_INPUT"
    competing = copy.deepcopy(probe)
    competing["proposed_company_slug"] = next(
        slug for slug in companies if slug != probe["proposed_company_slug"]
    )
    assert not importer.valid_unique_group([probe, competing], companies)
    other_region_catalog = copy.deepcopy(catalog)
    other_row = next(row for row in other_region_catalog if row["id"] == probe["catalog_id"])
    other_row["region"] = "NTSC USA"
    propagated = importer.evaluate_additions([probe], other_region_catalog, details, companies)[0]
    assert propagated["status"] == "STALE_INPUT"

    current_hashes = {
        "data/game-details.json": report["protectedFileHashes"]["data/game-details.json"]["after"],
        "data/index/companies.json": report["protectedFileHashes"]["data/index/companies.json"]["after"],
    }
    for relative_path in (
        "data/research/company-study/manifest.json",
        "data/research/person-study/manifest.json",
    ):
        manifest = load_json(ROOT / relative_path)
        updates = manifest["protectedFileHashUpdates"]
        update = next(
            row for row in updates if row["batchId"] == BATCH_ID
        )
        assert update["reviewedAt"] == REVIEWED_AT
        assert {key: value["after"] for key, value in update["files"].items()} == current_hashes
        update_index = updates.index(update)
        for key, batch_hash in current_hashes.items():
            next_update = next(
                (row for row in updates[update_index + 1 :] if key in row.get("files", {})),
                None,
            )
            if next_update:
                assert next_update["files"][key]["before"] == batch_hash
            else:
                assert manifest["protectedFileHashes"][key] == batch_hash

    print(
        "OK PS4 PAL HIGH credits: 749 exact additions over 657 entries, "
        "1428 RETAIN confirmations and 100 replacements blocked"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
