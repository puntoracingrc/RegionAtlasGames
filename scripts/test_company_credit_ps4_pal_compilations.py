#!/usr/bin/env python3
"""Semantic guards for the verified PS4 PAL compilations and credits batch."""

from __future__ import annotations

import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BATCH_ID = "company-credit-ps4-pal-compilations-2026-09-05"
ANNAPURNA_LEGACY_PAL_ID = "ps4-annapurna-ultimate-collection"
ANNAPURNA_USA_ID = "ps4-usa-annapurna-interactive-ultimate-ps4-collection"
EXPECTED_ACTIONS = {
    "ADD_COMPONENT": 82,
    "ADD_CORPORATE_RELATION": 6,
    "ADD_CO_DEVELOPER": 4,
    "LINK_VARIANT": 13,
    "MERGE_DUPLICATE": 3,
    "MOVE_PLATFORM": 4,
    "NORMALIZE_ALIAS": 19,
    "REMOVE_GENERIC_NON_GAME": 1,
    "REQUIRES_REVIEW": 9,
    "UPDATE_CREDITS": 77,
}
EXPECTED_CREDIT_ROLES = {
    "developer": 63,
    "digitalPublisher": 1,
    "originalDeveloper": 6,
    "originalPublisher": 72,
    "physicalPublisherOrDistributor": 79,
    "portDeveloper": 5,
    "regionalPublisher": 20,
    "remasterDeveloper": 1,
}


def load_json(relative_path: str):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def load_module(relative_path: str, name: str):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {relative_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def batch_company_credits(detail: dict) -> list[dict]:
    return [
        credit
        for credit in detail.get("companyCredits", [])
        if credit.get("provenance", {}).get("reviewBatch") == BATCH_ID
    ]


def developer_slugs(details: dict, catalog_id: str) -> list[str]:
    return [
        credit["company"]["slug"]
        for credit in batch_company_credits(details[catalog_id])
        if credit["role"] == "developer"
    ]


def main() -> int:
    importer = load_module(
        "scripts/apply_company_credit_ps4_pal_compilations.py",
        "ps4_pal_compilations_importer",
    )
    builder = load_module(
        "scripts/build_verified_company_credit_index.py",
        "verified_credit_builder_compilations",
    )
    importer.validate_committed()

    catalog = load_json("data/catalog.json")
    details = load_json("data/game-details.json")
    companies = load_json("data/index/companies.json")
    verified = load_json("data/index/verified-company-credits.json")
    commercial = load_json("data/index/catalog-commercial-relations.json")
    aliases = load_json("data/index/verified-company-aliases.json")
    company_relations = load_json("data/index/verified-company-relations.json")
    redirects = load_json("data/catalog-route-redirects.json")
    source = load_json("data/research/ps4-pal-compilations-source.json")
    dry_run = load_json("data/research/company-credit-ps4-pal-compilations-dry-run.json")
    report = load_json("data/research/company-credit-ps4-pal-compilations-report.json")

    catalog_by_id = {game["id"]: game for game in catalog}
    assert len(catalog_by_id) == len(catalog)
    assert source["workbook"]["sha256"] == importer.WORKBOOK_SHA256
    assert report["writesPerformed"] is True
    assert report["summary"]["catalogRowsBefore"] == report["summary"]["catalogRowsAfter"]
    assert report["summary"]["uniqueIdsBefore"] == report["summary"]["uniqueIdsAfter"]
    assert all(report["scopeChecks"].values())
    assert dry_run["report"]["summary"]["actions"] == EXPECTED_ACTIONS

    all_batch_credits = [
        credit
        for detail in details.values()
        for credit in batch_company_credits(detail)
    ]
    assert Counter(credit["role"] for credit in all_batch_credits) == EXPECTED_CREDIT_ROLES
    assert all(
        credit["provenance"]["evidenceUrls"]
        and credit["provenance"]["evidenceSummary"]
        and credit["provenance"]["reviewedAt"] == "2026-09-05"
        for credit in all_batch_credits
    )

    batch_catalog_ids = {
        catalog_id
        for catalog_id, detail in details.items()
        if batch_company_credits(detail)
    }
    assert len(batch_catalog_ids) == 83
    assert all(
        (
            catalog_by_id[catalog_id]["platformSlug"] == "ps4"
            and str(catalog_by_id[catalog_id]["region"]).startswith("PAL")
        )
        or (
            catalog_id == ANNAPURNA_USA_ID
            and catalog_by_id[catalog_id]["platformSlug"] == "ps4"
            and catalog_by_id[catalog_id]["region"] == "USA"
        )
        for catalog_id in batch_catalog_ids
    )
    assert ANNAPURNA_LEGACY_PAL_ID not in batch_catalog_ids
    assert catalog_by_id[ANNAPURNA_LEGACY_PAL_ID]["listingStatus"] == "excluded"
    assert catalog_by_id[ANNAPURNA_LEGACY_PAL_ID]["excludeCategory"] == "duplicate"
    assert catalog_by_id[ANNAPURNA_USA_ID]["listingStatus"] == "listed"

    assert developer_slugs(details, "ps4-demon-pit") == ["psychic-software", "doomcube"]
    assert developer_slugs(details, "ps4-koa-and-the-five-pirates-of-mara") == [
        "chibig",
        "talpa-games",
        "undercoders",
    ]
    assert developer_slugs(details, "ps4-street-power-football") == [
        "sfl-interactive",
        "gamajun-games",
    ]
    assert developer_slugs(details, "ps4-mindtaker") == ["relevo", "virtualware"]

    role_cases = {
        "ps4-quivr": {"originalDeveloper": ["blueteak"], "portDeveloper": ["alvios"]},
        "ps4-rogue-trooper-redux": {
            "originalDeveloper": ["rebellion-developments"],
            "remasterDeveloper": ["ticktock-games"],
        },
        "ps4-the-rumble-fish-2": {
            "originalDeveloper": ["dimps-corporation"],
            "portDeveloper": ["suncrest-games"],
        },
    }
    for catalog_id, expected_roles in role_cases.items():
        credits = batch_company_credits(details[catalog_id])
        for role, expected_slugs in expected_roles.items():
            assert [
                credit["company"]["slug"] for credit in credits if credit["role"] == role
            ] == expected_slugs

    individual_credits = [
        credit
        for detail in details.values()
        for credit in detail.get("individualCredits", [])
        if credit.get("provenance", {}).get("reviewBatch") == BATCH_ID
    ]
    assert len(individual_credits) == 3
    individual_slugs = {credit["person"]["slug"] for credit in individual_credits}
    assert not individual_slugs & set(report["companiesCreated"])
    assert all(
        credit["company"]["slug"] not in individual_slugs for credit in all_batch_credits
    )

    assert len(commercial["compilations"]) == 24
    assert sum(item["componentCount"] for item in commercial["compilations"]) == 82
    assert sum(item["status"] == "verified" for item in commercial["compilations"]) == 23
    assert sum(
        bool(component["catalogId"])
        for compilation in commercial["compilations"]
        for component in compilation["components"]
    ) == 42
    assert all(
        component["catalogId"] in catalog_by_id
        for compilation in commercial["compilations"]
        for component in compilation["components"]
        if component["catalogId"]
    )
    assert len(commercial["variants"]) == 15
    assert sum(item["status"] == "verified" for item in commercial["variants"]) == 13
    assert sum(item["status"] == "requires_review" for item in commercial["variants"]) == 2

    assert len(aliases["aliases"]) == 19
    for item in aliases["aliases"]:
        assert set(item["aliases"]) <= set(companies[item["companySlug"]]["aliasNames"])
        assert item["provenance"]["evidenceUrls"]
    assert len(company_relations["relationships"]) == 6
    assert all(
        relation["sourceCompanySlug"] in companies
        and relation["targetCompanySlug"] in companies
        and relation["provenance"]["evidenceUrls"]
        for relation in company_relations["relationships"]
    )

    assert len(redirects["redirects"]) == 7
    for redirect in redirects["redirects"]:
        assert redirect["targetCatalogId"] in catalog_by_id
        assert catalog_by_id[redirect["targetCatalogId"]]["listingStatus"] == "listed"
    assert catalog_by_id["ps4-not-for-resale"]["catalogKind"] == "non_game_marker"
    assert catalog_by_id["ps4-not-for-resale"]["listingStatus"] == "excluded"
    assert catalog_by_id["ps4-dark-souls-ii-scholar-of-the-first-sin-not-for-resale"][
        "physicalVariant"
    ] == "not-for-resale"

    assert verified == builder.build_index(details)
    assert all(catalog_id in verified["credits"] for catalog_id in batch_catalog_ids)

    print(
        "OK PS4 PAL compilations semantics: 83 credited entries, 247 company credits, "
        "82 components, 13 verified variants, 7 redirects and 9 blocked cases"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
