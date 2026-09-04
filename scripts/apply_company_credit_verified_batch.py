#!/usr/bin/env python3
"""Apply the first verified company-credit batch with strict scope guards."""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data/catalog.json"
DETAILS_FILE = ROOT / "data/game-details.json"
COMPANIES_FILE = ROOT / "data/index/companies.json"
DECISIONS_FILE = ROOT / "data/research/company-credit-verified-batch-1.csv"
REPORT_FILE = ROOT / "data/research/company-credit-verified-batch-1-report.json"
COMPANY_STUDY_MANIFEST = ROOT / "data/research/company-study/manifest.json"
PERSON_STUDY_MANIFEST = ROOT / "data/research/person-study/manifest.json"

BATCH_ID = "company-credit-verified-batch-1"
REVIEWED_AT = "2026-09-04"
REVIEWED_AT_TIMESTAMP = "2026-09-04T00:00:00Z"
EXPECTED_CATALOG_ROWS = 59_626
EXPECTED_DECISION_SHA256 = "d0ec58edbeaca7d2be1364e5763f7f6662af595e4373b62dcdfbd35fbabed52f"
EXPECTED_SOURCE_PACKAGE_SHA256 = "5f1ef245ff18cf855896d8f8e5e42bf4959befbb723a5fa92665e91f82e740a8"
MUTATION_ACTIONS = {"ADD_MISSING", "REPLACE"}
ROLE_INDEX_KEYS = {"developer": "asDeveloper", "publisher": "asPublisher"}
PROTECTED_FILE_HASHES_BEFORE = {
    "data/game-details.json": "108fccad5892f28fb6a7301fcb2754cbcbd7116f889b6ed17a2e10a98ba4e8e3",
    "data/index/companies.json": "23979fd694d7ea6cf0d132b04d1b16a7513b7493e0086a386c775b9d9952f13b",
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_json(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def desired_protected_manifest(
    path: Path,
    details_hash: str,
    companies_hash: str,
) -> dict[str, Any]:
    manifest = read_json(path)
    after_hashes_by_path = {
        "data/game-details.json": details_hash,
        "data/index/companies.json": companies_hash,
    }
    protected = manifest.get("protectedFileHashes")
    if not isinstance(protected, dict):
        raise ValueError(f"Missing protectedFileHashes in {path.relative_to(ROOT)}")
    protected_paths = [
        relative_path
        for relative_path in protected
        if relative_path in after_hashes_by_path
    ]
    for relative_path in protected_paths:
        after_hash = after_hashes_by_path[relative_path]
        current = protected.get(relative_path)
        allowed = {PROTECTED_FILE_HASHES_BEFORE[relative_path], after_hash}
        if current not in allowed:
            raise ValueError(
                f"Unexpected protected hash for {relative_path} in {path.relative_to(ROOT)}"
            )
        protected[relative_path] = after_hash

    ledger_entry = {
        "batchId": BATCH_ID,
        "reviewedAt": REVIEWED_AT,
        "files": {
            relative_path: {
                "before": PROTECTED_FILE_HASHES_BEFORE[relative_path],
                "after": after_hashes_by_path[relative_path],
            }
            for relative_path in protected_paths
        },
    }
    updates = [
        update
        for update in manifest.get("protectedFileHashUpdates", [])
        if update.get("batchId") != BATCH_ID
    ]
    updates.append(ledger_entry)

    ordered: dict[str, Any] = {}
    for key, value in manifest.items():
        if key == "protectedFileHashUpdates":
            continue
        ordered[key] = value
        if key == "protectedFileHashes":
            ordered["protectedFileHashUpdates"] = updates
    return ordered


def git_head() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()


def company_slug(value: Any) -> str:
    return str(value.get("slug") or "") if isinstance(value, dict) else ""


def load_decisions() -> list[dict[str, str]]:
    if sha256(DECISIONS_FILE) != EXPECTED_DECISION_SHA256:
        raise ValueError("The verified decision file does not match the audited package")
    with DECISIONS_FILE.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def validate_decisions(decisions: list[dict[str, str]]) -> None:
    if len(decisions) != 29:
        raise ValueError(f"Expected 29 decisions, found {len(decisions)}")
    keys = [(row["catalog_id"], row["role"]) for row in decisions]
    if len(keys) != len(set(keys)):
        raise ValueError("Duplicate catalog_id/role decisions")

    mutations = [
        row
        for row in decisions
        if row["confidence"] == "VERY_HIGH" and row["action"] in MUTATION_ACTIONS
    ]
    actions = Counter(row["action"] for row in mutations)
    if len(mutations) != 19 or actions != {"ADD_MISSING": 8, "REPLACE": 11}:
        raise ValueError(f"Unexpected mutation scope: {dict(actions)}")

    high_replacements = [
        row
        for row in decisions
        if row["confidence"] == "HIGH" and row["action"] == "REPLACE"
    ]
    high_retains = [
        row
        for row in decisions
        if row["confidence"] == "HIGH" and row["action"] == "RETAIN"
    ]
    if len(high_replacements) != 3 or len(high_retains) != 2:
        raise ValueError("The HIGH review tray no longer matches the approved scope")


def desired_entity(decision: dict[str, str]) -> dict[str, Any]:
    return {
        "name": decision["proposed_company_name"],
        "slug": decision["proposed_company_slug"],
        "museumPath": None,
        "pcPath": None,
        "source": "official",
    }


def desired_provenance(decision: dict[str, str]) -> dict[str, Any]:
    return {
        "source": "official",
        "evidenceUrls": [
            value
            for value in (decision["source_1"], decision["source_2"])
            if value
        ],
        "evidenceSummary": decision["evidence_summary"],
        "reviewedAt": REVIEWED_AT,
        "reviewBatch": BATCH_ID,
    }


def new_detail() -> dict[str, Any]:
    return {
        "year": None,
        "releaseDate": None,
        "reference": None,
        "players": None,
        "support": None,
        "developer": None,
        "publisher": None,
        "genres": [],
        "series": None,
        "museumPath": None,
        "pcProductId": None,
        "ean": None,
        "sources": {},
        "fieldSources": {},
        "fetchedAt": REVIEWED_AT_TIMESTAMP,
        "mergedAt": REVIEWED_AT_TIMESTAMP,
    }


def is_applied(detail: dict[str, Any], decision: dict[str, str]) -> bool:
    role = decision["role"]
    entity = detail.get(role)
    return (
        entity == desired_entity(decision)
        and (detail.get("fieldSources") or {}).get(role) == "official"
        and (detail.get("fieldProvenance") or {}).get(role)
        == desired_provenance(decision)
    )


def validate_current_value(detail: dict[str, Any], decision: dict[str, str]) -> str:
    role = decision["role"]
    actual_slug = company_slug(detail.get(role))
    current_slug = decision["current_company_slug"]
    proposed_slug = decision["proposed_company_slug"]

    if is_applied(detail, decision):
        return "ALREADY_APPLIED"
    if decision["action"] == "ADD_MISSING" and actual_slug:
        raise ValueError(
            f"{decision['catalog_id']} {role}: expected an empty field, found {actual_slug}"
        )
    if decision["action"] == "REPLACE" and actual_slug != current_slug:
        raise ValueError(
            f"{decision['catalog_id']} {role}: expected {current_slug}, found {actual_slug or 'empty'}"
        )
    if actual_slug == proposed_slug:
        raise ValueError(
            f"{decision['catalog_id']} {role}: proposed slug exists without approved provenance"
        )
    return "WOULD_APPLY"


def remove_index_credit(
    companies: dict[str, dict[str, Any]],
    details: dict[str, dict[str, Any]],
    decision: dict[str, str],
    platform: str,
) -> None:
    old_slug = decision["current_company_slug"]
    if not old_slug:
        return
    entry = companies.get(old_slug)
    if entry is None:
        raise ValueError(f"Missing current company index entry: {old_slug}")

    catalog_id = decision["catalog_id"]
    role_key = ROLE_INDEX_KEYS[decision["role"]]
    entry[role_key] = [value for value in entry.get(role_key, []) if value != catalog_id]
    final_slugs = {
        company_slug(details[catalog_id].get("developer")),
        company_slug(details[catalog_id].get("publisher")),
    }
    if old_slug not in final_slugs and catalog_id in entry.get("gameIds", []):
        entry["gameIds"] = [value for value in entry["gameIds"] if value != catalog_id]
        remaining = int((entry.get("byPlatform") or {}).get(platform, 0)) - 1
        if remaining > 0:
            entry["byPlatform"][platform] = remaining
        else:
            entry.get("byPlatform", {}).pop(platform, None)
    entry["gameCount"] = len(entry.get("gameIds", []))


def add_index_credit(
    companies: dict[str, dict[str, Any]],
    decision: dict[str, str],
    platform: str,
) -> None:
    new_slug = decision["proposed_company_slug"]
    entry = companies.get(new_slug)
    if entry is None:
        raise ValueError(f"Missing proposed company index entry: {new_slug}")

    catalog_id = decision["catalog_id"]
    role_key = ROLE_INDEX_KEYS[decision["role"]]
    role_ids = entry.setdefault(role_key, [])
    if catalog_id not in role_ids:
        role_ids.append(catalog_id)
    if catalog_id not in entry.get("gameIds", []):
        entry.setdefault("gameIds", []).append(catalog_id)
        by_platform = entry.setdefault("byPlatform", {})
        by_platform[platform] = int(by_platform.get(platform, 0)) + 1
    entry["gameCount"] = len(entry.get("gameIds", []))


def changed_top_level_fields(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    return sorted(
        key
        for key in before.keys() | after.keys()
        if before.get(key) != after.get(key)
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, default=REPORT_FILE)
    args = parser.parse_args()

    decisions = load_decisions()
    validate_decisions(decisions)
    catalog = read_json(CATALOG_FILE)
    details: dict[str, dict[str, Any]] = read_json(DETAILS_FILE)
    companies: dict[str, dict[str, Any]] = read_json(COMPANIES_FILE)

    if len(catalog) != EXPECTED_CATALOG_ROWS:
        raise ValueError(f"Expected {EXPECTED_CATALOG_ROWS} catalog rows, found {len(catalog)}")
    catalog_by_id = {row["id"]: row for row in catalog}
    if len(catalog_by_id) != len(catalog):
        raise ValueError("Catalog IDs are not unique")

    target_ids = {row["catalog_id"] for row in decisions}
    missing_ids = sorted(target_ids - catalog_by_id.keys())
    if missing_ids:
        raise ValueError(f"Missing catalog IDs: {missing_ids}")

    mutations = [
        row
        for row in decisions
        if row["confidence"] == "VERY_HIGH" and row["action"] in MUTATION_ACTIONS
    ]
    for row in mutations:
        if row["proposed_company_slug"] not in companies:
            raise ValueError(f"Unknown proposed company slug: {row['proposed_company_slug']}")

    details_before = copy.deepcopy(details)
    companies_before = copy.deepcopy(companies)
    mutation_report: list[dict[str, Any]] = []
    created_detail_ids: set[str] = set()

    for row in mutations:
        catalog_id = row["catalog_id"]
        detail = details.get(catalog_id)
        if not isinstance(detail, dict):
            decisions_for_id = [item for item in mutations if item["catalog_id"] == catalog_id]
            if any(item["action"] != "ADD_MISSING" for item in decisions_for_id):
                raise ValueError(f"Missing details for replacement target {catalog_id}")
            detail = new_detail()
            details[catalog_id] = detail
            created_detail_ids.add(catalog_id)
        status = validate_current_value(detail, row)
        before_value = copy.deepcopy(detail.get(row["role"]))
        if status == "WOULD_APPLY":
            detail[row["role"]] = desired_entity(row)
            detail.setdefault("fieldSources", {})[row["role"]] = "official"
            detail.setdefault("fieldProvenance", {})[row["role"]] = desired_provenance(row)
        mutation_report.append(
            {
                "catalogId": catalog_id,
                "title": row["title"],
                "platform": row["platform"],
                "region": row["region"],
                "role": row["role"],
                "action": row["action"],
                "confidence": row["confidence"],
                "status": "APPLIED" if args.apply and status == "WOULD_APPLY" else status,
                "before": before_value,
                "after": copy.deepcopy(detail.get(row["role"])),
                "provenance": copy.deepcopy(
                    (detail.get("fieldProvenance") or {}).get(row["role"])
                ),
            }
        )

    for row in mutations:
        platform = str(catalog_by_id[row["catalog_id"]]["platformSlug"])
        remove_index_credit(companies, details, row, platform)
        add_index_credit(companies, row, platform)

    protected_report: list[dict[str, Any]] = []
    for row in decisions:
        if row in mutations:
            continue
        detail = details[row["catalog_id"]]
        actual = copy.deepcopy(detail.get(row["role"]))
        actual_slug = company_slug(actual)
        if actual_slug != row["current_company_slug"]:
            raise ValueError(
                f"Protected {row['catalog_id']} {row['role']} drifted: {actual_slug}"
            )
        protected_report.append(
            {
                "catalogId": row["catalog_id"],
                "role": row["role"],
                "action": row["action"],
                "confidence": row["confidence"],
                "publicationGate": row["publication_gate"],
                "value": actual,
            }
        )

    report_path = args.report if args.report.is_absolute() else ROOT / args.report
    details_hash_after = sha256_json(details)
    companies_hash_after = sha256_json(companies)
    protected_manifests = {
        path: desired_protected_manifest(path, details_hash_after, companies_hash_after)
        for path in (COMPANY_STUDY_MANIFEST, PERSON_STUDY_MANIFEST)
    }
    if (
        args.apply
        and details == details_before
        and companies == companies_before
        and report_path.is_file()
    ):
        for path, manifest in protected_manifests.items():
            if read_json(path) != manifest:
                write_json(path, manifest)
        existing_report = read_json(report_path)
        print(json.dumps(existing_report, ensure_ascii=False, indent=2))
        return 0

    expected_changed_ids = {row["catalog_id"] for row in mutations}
    detail_changes: list[dict[str, Any]] = []
    for catalog_id in details_before.keys() | details.keys():
        before = details_before.get(catalog_id, {})
        after = details.get(catalog_id, {})
        fields = changed_top_level_fields(before, after)
        if not fields:
            continue
        if catalog_id not in expected_changed_ids:
            raise ValueError(f"Unexpected propagated detail change: {catalog_id}")
        allowed = set(after) if catalog_id in created_detail_ids else {
            "fieldSources",
            "fieldProvenance",
            *[row["role"] for row in mutations if row["catalog_id"] == catalog_id],
        }
        unexpected = sorted(set(fields) - allowed)
        if unexpected:
            raise ValueError(f"Unexpected fields changed for {catalog_id}: {unexpected}")
        detail_changes.append({"catalogId": catalog_id, "fields": fields})

    affected_company_slugs = sorted(
        {
            slug
            for row in mutations
            for slug in (row["current_company_slug"], row["proposed_company_slug"])
            if slug
        }
    )
    unexpected_index_changes = sorted(
        slug
        for slug in companies_before.keys() | companies.keys()
        if slug not in affected_company_slugs
        and companies_before.get(slug) != companies.get(slug)
    )
    if unexpected_index_changes:
        raise ValueError(
            f"Unexpected propagated company index changes: {unexpected_index_changes}"
        )
    index_changes = []
    for slug in affected_company_slugs:
        before = companies_before[slug]
        after = companies[slug]
        if before == after:
            continue
        index_changes.append(
            {
                "slug": slug,
                "page": f"/compania/{slug}",
                "before": {
                    "gameCount": before.get("gameCount"),
                    "developerCount": len(before.get("asDeveloper", [])),
                    "publisherCount": len(before.get("asPublisher", [])),
                },
                "after": {
                    "gameCount": after.get("gameCount"),
                    "developerCount": len(after.get("asDeveloper", [])),
                    "publisherCount": len(after.get("asPublisher", [])),
                },
            }
        )

    report = {
        "schemaVersion": 1,
        "batchId": BATCH_ID,
        "reviewedAt": REVIEWED_AT,
        "baseCommit": git_head(),
        "sourcePackageSha256": EXPECTED_SOURCE_PACKAGE_SHA256,
        "decisionFileSha256": EXPECTED_DECISION_SHA256,
        "dryRun": not args.apply,
        "writesPerformed": args.apply,
        "catalog": {
            "rowsBefore": len(catalog),
            "rowsAfter": len(catalog),
            "idsBefore": len(catalog_by_id),
            "idsAfter": len(catalog_by_id),
        },
        "summary": {
            "decisions": len(decisions),
            "mutations": len(mutations),
            "addMissing": sum(row["action"] == "ADD_MISSING" for row in mutations),
            "replace": sum(row["action"] == "REPLACE" for row in mutations),
            "changedCatalogIds": len(detail_changes),
            "createdDetailRecords": len(created_detail_ids),
            "confirmedCurrentNotRewritten": sum(
                row["confidence"] == "VERY_HIGH" for row in decisions if row not in mutations
            ),
            "highRetainNotRewritten": sum(
                row["confidence"] == "HIGH" and row["action"] == "RETAIN"
                for row in decisions
            ),
            "highReplaceBlocked": sum(
                row["confidence"] == "HIGH" and row["action"] == "REPLACE"
                for row in decisions
            ),
        },
        "detailChanges": sorted(detail_changes, key=lambda row: row["catalogId"]),
        "mutations": mutation_report,
        "protectedDecisions": protected_report,
        "companyIndexChanges": index_changes,
        "affectedCompanyPages": [f"/compania/{slug}" for slug in affected_company_slugs],
    }

    if args.apply:
        write_json(DETAILS_FILE, details)
        write_json(COMPANIES_FILE, companies)
        for path, manifest in protected_manifests.items():
            write_json(path, manifest)
        write_json(report_path, report)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
