#!/usr/bin/env python3
"""Semantic guards for the role-separated PS4 PAL rapid-review batch."""

from __future__ import annotations

import csv
import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BATCH_ID = "company-credit-ps4-pal-rapid-review-2026-09-05"


def load_json(relative_path: str):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def load_csv(relative_path: str) -> list[dict[str, str]]:
    with (ROOT / relative_path).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_module(relative_path: str, name: str):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {relative_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def batch_credits(detail: dict, role: str | None = None) -> list[dict]:
    return [
        credit
        for credit in detail.get("companyCredits", [])
        if credit.get("provenance", {}).get("reviewBatch") == BATCH_ID
        and (role is None or credit.get("role") == role)
    ]


def effective_decision_credits(importer, row: dict, detail: dict) -> list[dict]:
    role = importer.ROLE_NAMES[row["role"]]
    credits = batch_credits(detail, role)
    if [credit["company"]["slug"] for credit in credits] == row["company_slugs"].split(" | "):
        return credits
    return importer.allowed_successor_role_credits(row, detail)


def main() -> int:
    importer = load_module(
        "scripts/apply_company_credit_ps4_pal_rapid_review.py",
        "ps4_pal_rapid_review_importer",
    )
    builder = load_module(
        "scripts/build_verified_company_credit_index.py",
        "verified_credit_builder_rapid_review",
    )
    importer.check_committed()

    catalog = load_json("data/catalog.json")
    details = load_json("data/game-details.json")
    companies = load_json("data/index/companies.json")
    verified = load_json("data/index/verified-company-credits.json")
    meta = load_json("data/meta.json")
    work_index = load_json("data/index/catalog-work-identities.json")
    decisions = load_csv("data/research/ps4-pal-rapid-review-decisions.csv")
    conflicts = load_csv("data/research/ps4-pal-rapid-review-conflicts.csv")
    non_games = load_csv("data/research/ps4-pal-rapid-review-non-games.csv")
    report = load_json("data/research/company-credit-ps4-pal-rapid-review-report.json")

    catalog_by_id = {game["id"]: game for game in catalog}
    assert len(catalog_by_id) == len(catalog)
    assert len(decisions) == 1655
    actions = Counter(row["classification"] for row in decisions)
    assert actions == {"ADD": 1499, "REPLACE": 74, "CONFIRM": 82}
    assert all(row["confidence"] in {"HIGH", "VERY_HIGH"} for row in decisions)
    assert all(row["catalog_id"] in catalog_by_id for row in decisions)
    assert all(
        catalog_by_id[row["catalog_id"]]["platformSlug"] == "ps4"
        and str(catalog_by_id[row["catalog_id"]]["region"]).startswith("PAL")
        for row in decisions
    )

    effective_credits = [
        credit
        for row in decisions
        for credit in effective_decision_credits(importer, row, details[row["catalog_id"]])
    ]
    assert len(effective_credits) == 1660
    assert Counter(credit["role"] for credit in effective_credits) == {
        "developer": 661,
        "publisher": 2,
        "digitalPublisher": 60,
        "physicalPublisherOrDistributor": 937,
    }
    assert all(
        credit["provenance"]["evidenceUrls"]
        and credit["provenance"]["evidenceSummary"]
        and credit["provenance"]["reviewedAt"] == "2026-09-05"
        for credit in effective_credits
    )

    for row in decisions:
        role = importer.ROLE_NAMES[row["role"]]
        credits = effective_decision_credits(importer, row, details[row["catalog_id"]])
        assert credits
        for slug in [credit["company"]["slug"] for credit in credits]:
            assert row["catalog_id"] in companies[slug][importer.ROLE_INDEX_FIELDS[row["role"]]]

    assert {
        (row["catalog_id"], importer.ROLE_NAMES[row["role"]])
        for row in decisions
        if any(
            credit.get("provenance", {}).get("reviewBatch") == importer.SUCCESSOR_BATCH_ID
            for credit in effective_decision_credits(importer, row, details[row["catalog_id"]])
        )
    } == set(importer.ALLOWED_SUCCESSOR_ROLE_CREDITS)

    separated = details["ps4-3d-mini-golf"]
    assert [credit["company"]["slug"] for credit in batch_credits(separated, "developer")] == [
        "z-software"
    ]
    assert [
        credit["company"]["slug"]
        for credit in batch_credits(separated, "physicalPublisherOrDistributor")
    ] == ["markt-technik"]

    digital = "ps4-airport-simulator-day-&amp;-night"
    physical = "ps4-dino-dini%27s-kick-off-revival"
    assert [credit["company"]["slug"] for credit in batch_credits(details[digital])] == [
        "iridium-media-group-gmbh"
    ]
    assert details[digital].get("publisher") is None
    assert digital in companies["iridium-media-group-gmbh"]["asDigitalPublisher"]
    assert physical in companies["digital-lounge"]["asPhysicalPublisherOrDistributor"]
    assert physical not in companies["digital-lounge"]["asDigitalPublisher"]

    wipeout_ids = (
        "ps4-wipeout-omega-collection",
        "ps4-wipeout-omega-collection-only-on-playstation",
    )
    assert len({work_index["catalogIdToWorkKey"][catalog_id] for catalog_id in wipeout_ids}) == 1
    for catalog_id in wipeout_ids:
        assert [
            credit["company"]["slug"]
            for credit in batch_credits(details[catalog_id], "developer")
        ] == ["clever-beans", "epos-game-studios"]
    assert not batch_credits(details["ps4-usa-wipeout-omega-collection"])

    assert len(work_index["catalogIdToWorkKey"]) >= 1199
    assert len(set(work_index["catalogIdToWorkKey"].values())) == 1070
    assert report["summary"]["sourceReportedWorkIdentities"] == 1071

    non_game_ids = {row["catalog_id"] for row in non_games}
    assert len(non_game_ids) == 6
    for catalog_id in non_game_ids:
        game = catalog_by_id[catalog_id]
        assert game["listingStatus"] == "excluded"
        assert game["catalogKind"] != "game"
        assert all(catalog_id not in company.get("gameIds", []) for company in companies.values())
    listed_games = [
        game
        for game in catalog
        if game.get("listingStatus") != "excluded" and game.get("catalogKind", "game") == "game"
    ]
    assert meta["catalogListed"] == len(listed_games)

    assert len(conflicts) == 95
    for row in conflicts:
        role = importer.ROLE_NAMES[row["role"]]
        assert not batch_credits(details.get(row["catalog_id"], {}), role)

    assert verified == builder.build_index(details)
    assert report["summary"]["actions"] == {
        "ADD": 1499,
        "REPLACE": 74,
        "CONFIRM": 82,
        "SKIP_CHANGED": 0,
    }
    assert report["summary"]["sourceReportedReviewedRoles"] == 1760
    assert report["summary"]["extractedRoleRows"] == len(decisions) + len(conflicts) == 1750
    assert report["summary"]["sourceRoleCountDelta"] == 10
    assert report["catalogBefore"]["rows"] == report["catalogAfter"]["rows"]
    assert report["catalogBefore"]["uniqueIds"] == report["catalogAfter"]["uniqueIds"]
    assert report["companiesAfter"]["rows"] - report["companiesBefore"]["rows"] == 124
    assert all(report["scopeChecksAfter"].values())

    print(
        "OK PS4 PAL rapid-review semantics: 1655 reviewed role rows, "
        "1660 explicit credits, 95 conflicts blocked and 6 non-games excluded"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
