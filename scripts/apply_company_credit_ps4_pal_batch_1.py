#!/usr/bin/env python3
"""Apply the verified PS4 PAL company-credit batch with strict scope guards."""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import html
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Optional


ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data/catalog.json"
DETAILS_FILE = ROOT / "data/game-details.json"
COMPANIES_FILE = ROOT / "data/index/companies.json"
DECISIONS_FILE = ROOT / "data/research/company-credit-ps4-pal-batch-1.csv"
REPORT_FILE = ROOT / "data/research/company-credit-ps4-pal-batch-1-report.json"
COMPANY_STUDY_MANIFEST = ROOT / "data/research/company-study/manifest.json"
PERSON_STUDY_MANIFEST = ROOT / "data/research/person-study/manifest.json"
VERIFIED_CREDIT_INDEX_BUILDER = ROOT / "scripts/build_verified_company_credit_index.py"

BATCH_ID = "company-credit-ps4-pal-batch-1"
REVIEWED_AT = "2026-09-05"
REVIEWED_AT_TIMESTAMP = "2026-09-05T00:00:00Z"
SOURCE_SNAPSHOT = "e6e0d88793e5ac0a6d5ea4b3bfb665427f90abfa"
APPLICATION_BASE_COMMIT = "2ab671e1e974ef627434edd2ab3d2a2aec2e7468"
SOURCE_PACKAGE_SHA256 = "b19148e273b952d18854623b4b4f07f85b6b07277d4917a0d0bea0899082a081"
EXPECTED_SOURCE_DECISION_SHA256 = "6e8b53dc470258b2625f6a9a82523d1ef67731a0f617a8a9dbc2418b278c4192"
EXPECTED_DECISION_SHA256 = "aeeccf9f3d007fcc7cf772c25f947513f8ac12bf6e1ac8fbe7109a6ab15f6ecc"
EXPECTED_PROPOSALS_SHA256 = "c766970f31592379f5d8016ac3ec6ea03e4169097aac7a5340ac5f55e9a9d232"
EXPECTED_MUTATIONS = 53
EXPECTED_CATALOG_IDS = 49
EXPECTED_ACTIONS = {"ADD_MISSING": 48, "REPLACE_OR_ADD_VERIFIED": 5}
EXPECTED_ROLES = {"DEVELOPER": 49, "PHYSICAL_PUBLISHER_OR_DISTRIBUTOR": 4}
ROLE_FIELDS = {
    "DEVELOPER": "developer",
    "PHYSICAL_PUBLISHER_OR_DISTRIBUTOR": "publisher",
}
ROLE_INDEX_KEYS = {"developer": "asDeveloper", "publisher": "asPublisher"}
FORBIDDEN_ROLES = {
    "DIGITAL_PUBLISHER",
    "GENERAL_PUBLISHER_CONTEXT",
    "SUPPORT_DEVELOPER",
}


class StaleInputError(ValueError):
    """Raised when a decision no longer matches its audited precondition."""


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def write_verified_credit_index() -> None:
    subprocess.run(
        [sys.executable, str(VERIFIED_CREDIT_INDEX_BUILDER), "--write"],
        cwd=ROOT,
        check=True,
    )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_json(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def git_head() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()


def split_pipe(value: str) -> list[str]:
    return [part.strip() for part in value.split(" | ") if part.strip()]


def company_slug(value: Any) -> str:
    return str(value.get("slug") or "") if isinstance(value, dict) else ""


def company_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or "")
    return str(value or "")


def looks_composite_company(value: str) -> bool:
    return any(separator in value for separator in (" | ", " / ", " + ", ";", "\n"))


def load_decisions() -> list[dict[str, str]]:
    if sha256(DECISIONS_FILE) != EXPECTED_DECISION_SHA256:
        raise ValueError("The approved decision file does not match the audited package")
    with DECISIONS_FILE.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def validate_decisions(decisions: list[dict[str, str]]) -> None:
    if len(decisions) != EXPECTED_MUTATIONS:
        raise ValueError(f"Expected {EXPECTED_MUTATIONS} decisions, found {len(decisions)}")

    keys = [(row["catalog_id"], row["target_field"]) for row in decisions]
    if len(keys) != len(set(keys)):
        raise ValueError("Approved decisions contain duplicate catalog_id/target_field pairs")
    if len({row["catalog_id"] for row in decisions}) != EXPECTED_CATALOG_IDS:
        raise ValueError("Approved decisions no longer target exactly 49 catalog entries")

    actions = Counter(row["recommended_action"] for row in decisions)
    roles = Counter(row["role"] for row in decisions)
    if actions != EXPECTED_ACTIONS:
        raise ValueError(f"Unexpected action scope: {dict(actions)}")
    if roles != EXPECTED_ROLES:
        raise ValueError(f"Unexpected role scope: {dict(roles)}")

    for row in decisions:
        role = row["role"]
        target_field = row["target_field"]
        if role in FORBIDDEN_ROLES or role not in ROLE_FIELDS:
            raise ValueError(f"Forbidden or unsupported role: {role}")
        if ROLE_FIELDS[role] != target_field:
            raise ValueError(f"Role/field mismatch for {row['catalog_id']}: {role}/{target_field}")
        if row["confidence"] != "VERY_HIGH":
            raise ValueError(f"Confidence below VERY_HIGH for {row['catalog_id']}")
        if row["safe_for_catalog_import"] != "YES":
            raise ValueError(f"Unsafe decision for {row['catalog_id']}")
        if row["company_resolution"] != "EXACT_NAME_OR_ALIAS":
            raise ValueError(f"Ambiguous company resolution for {row['catalog_id']}")
        if not row["proposed_company_slug"]:
            raise ValueError(f"Missing company slug for {row['catalog_id']}")
        proposed_name = row["proposed_company"].strip()
        if not proposed_name or proposed_name.casefold() in {"none", "unknown", "n/a"}:
            raise ValueError(f"Missing company name for {row['catalog_id']}")
        if looks_composite_company(proposed_name):
            raise ValueError(f"Composite company name for {row['catalog_id']}: {proposed_name}")
        if not row["source_urls"].strip():
            raise ValueError(f"Missing evidence URL for {row['catalog_id']}")

        action = row["recommended_action"]
        if action == "ADD_MISSING" and row["current_company"].strip():
            raise ValueError(f"ADD_MISSING has a current value for {row['catalog_id']}")
        if action == "REPLACE_OR_ADD_VERIFIED" and not row["current_company"].strip():
            raise ValueError(f"Replacement lacks its current value for {row['catalog_id']}")


def validate_package_manifest(package_dir: Path) -> dict[str, Any]:
    manifest_path = package_dir / "MANIFEST.sha256"
    failures: list[dict[str, str]] = []
    files_checked = 0
    for raw_line in manifest_path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        expected_hash, relative_path = raw_line.split(maxsplit=1)
        relative_path = relative_path.removeprefix("./")
        path = package_dir / relative_path
        files_checked += 1
        if not path.is_file():
            failures.append({"path": relative_path, "reason": "missing"})
            continue
        actual_hash = sha256(path)
        if actual_hash != expected_hash:
            failures.append(
                {
                    "path": relative_path,
                    "reason": f"sha256 {actual_hash} != {expected_hash}",
                }
            )
    if failures:
        raise ValueError(f"Source package manifest failed: {failures}")
    return {"filesChecked": files_checked, "failures": failures}


def validate_package_controls(
    package_dir: Optional[Path],
    decisions: list[dict[str, str]],
) -> dict[str, Any]:
    if package_dir is None:
        return {
            "performed": False,
            "reason": "Run with --package-dir for manifest and competitor checks",
        }

    package_dir = package_dir.resolve()
    manifest = validate_package_manifest(package_dir)
    approved_path = package_dir / "data/ps4-pal-approved-credit-mutations.csv"
    proposals_path = package_dir / "data/ps4-pal-company-credit-proposals.csv"
    validation_path = package_dir / "data/ps4-pal-validation.json"
    if sha256(approved_path) != EXPECTED_SOURCE_DECISION_SHA256:
        raise ValueError("Source approved-decision CSV hash mismatch")
    with approved_path.open(encoding="utf-8-sig", newline="") as handle:
        source_decisions = list(csv.DictReader(handle))
    if source_decisions != decisions:
        raise ValueError("Committed decisions differ from the approved source CSV")
    if sha256(proposals_path) != EXPECTED_PROPOSALS_SHA256:
        raise ValueError("Source proposal CSV hash mismatch")

    validation = read_json(validation_path)
    if validation.get("status") != "PASS" or validation.get("checks") != 21:
        raise ValueError("The source package did not pass all 21 semantic controls")
    if validation.get("approvedMutations") != EXPECTED_MUTATIONS:
        raise ValueError("The source package approved-mutation count changed")

    with proposals_path.open(encoding="utf-8-sig", newline="") as handle:
        proposals = list(csv.DictReader(handle))
    approved_by_key = {
        (row["catalog_id"], row["target_field"]): row for row in decisions
    }
    candidate_rows: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for proposal in proposals:
        key = (proposal["catalog_id"], proposal["target_field"])
        if key in approved_by_key and proposal["confidence"] in {"HIGH", "VERY_HIGH"}:
            candidate_rows[key].append(proposal)

    competitors: list[dict[str, Any]] = []
    for key, approved in approved_by_key.items():
        candidates = candidate_rows.get(key, [])
        for candidate in candidates:
            if (
                candidate["proposed_company_slug"] != approved["proposed_company_slug"]
                or candidate["role"] != approved["role"]
            ):
                competitors.append(
                    {
                        "catalogId": key[0],
                        "targetField": key[1],
                        "approvedSlug": approved["proposed_company_slug"],
                        "competingSlug": candidate["proposed_company_slug"],
                        "competingRole": candidate["role"],
                        "confidence": candidate["confidence"],
                    }
                )
        matching = [
            candidate
            for candidate in candidates
            if candidate["proposed_company_slug"] == approved["proposed_company_slug"]
            and candidate["role"] == approved["role"]
        ]
        if len(matching) != 1:
            competitors.append(
                {
                    "catalogId": key[0],
                    "targetField": key[1],
                    "approvedSlug": approved["proposed_company_slug"],
                    "reason": f"expected one matching HIGH/VERY_HIGH proposal, found {len(matching)}",
                }
            )
    if competitors:
        raise ValueError(f"Competing or missing HIGH/VERY_HIGH proposals: {competitors}")

    return {
        "performed": True,
        "manifest": manifest,
        "packageValidation": validation,
        "proposalRows": len(proposals),
        "highConfidenceTargetCandidates": sum(len(rows) for rows in candidate_rows.values()),
        "competingCandidates": competitors,
        "sourceApprovedCsvSha256": EXPECTED_SOURCE_DECISION_SHA256,
        "normalizedDecisionCsvSha256": EXPECTED_DECISION_SHA256,
        "proposalsCsvSha256": EXPECTED_PROPOSALS_SHA256,
    }


def desired_entity(decision: dict[str, str]) -> dict[str, Any]:
    return {
        "name": decision["proposed_company"],
        "slug": decision["proposed_company_slug"],
        "museumPath": None,
        "pcPath": None,
        "source": "official",
    }


def desired_provenance(decision: dict[str, str]) -> dict[str, Any]:
    return {
        "source": "official",
        "evidenceUrls": split_pipe(decision["source_urls"]),
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
    role = decision["target_field"]
    return (
        detail.get(role) == desired_entity(decision)
        and (detail.get("fieldSources") or {}).get(role) == "official"
        and (detail.get("fieldProvenance") or {}).get(role)
        == desired_provenance(decision)
    )


def evaluate_decisions(
    decisions: list[dict[str, str]],
    catalog: list[dict[str, Any]],
    details: dict[str, dict[str, Any]],
    companies: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    catalog_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for catalog_row in catalog:
        catalog_rows[str(catalog_row["id"])].append(catalog_row)

    results: list[dict[str, Any]] = []
    for row_number, decision in enumerate(decisions, start=1):
        issues: list[str] = []
        matches = catalog_rows.get(decision["catalog_id"], [])
        catalog_row = matches[0] if len(matches) == 1 else None
        if len(matches) != 1:
            issues.append(f"catalog_id_count={len(matches)}")
        else:
            if catalog_row.get("platformSlug") != "ps4":
                issues.append(f"platform={catalog_row.get('platformSlug')}")
            if catalog_row.get("region") != decision["region"]:
                issues.append(f"region={catalog_row.get('region')}")
            if catalog_row.get("edition") != decision["edition"]:
                issues.append(f"edition={catalog_row.get('edition')}")
            if html.unescape(str(catalog_row.get("title") or "")) != decision["title"]:
                issues.append(f"title={catalog_row.get('title')}")

        proposed_slug = decision["proposed_company_slug"]
        if proposed_slug not in companies:
            issues.append(f"missing_company_slug={proposed_slug}")

        detail = details.get(decision["catalog_id"], {})
        target_field = decision["target_field"]
        actual = detail.get(target_field)
        actual_name = company_name(actual)
        action = decision["recommended_action"]
        already_applied = is_applied(detail, decision)
        if not already_applied:
            if action == "ADD_MISSING" and actual_name:
                issues.append(f"expected_empty_found={actual_name}")
            elif (
                action == "REPLACE_OR_ADD_VERIFIED"
                and actual_name != decision["current_company"]
            ):
                issues.append(
                    f"expected_current={decision['current_company']};actual={actual_name or 'empty'}"
                )
            if action == "REPLACE_OR_ADD_VERIFIED" and actual_name and not company_slug(actual):
                issues.append("current_company_missing_slug")

        results.append(
            {
                "rowNumber": row_number,
                "catalogId": decision["catalog_id"],
                "title": decision["title"],
                "platform": catalog_row.get("platformSlug") if catalog_row else None,
                "region": catalog_row.get("region") if catalog_row else None,
                "edition": catalog_row.get("edition") if catalog_row else None,
                "role": decision["role"],
                "targetField": target_field,
                "action": action,
                "confidence": decision["confidence"],
                "status": (
                    "STALE_INPUT"
                    if issues
                    else "ALREADY_APPLIED"
                    if already_applied
                    else "WOULD_APPLY"
                ),
                "issues": issues,
                "currentValue": copy.deepcopy(actual),
                "proposedCompany": decision["proposed_company"],
                "proposedCompanySlug": proposed_slug,
            }
        )
    return results


def remove_index_credit(
    companies: dict[str, dict[str, Any]],
    details: dict[str, dict[str, Any]],
    catalog_id: str,
    role: str,
    old_slug: str,
    platform: str,
) -> bool:
    if not old_slug:
        return False
    entry = companies.get(old_slug)
    if entry is None:
        return False

    role_key = ROLE_INDEX_KEYS[role]
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
    return True


def add_index_credit(
    companies: dict[str, dict[str, Any]],
    catalog_id: str,
    role: str,
    new_slug: str,
    platform: str,
) -> None:
    entry = companies.get(new_slug)
    if entry is None:
        raise ValueError(f"Missing proposed company index entry: {new_slug}")

    role_key = ROLE_INDEX_KEYS[role]
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
        key for key in before.keys() | after.keys() if before.get(key) != after.get(key)
    )


def desired_protected_manifest(
    path: Path,
    before_hashes: dict[str, str],
    after_hashes: dict[str, str],
) -> dict[str, Any]:
    manifest = read_json(path)
    protected = manifest.get("protectedFileHashes")
    if not isinstance(protected, dict):
        raise ValueError(f"Missing protectedFileHashes in {path.relative_to(ROOT)}")

    protected_paths = [relative_path for relative_path in before_hashes if relative_path in protected]
    for relative_path in protected_paths:
        current = protected.get(relative_path)
        if current not in {before_hashes[relative_path], after_hashes[relative_path]}:
            raise ValueError(
                f"Unexpected protected hash for {relative_path} in {path.relative_to(ROOT)}"
            )
        protected[relative_path] = after_hashes[relative_path]

    ledger_entry = {
        "batchId": BATCH_ID,
        "reviewedAt": REVIEWED_AT,
        "files": {
            relative_path: {
                "before": before_hashes[relative_path],
                "after": after_hashes[relative_path],
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--package-dir", type=Path)
    parser.add_argument("--report", type=Path, default=REPORT_FILE)
    args = parser.parse_args()

    decisions = load_decisions()
    validate_decisions(decisions)
    package_controls = validate_package_controls(args.package_dir, decisions)
    if args.apply and not package_controls.get("performed"):
        raise ValueError("--apply requires --package-dir so source controls are rechecked")

    catalog: list[dict[str, Any]] = read_json(CATALOG_FILE)
    details: dict[str, dict[str, Any]] = read_json(DETAILS_FILE)
    companies: dict[str, dict[str, Any]] = read_json(COMPANIES_FILE)
    catalog_ids = [str(row["id"]) for row in catalog]
    if len(catalog_ids) != len(set(catalog_ids)):
        raise ValueError("Catalog IDs are not unique")

    evaluations = evaluate_decisions(decisions, catalog, details, companies)
    blocked = [row for row in evaluations if row["status"] == "STALE_INPUT"]
    dry_run = {
        "readyRows": len(evaluations) - len(blocked),
        "blockedRows": len(blocked),
        "addMissing": sum(
            row["action"] == "ADD_MISSING" and row["status"] != "STALE_INPUT"
            for row in evaluations
        ),
        "replaceOrAddVerified": sum(
            row["action"] == "REPLACE_OR_ADD_VERIFIED"
            and row["status"] != "STALE_INPUT"
            for row in evaluations
        ),
        "catalogIds": len(
            {row["catalogId"] for row in evaluations if row["status"] != "STALE_INPUT"}
        ),
        "differencesFromExpected": {
            "rows": (len(evaluations) - len(blocked)) - EXPECTED_MUTATIONS,
            "addMissing": sum(
                row["action"] == "ADD_MISSING" and row["status"] != "STALE_INPUT"
                for row in evaluations
            )
            - EXPECTED_ACTIONS["ADD_MISSING"],
            "replaceOrAddVerified": sum(
                row["action"] == "REPLACE_OR_ADD_VERIFIED"
                and row["status"] != "STALE_INPUT"
                for row in evaluations
            )
            - EXPECTED_ACTIONS["REPLACE_OR_ADD_VERIFIED"],
            "catalogIds": len(
                {row["catalogId"] for row in evaluations if row["status"] != "STALE_INPUT"}
            )
            - EXPECTED_CATALOG_IDS,
        },
    }

    if blocked:
        result = {
            "schemaVersion": 1,
            "batchId": BATCH_ID,
            "reviewedAt": REVIEWED_AT,
            "sourceSnapshot": SOURCE_SNAPSHOT,
            "repoHead": git_head(),
            "baseCommit": APPLICATION_BASE_COMMIT,
            "sourcePackageSha256": SOURCE_PACKAGE_SHA256,
            "decisionFileSha256": EXPECTED_DECISION_SHA256,
            "dryRun": dry_run,
            "packageControls": package_controls,
            "decisions": evaluations,
            "blockedDecisions": blocked,
            "writesPerformed": False,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.apply:
            raise StaleInputError("At least one approved row is stale; no files were written")
        return 2

    catalog_by_id = {str(row["id"]): row for row in catalog}
    details_before = copy.deepcopy(details)
    companies_before = copy.deepcopy(companies)
    catalog_hash = sha256(CATALOG_FILE)
    details_hash_before = sha256(DETAILS_FILE)
    companies_hash_before = sha256(COMPANIES_FILE)
    created_detail_ids: set[str] = set()
    mutations: list[dict[str, Any]] = []

    for decision, evaluation in zip(decisions, evaluations):
        catalog_id = decision["catalog_id"]
        target_field = decision["target_field"]
        detail = details.get(catalog_id)
        if not isinstance(detail, dict):
            detail = new_detail()
            details[catalog_id] = detail
            created_detail_ids.add(catalog_id)

        before_value = copy.deepcopy(detail.get(target_field))
        if evaluation["status"] == "WOULD_APPLY":
            detail[target_field] = desired_entity(decision)
            detail.setdefault("fieldSources", {})[target_field] = "official"
            detail.setdefault("fieldProvenance", {})[target_field] = desired_provenance(decision)

        mutations.append(
            {
                "rowNumber": evaluation["rowNumber"],
                "catalogId": catalog_id,
                "title": decision["title"],
                "platform": decision["platform"] if "platform" in decision else "ps4",
                "region": decision["region"],
                "edition": decision["edition"],
                "role": decision["role"],
                "targetField": target_field,
                "action": decision["recommended_action"],
                "confidence": decision["confidence"],
                "status": (
                    "APPLIED"
                    if args.apply and evaluation["status"] == "WOULD_APPLY"
                    else evaluation["status"]
                ),
                "before": before_value,
                "after": copy.deepcopy(detail.get(target_field)),
                "proposedCompanySlug": decision["proposed_company_slug"],
                "sourceNames": split_pipe(decision["source_names"]),
                "sourceKinds": split_pipe(decision["sources"]),
                "sourceGrades": split_pipe(decision["source_grades"]),
                "evidenceScope": split_pipe(decision["evidence_scope"]),
                "evidenceUrls": split_pipe(decision["source_urls"]),
                "evidenceSummary": decision["evidence_summary"],
                "provenance": copy.deepcopy(
                    (detail.get("fieldProvenance") or {}).get(target_field)
                ),
            }
        )

    for decision, evaluation in zip(decisions, evaluations):
        if evaluation["status"] != "WOULD_APPLY":
            continue
        catalog_id = decision["catalog_id"]
        role = decision["target_field"]
        platform = str(catalog_by_id[catalog_id]["platformSlug"])
        old_slug = company_slug(evaluation["currentValue"])
        remove_index_credit(companies, details, catalog_id, role, old_slug, platform)
        add_index_credit(
            companies,
            catalog_id,
            role,
            decision["proposed_company_slug"],
            platform,
        )

    expected_changed_ids = {row["catalog_id"] for row in decisions}
    detail_changes: list[dict[str, Any]] = []
    for catalog_id in sorted(details_before.keys() | details.keys()):
        before = details_before.get(catalog_id, {})
        after = details.get(catalog_id, {})
        fields = changed_top_level_fields(before, after)
        if not fields:
            continue
        if catalog_id not in expected_changed_ids:
            raise ValueError(f"Unexpected propagated detail change: {catalog_id}")
        if catalog_id not in created_detail_ids:
            allowed = {
                "fieldSources",
                "fieldProvenance",
                *[
                    row["target_field"]
                    for row in decisions
                    if row["catalog_id"] == catalog_id
                ],
            }
            unexpected = sorted(set(fields) - allowed)
            if unexpected:
                raise ValueError(f"Unexpected fields changed for {catalog_id}: {unexpected}")
        detail_changes.append(
            {
                "catalogId": catalog_id,
                "fields": fields,
                "createdDetailRecord": catalog_id in created_detail_ids,
            }
        )

    orphaned_current_company_slugs = sorted(
        {
            company_slug(mutation["before"])
            for mutation in mutations
            if company_slug(mutation["before"])
            and company_slug(mutation["before"]) not in companies_before
        }
    )
    affected_company_slugs = sorted(
        {
            slug
            for mutation in mutations
            for slug in (
                company_slug(mutation["before"]),
                mutation["proposedCompanySlug"],
            )
            if slug and slug in companies_before
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
    if len(companies_before) != len(companies):
        raise ValueError("The company count changed")

    company_index_changes: list[dict[str, Any]] = []
    for slug in affected_company_slugs:
        before = companies_before[slug]
        after = companies[slug]
        if before == after:
            continue
        company_index_changes.append(
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

    details_hash_after = sha256_json(details)
    companies_hash_after = sha256_json(companies)
    before_hashes = {
        "data/game-details.json": details_hash_before,
        "data/index/companies.json": companies_hash_before,
    }
    after_hashes = {
        "data/game-details.json": details_hash_after,
        "data/index/companies.json": companies_hash_after,
    }
    protected_manifests = {
        path: desired_protected_manifest(path, before_hashes, after_hashes)
        for path in (COMPANY_STUDY_MANIFEST, PERSON_STUDY_MANIFEST)
    }

    report = {
        "schemaVersion": 1,
        "batchId": BATCH_ID,
        "reviewedAt": REVIEWED_AT,
        "sourceSnapshot": SOURCE_SNAPSHOT,
        "baseCommit": APPLICATION_BASE_COMMIT,
        "sourcePackageSha256": SOURCE_PACKAGE_SHA256,
        "decisionFileSha256": EXPECTED_DECISION_SHA256,
        "dryRun": dry_run,
        "packageControls": package_controls,
        "writesPerformed": args.apply,
        "catalog": {
            "rowsBefore": len(catalog),
            "rowsAfter": len(catalog),
            "idsBefore": len(set(catalog_ids)),
            "idsAfter": len(set(catalog_ids)),
            "sha256Before": catalog_hash,
            "sha256After": catalog_hash,
            "unchanged": True,
        },
        "companies": {
            "rowsBefore": len(companies_before),
            "rowsAfter": len(companies),
            "created": 0,
        },
        "summary": {
            "decisions": len(decisions),
            "mutations": len(mutations),
            "addMissing": sum(
                row["recommended_action"] == "ADD_MISSING" for row in decisions
            ),
            "replaceOrAddVerified": sum(
                row["recommended_action"] == "REPLACE_OR_ADD_VERIFIED"
                for row in decisions
            ),
            "developerCredits": sum(row["target_field"] == "developer" for row in decisions),
            "publisherCredits": sum(row["target_field"] == "publisher" for row in decisions),
            "changedCatalogIds": len(detail_changes),
            "createdDetailRecords": len(created_detail_ids),
            "staleInput": 0,
            "competingHighConfidenceCandidates": 0,
            "orphanedCurrentCompanySlugs": orphaned_current_company_slugs,
        },
        "mutations": mutations,
        "blockedDecisions": [],
        "detailChanges": detail_changes,
        "companyIndexChanges": company_index_changes,
        "affectedCompanyPages": [
            f"/compania/{slug}" for slug in affected_company_slugs
        ],
        "scopeChecks": {
            "changedDetailsOnlyForApprovedCatalogIds": True,
            "changedCompanyIndexOnlyForReferencedSlugs": True,
            "allChangedCatalogRowsArePs4Pal": all(
                catalog_by_id[catalog_id]["platformSlug"] == "ps4"
                and str(catalog_by_id[catalog_id]["region"]).startswith("PAL")
                for catalog_id in expected_changed_ids
            ),
            "catalogIdsAndUrlsUnchanged": True,
            "noRegionalOrPlatformPropagation": True,
            "noCompaniesCreated": True,
        },
        "protectedFileHashes": {
            relative_path: {
                "before": before_hashes[relative_path],
                "after": after_hashes[relative_path],
            }
            for relative_path in before_hashes
        },
    }

    report_path = args.report if args.report.is_absolute() else ROOT / args.report
    state_changed = details != details_before or companies != companies_before
    if args.apply:
        if not state_changed and report_path.is_file():
            write_verified_credit_index()
            existing_report = read_json(report_path)
            print(json.dumps(existing_report, ensure_ascii=False, indent=2))
            return 0
        write_json(DETAILS_FILE, details)
        write_json(COMPANIES_FILE, companies)
        for path, manifest in protected_manifests.items():
            write_json(path, manifest)
        write_verified_credit_index()
        write_json(report_path, report)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
