#!/usr/bin/env python3
"""Compare the PS4 PAL rapid-review output with its exact stacked base."""

from __future__ import annotations

import argparse
import copy
import csv
import importlib.util
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BATCH_ID = "company-credit-ps4-pal-rapid-review-2026-09-05"
REPORT_FILE = ROOT / "data/research/company-credit-ps4-pal-rapid-review-report.json"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def git_json(ref: str, relative_path: str):
    payload = subprocess.check_output(
        ["git", "show", f"{ref}:{relative_path}"], cwd=ROOT
    )
    return json.loads(payload)


def load_importer():
    path = ROOT / "scripts/apply_company_credit_ps4_pal_rapid_review.py"
    spec = importlib.util.spec_from_file_location("rapid_review_comparator", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load rapid-review importer")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_detail(detail: dict | None, roles: set[str], importer) -> dict:
    if detail is None:
        normalized = importer.new_detail()
    else:
        normalized = copy.deepcopy(detail)
    credits = [
        credit
        for credit in normalized.get("companyCredits", [])
        if credit.get("provenance", {}).get("reviewBatch") != BATCH_ID
    ]
    if credits:
        normalized["companyCredits"] = credits
    else:
        normalized.pop("companyCredits", None)
    for role in roles:
        if role not in {"DEVELOPER", "PUBLISHER"}:
            continue
        field = "developer" if role == "DEVELOPER" else "publisher"
        normalized.pop(field, None)
        for container in ("fieldSources", "fieldProvenance"):
            values = normalized.get(container)
            if isinstance(values, dict):
                values.pop(field, None)
                if not values:
                    normalized.pop(container, None)
    return normalized


def strip_company_counts(entry: dict) -> dict:
    normalized = copy.deepcopy(entry)
    for field in (
        "gameIds",
        "byPlatform",
        "gameCount",
        "asDeveloper",
        "asPublisher",
        "asDigitalPublisher",
        "asPhysicalPublisherOrDistributor",
    ):
        normalized.pop(field, None)
    return normalized


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-ref")
    args = parser.parse_args()
    report = read_json(REPORT_FILE)
    base_ref = args.base_ref or report["git"]["stackedBaseHead"]
    subprocess.run(["git", "cat-file", "-e", f"{base_ref}^{{commit}}"], cwd=ROOT, check=True)

    importer = load_importer()
    decisions = read_csv(ROOT / "data/research/ps4-pal-rapid-review-decisions.csv")
    non_games = read_csv(ROOT / "data/research/ps4-pal-rapid-review-non-games.csv")
    base_catalog = git_json(base_ref, "data/catalog.json")
    head_catalog = read_json(ROOT / "data/catalog.json")
    base_details = git_json(base_ref, "data/game-details.json")
    head_details = read_json(ROOT / "data/game-details.json")
    base_companies = git_json(base_ref, "data/index/companies.json")
    head_companies = read_json(ROOT / "data/index/companies.json")

    base_ids = [game["id"] for game in base_catalog]
    head_ids = [game["id"] for game in head_catalog]
    assert len(base_ids) == len(set(base_ids))
    assert len(head_ids) == len(set(head_ids))
    assert base_ids == head_ids

    base_by_id = {game["id"]: game for game in base_catalog}
    head_by_id = {game["id"]: game for game in head_catalog}
    changed_catalog_ids = {
        catalog_id for catalog_id in base_ids if base_by_id[catalog_id] != head_by_id[catalog_id]
    }
    non_game_ids = {row["catalog_id"] for row in non_games}
    assert changed_catalog_ids == non_game_ids
    assert importer.protected_catalog_hash(base_catalog) == importer.protected_catalog_hash(
        head_catalog
    )

    roles_by_id: dict[str, set[str]] = {}
    for row in decisions:
        roles_by_id.setdefault(row["catalog_id"], set()).add(row["role"])
    changed_detail_ids = {
        catalog_id
        for catalog_id in base_details.keys() | head_details.keys()
        if base_details.get(catalog_id) != head_details.get(catalog_id)
    }
    assert changed_detail_ids == set(roles_by_id)
    for catalog_id, roles in roles_by_id.items():
        assert normalize_detail(base_details.get(catalog_id), roles, importer) == normalize_detail(
            head_details.get(catalog_id), roles, importer
        )

    changed_company_slugs = {
        slug
        for slug in base_companies.keys() | head_companies.keys()
        if base_companies.get(slug) != head_companies.get(slug)
    }
    assert changed_company_slugs == set(report["companiesAfter"]["changedSlugs"])
    assert set(head_companies) - set(base_companies) == set(
        report["companiesAfter"]["createdSlugs"]
    )
    for slug in changed_company_slugs & set(base_companies):
        assert strip_company_counts(base_companies[slug]) == strip_company_counts(
            head_companies[slug]
        )

    assert report["catalogBefore"]["rows"] == len(base_catalog)
    assert report["catalogAfter"]["rows"] == len(head_catalog)
    assert report["detailsAfter"]["changedCatalogIdList"] == sorted(changed_detail_ids)
    assert report["catalogAfter"]["changedIds"] == sorted(changed_catalog_ids)

    print(
        f"OK base/head comparator {base_ref}: {len(head_ids)} IDs and URLs preserved; "
        f"{len(changed_detail_ids)} scoped detail records, {len(changed_company_slugs)} company "
        f"index records and {len(changed_catalog_ids)} non-game classifications changed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
