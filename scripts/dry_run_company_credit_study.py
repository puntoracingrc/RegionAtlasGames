#!/usr/bin/env python3
"""Compare a company-credit study package with the current catalog without writing data."""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any


MUTATION_ACTIONS = {"ADD_MISSING", "REPLACE", "REMOVE"}
CONFIRMATION_ACTIONS = {"RETAIN", "RETAIN_AS_REGIONAL_PUBLISHER"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def csv_row_count(path: Path) -> int:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return max(sum(1 for _ in csv.reader(handle)) - 1, 0)


def validate_manifest(package_dir: Path, manifest: dict[str, Any]) -> list[dict[str, str]]:
    failures: list[dict[str, str]] = []
    for entry in manifest["files"]:
        relative_path = entry["path"]
        path = package_dir / relative_path
        if not path.is_file():
            failures.append({"path": relative_path, "reason": "missing"})
            continue

        actual_hash = sha256(path)
        if actual_hash != entry["sha256"]:
            failures.append(
                {
                    "path": relative_path,
                    "reason": f"sha256 {actual_hash} != {entry['sha256']}",
                }
            )

        if "dataRows" in entry:
            actual_rows = csv_row_count(path)
            if actual_rows != entry["dataRows"]:
                failures.append(
                    {
                        "path": relative_path,
                        "reason": f"rows {actual_rows} != {entry['dataRows']}",
                    }
                )
    return failures


def git_file(repo: Path, commit: str, relative_path: str) -> bytes | None:
    try:
        return subprocess.check_output(
            ["git", "show", f"{commit}:{relative_path}"],
            cwd=repo,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        return None


def company_value(detail: dict[str, Any] | None, role: str) -> tuple[str, str, str]:
    value = (detail or {}).get(role)
    if isinstance(value, dict):
        return (
            str(value.get("slug") or ""),
            str(value.get("name") or ""),
            str(value.get("source") or ""),
        )
    if isinstance(value, str):
        return "", value, ""
    return "", "", ""


def classify_decision(
    decision: dict[str, str],
    catalog_row: dict[str, Any] | None,
    detail: dict[str, Any] | None,
) -> dict[str, Any]:
    actual_slug, actual_name, actual_source = company_value(detail, decision["role"])
    proposed_slug = decision["proposed_company_slug"]
    snapshot_slug = decision["current_company_slug"]
    action = decision["action"]

    if catalog_row is None:
        status = "MISSING_CATALOG_ID"
    elif action in MUTATION_ACTIONS and actual_slug == proposed_slug:
        status = "ALREADY_RESOLVED_MUTATION"
    elif action in CONFIRMATION_ACTIONS and actual_slug == proposed_slug:
        status = "CONFIRMED_CURRENT"
    elif actual_slug == snapshot_slug:
        status = "UNCHANGED_FROM_AUDIT"
    else:
        status = "CURRENT_VALUE_DRIFTED"

    return {
        "catalogId": decision["catalog_id"],
        "title": catalog_row.get("title") if catalog_row else decision["title"],
        "platform": decision["platform"],
        "region": decision["region"],
        "role": decision["role"],
        "confidence": decision["confidence"],
        "action": action,
        "status": status,
        "snapshotSlug": snapshot_slug or None,
        "snapshotName": decision["current_company_name"] or None,
        "actualSlug": actual_slug or None,
        "actualName": actual_name or None,
        "actualSource": actual_source or None,
        "proposedSlug": proposed_slug or None,
        "proposedName": decision["proposed_company_name"] or None,
        "nameOnlyDifference": bool(
            actual_slug
            and actual_slug == proposed_slug
            and actual_name != decision["proposed_company_name"]
        ),
        "evidenceSummary": decision["evidence_summary"],
        "sources": [
            source
            for source in (decision["source_1"], decision["source_2"])
            if source
        ],
        "publicationGate": decision["publication_gate"],
    }


def compare_catalogs(
    source_rows: list[dict[str, Any]] | None,
    current_rows: list[dict[str, Any]],
    target_ids: set[str],
) -> dict[str, Any]:
    if source_rows is None:
        return {"available": False}

    source_by_id = {row["id"]: row for row in source_rows}
    current_by_id = {row["id"]: row for row in current_rows}
    changed_fields: collections.Counter[str] = collections.Counter()
    changed_rows: list[dict[str, Any]] = []

    for catalog_id in sorted(source_by_id.keys() & current_by_id.keys()):
        before = source_by_id[catalog_id]
        after = current_by_id[catalog_id]
        fields = sorted(
            key
            for key in before.keys() | after.keys()
            if before.get(key) != after.get(key)
        )
        if not fields:
            continue
        changed_fields.update(fields)
        changed_rows.append({"catalogId": catalog_id, "fields": fields})

    changed_ids = {row["catalogId"] for row in changed_rows}
    return {
        "available": True,
        "sourceRows": len(source_rows),
        "currentRows": len(current_rows),
        "removedIds": sorted(source_by_id.keys() - current_by_id.keys()),
        "addedIds": sorted(current_by_id.keys() - source_by_id.keys()),
        "changedRowCount": len(changed_rows),
        "changedFields": dict(sorted(changed_fields.items())),
        "changedRows": changed_rows,
        "targetIdsChanged": sorted(target_ids & changed_ids),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-dir", required=True, type=Path)
    parser.add_argument("--repo", default=Path.cwd(), type=Path)
    args = parser.parse_args()

    package_dir = args.package_dir.resolve()
    repo = args.repo.resolve()
    manifest = json.loads((package_dir / "MANIFEST.json").read_text())
    manifest_failures = validate_manifest(package_dir, manifest)

    catalog_path = repo / "data/catalog.json"
    details_path = repo / "data/game-details.json"
    companies_path = repo / "data/index/companies.json"
    current_catalog = json.loads(catalog_path.read_text())
    current_details = json.loads(details_path.read_text())
    companies = json.loads(companies_path.read_text())
    current_by_id = {row["id"]: row for row in current_catalog}

    decisions_path = package_dir / "data/verified-credit-decisions.csv"
    with decisions_path.open(encoding="utf-8-sig", newline="") as handle:
        decisions = list(csv.DictReader(handle))

    decision_results = [
        classify_decision(
            decision,
            current_by_id.get(decision["catalog_id"]),
            current_details.get(decision["catalog_id"]),
        )
        for decision in decisions
    ]
    target_ids = {decision["catalog_id"] for decision in decisions}

    source_commit = manifest["sourceSnapshot"]["repositoryCommit"]
    source_catalog_bytes = git_file(repo, source_commit, "data/catalog.json")
    source_details_bytes = git_file(repo, source_commit, "data/game-details.json")
    source_catalog = (
        json.loads(source_catalog_bytes) if source_catalog_bytes is not None else None
    )

    referenced_company_slugs = sorted(
        {
            slug
            for decision in decisions
            for slug in (
                decision["current_company_slug"],
                decision["proposed_company_slug"],
            )
            if slug
        }
    )
    missing_company_slugs = [slug for slug in referenced_company_slugs if slug not in companies]

    status_counts = collections.Counter(row["status"] for row in decision_results)
    confidence_action_counts = collections.Counter(
        (row["confidence"], row["action"]) for row in decision_results
    )
    current_details_bytes = details_path.read_bytes()

    result = {
        "dryRun": True,
        "writesPerformed": False,
        "repoHead": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=repo, text=True
        ).strip(),
        "sourceCommit": source_commit,
        "package": {
            "manifestFiles": len(manifest["files"]),
            "manifestFailures": manifest_failures,
        },
        "catalog": compare_catalogs(source_catalog, current_catalog, target_ids),
        "gameDetails": {
            "sourceAvailable": source_details_bytes is not None,
            "unchangedFromSource": source_details_bytes == current_details_bytes,
            "sourceSha256": hashlib.sha256(source_details_bytes).hexdigest()
            if source_details_bytes is not None
            else None,
            "currentSha256": hashlib.sha256(current_details_bytes).hexdigest(),
        },
        "decisions": {
            "total": len(decision_results),
            "catalogIds": len(target_ids),
            "statusCounts": dict(sorted(status_counts.items())),
            "confidenceActionCounts": {
                f"{confidence}:{action}": count
                for (confidence, action), count in sorted(confidence_action_counts.items())
            },
            "missingCatalogIds": sorted(
                target_ids - current_by_id.keys()
            ),
            "missingCompanySlugs": missing_company_slugs,
            "rows": decision_results,
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if manifest_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
