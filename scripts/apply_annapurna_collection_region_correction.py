#!/usr/bin/env python3
"""Retire the false PS4 PAL Spain Annapurna collection without losing user data."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CATALOG_FILE = DATA / "catalog.json"
COLLECTION_FILE = DATA / "collection.json"
LEGACY_GAMES_FILE = DATA / "games.json"
DETAILS_FILE = DATA / "game-details.json"
COMPANIES_FILE = DATA / "index/companies.json"
WORK_IDENTITIES_FILE = DATA / "index/catalog-work-identities.json"
COMMERCIAL_RELATIONS_FILE = DATA / "index/catalog-commercial-relations.json"
ROUTE_REDIRECTS_FILE = DATA / "catalog-route-redirects.json"
CAMPAIGN_FILE = DATA / "ebay-regional-campaigns/ps4.json"
META_FILE = DATA / "meta.json"
CURATION_FILE = DATA / "curation-report.json"
REPORT_FILE = DATA / "research/annapurna-collection-region-correction-report.json"
COMPILATION_APPLIER = ROOT / "scripts/apply_company_credit_ps4_pal_compilations.py"

OLD_ID = "ps4-annapurna-ultimate-collection"
USA_ID = "ps4-usa-annapurna-interactive-ultimate-ps4-collection"
DELUXE_USA_ID = "ps4-usa-annapurna-interactive-deluxe-limited-edition"
COLLECTION_ITEM_ID = "annapurna-ultimate-collection"
USA_TITLE = "Annapurna Interactive Ultimate PS4 Collection"
USA_ROUTE = "annapurna-interactive-ultimate-ps4-collection-ps4-pal-us"
LEGACY_ROUTE = "annapurna-ultimate-collection-ps4-pal-es"
BATCH_ID = "annapurna-collection-region-correction-2026-09-05"

ROLE_FIELDS = (
    "asDeveloper",
    "asPublisher",
    "asDigitalPublisher",
    "asPhysicalPublisherOrDistributor",
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def listed_game(game: dict[str, Any]) -> bool:
    return (
        game.get("listingStatus") != "excluded"
        and game.get("catalogKind", "game") == "game"
    )


def collection_protected(item: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in item.items()
        if key not in {"catalogId", "title", "region"}
    }


def remove_company_catalog_id(companies: dict[str, Any], catalog_id: str) -> list[str]:
    changed: list[str] = []
    for slug, entry in companies.items():
        touched = False
        for field in ("gameIds", *ROLE_FIELDS):
            values = entry.get(field)
            if isinstance(values, list) and catalog_id in values:
                entry[field] = [value for value in values if value != catalog_id]
                touched = True
        if touched:
            changed.append(slug)
    return changed


def refresh_company(entry: dict[str, Any], catalog_by_id: dict[str, dict[str, Any]]) -> None:
    for field in ROLE_FIELDS:
        if field in entry:
            entry[field] = list(dict.fromkeys(entry[field]))
    entry["gameIds"] = [
        catalog_id
        for catalog_id in dict.fromkeys(entry.get("gameIds", []))
        if catalog_id in catalog_by_id
    ]
    by_platform: dict[str, int] = {}
    for catalog_id in entry["gameIds"]:
        platform = catalog_by_id[catalog_id]["platformSlug"]
        by_platform[platform] = by_platform.get(platform, 0) + 1
    entry["byPlatform"] = dict(sorted(by_platform.items()))
    entry["gameCount"] = len(entry["gameIds"])


def update_campaign(campaign: dict[str, Any]) -> None:
    removed_from_pal_es = False
    for region in campaign.get("regions", {}).values():
        region_changed = False
        for key, value in region.items():
            if not key.endswith("CatalogIds") or not isinstance(value, list):
                continue
            filtered = [catalog_id for catalog_id in value if catalog_id != OLD_ID]
            if filtered != value:
                region[key] = filtered
                region_changed = True
        if region_changed and region.get("key") == "pal_es":
            removed_from_pal_es = True
            region["total"] = max(0, int(region.get("total") or 0) - 1)
        region["completed"] = len(region.get("completedCatalogIds", []))
        region["matched"] = len(region.get("matchedCatalogIds", []))
        region["noMatch"] = len(region.get("noMatchCatalogIds", []))
        region["deferred"] = len(region.get("deferredCatalogIds", []))
        region["pending"] = max(
            0,
            int(region.get("total") or 0)
            - region["completed"]
            - region["deferred"],
        )
    if not removed_from_pal_es and any(
        OLD_ID in value
        for region in campaign.get("regions", {}).values()
        for key, value in region.items()
        if key.endswith("CatalogIds") and isinstance(value, list)
    ):
        raise ValueError("The obsolete campaign entry could not be removed")
    campaign["totals"] = {
        "catalogGames": sum(int(region.get("total") or 0) for region in campaign["regions"].values()),
        "completed": sum(int(region.get("completed") or 0) for region in campaign["regions"].values()),
        "matched": sum(int(region.get("matched") or 0) for region in campaign["regions"].values()),
        "noMatch": sum(int(region.get("noMatch") or 0) for region in campaign["regions"].values()),
        "deferred": sum(int(region.get("deferred") or 0) for region in campaign["regions"].values()),
        "pending": sum(int(region.get("pending") or 0) for region in campaign["regions"].values()),
    }


def apply() -> dict[str, Any]:
    catalog = read_json(CATALOG_FILE)
    collection = read_json(COLLECTION_FILE)
    legacy_games = read_json(LEGACY_GAMES_FILE)
    details = read_json(DETAILS_FILE)
    companies = read_json(COMPANIES_FILE)
    work_identities = read_json(WORK_IDENTITIES_FILE)
    campaign = read_json(CAMPAIGN_FILE)

    catalog_by_id = {game["id"]: game for game in catalog}
    if len(catalog_by_id) != len(catalog):
        raise ValueError("Catalog IDs are not unique")
    old_game = catalog_by_id[OLD_ID]
    usa_game = catalog_by_id[USA_ID]
    deluxe_game = catalog_by_id[DELUXE_USA_ID]
    collection_index = next(
        index for index, item in enumerate(collection) if item.get("id") == COLLECTION_ITEM_ID
    )
    collection_item = collection[collection_index]

    if (
        old_game.get("listingStatus") == "excluded"
        and old_game.get("excludeCategory") == "duplicate"
        and collection_item.get("catalogId") == USA_ID
    ):
        check()
        return read_json(REPORT_FILE)

    if old_game.get("region") != "PAL España" or old_game.get("pcId") != usa_game.get("pcId"):
        raise ValueError("The reviewed PAL duplicate no longer matches the USA product")
    if usa_game.get("region") != "USA" or deluxe_game.get("region") != "USA":
        raise ValueError("The two reviewed Annapurna editions are no longer USA records")

    collection_before = copy.deepcopy(collection_item)
    listed_before = sum(listed_game(game) for game in catalog)
    catalog_ids_before = [game["id"] for game in catalog]

    old_game["listingStatus"] = "excluded"
    old_game["excludeCategory"] = "duplicate"
    old_game["excludeReason"] = (
        f"Retired by {BATCH_ID}; this physical release exists only as the USA catalog entry {USA_ID}"
    )

    collection_item.update(
        {
            "catalogId": USA_ID,
            "title": USA_TITLE,
            "region": "USA",
        }
    )
    legacy_matches = [item for item in legacy_games if item.get("id") == COLLECTION_ITEM_ID]
    if len(legacy_matches) != 1:
        raise ValueError("Expected one legacy collection row")
    legacy_matches[0].update({"title": USA_TITLE, "region": "USA"})

    details.pop(OLD_ID, None)
    changed_companies = remove_company_catalog_id(companies, OLD_ID)
    for slug in changed_companies:
        refresh_company(companies[slug], catalog_by_id)

    work_map = work_identities["catalogIdToWorkKey"]
    work_key = work_map.pop(OLD_ID, "annapurna ultimate collection")
    work_map[USA_ID] = work_key
    update_campaign(campaign)

    write_json(CATALOG_FILE, catalog)
    write_json(COLLECTION_FILE, collection)
    write_json(LEGACY_GAMES_FILE, legacy_games)
    write_json(DETAILS_FILE, details)
    write_json(COMPANIES_FILE, companies)
    write_json(WORK_IDENTITIES_FILE, work_identities)
    write_json(CAMPAIGN_FILE, campaign)

    subprocess.run(
        [sys.executable, str(COMPILATION_APPLIER), "--dry-run"],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(
        [sys.executable, str(COMPILATION_APPLIER), "--apply"],
        cwd=ROOT,
        check=True,
    )

    final_catalog = read_json(CATALOG_FILE)
    final_collection = read_json(COLLECTION_FILE)
    final_item = final_collection[collection_index]
    catalog_ids_after = [game["id"] for game in final_catalog]
    report = {
        "schemaVersion": 1,
        "batchId": BATCH_ID,
        "writesPerformed": True,
        "catalog": {
            "rowsBefore": len(catalog),
            "rowsAfter": len(final_catalog),
            "uniqueIdsBefore": len(catalog_by_id),
            "uniqueIdsAfter": len({game["id"] for game in final_catalog}),
            "orderedIdsSha256Before": json_hash(catalog_ids_before),
            "orderedIdsSha256After": json_hash(catalog_ids_after),
            "listedBefore": listed_before,
            "listedAfter": sum(listed_game(game) for game in final_catalog),
            "retiredCatalogId": OLD_ID,
            "canonicalCatalogId": USA_ID,
        },
        "collection": {
            "itemId": COLLECTION_ITEM_ID,
            "indexBefore": collection_index,
            "indexAfter": next(
                index
                for index, item in enumerate(final_collection)
                if item.get("id") == COLLECTION_ITEM_ID
            ),
            "protectedSha256Before": json_hash(collection_protected(collection_before)),
            "protectedSha256After": json_hash(collection_protected(final_item)),
            "catalogIdBefore": collection_before.get("catalogId"),
            "catalogIdAfter": final_item.get("catalogId"),
        },
    }
    report["checks"] = {
        "catalogRowsPreserved": report["catalog"]["rowsBefore"] == report["catalog"]["rowsAfter"],
        "catalogIdsPreserved": (
            report["catalog"]["uniqueIdsBefore"] == report["catalog"]["uniqueIdsAfter"]
            and report["catalog"]["orderedIdsSha256Before"]
            == report["catalog"]["orderedIdsSha256After"]
        ),
        "onePublicRecordRetired": report["catalog"]["listedBefore"] == report["catalog"]["listedAfter"] + 1,
        "collectionPositionPreserved": report["collection"]["indexBefore"] == report["collection"]["indexAfter"],
        "collectionDataPreserved": report["collection"]["protectedSha256Before"] == report["collection"]["protectedSha256After"],
    }
    if not all(report["checks"].values()):
        raise ValueError(f"Region correction invariant failed: {report['checks']}")
    write_json(REPORT_FILE, report)
    check()
    return report


def check() -> None:
    catalog = read_json(CATALOG_FILE)
    collection = read_json(COLLECTION_FILE)
    legacy_games = read_json(LEGACY_GAMES_FILE)
    details = read_json(DETAILS_FILE)
    companies = read_json(COMPANIES_FILE)
    work_map = read_json(WORK_IDENTITIES_FILE)["catalogIdToWorkKey"]
    commercial = read_json(COMMERCIAL_RELATIONS_FILE)
    redirects = read_json(ROUTE_REDIRECTS_FILE)
    campaign = read_json(CAMPAIGN_FILE)
    meta = read_json(META_FILE)
    curation = read_json(CURATION_FILE)
    report = read_json(REPORT_FILE)

    catalog_by_id = {game["id"]: game for game in catalog}
    assert len(catalog_by_id) == len(catalog)
    assert catalog_by_id[OLD_ID]["listingStatus"] == "excluded"
    assert catalog_by_id[OLD_ID]["excludeCategory"] == "duplicate"
    assert catalog_by_id[USA_ID]["listingStatus"] == "listed"
    assert catalog_by_id[USA_ID]["region"] == "USA"
    assert catalog_by_id[DELUXE_USA_ID]["listingStatus"] == "listed"
    assert catalog_by_id[DELUXE_USA_ID]["region"] == "USA"
    assert [
        game["id"]
        for game in catalog
        if listed_game(game) and game.get("pcId") == catalog_by_id[USA_ID].get("pcId")
    ] == [USA_ID]

    owned = [item for item in collection if item.get("id") == COLLECTION_ITEM_ID]
    assert len(owned) == 1
    assert owned[0]["catalogId"] == USA_ID
    assert owned[0]["title"] == USA_TITLE
    assert owned[0]["region"] == "USA"
    assert report["collection"]["indexBefore"] == report["collection"]["indexAfter"]
    assert report["collection"]["protectedSha256Before"] == report["collection"]["protectedSha256After"]

    legacy = [item for item in legacy_games if item.get("id") == COLLECTION_ITEM_ID]
    assert len(legacy) == 1 and legacy[0]["region"] == "USA"
    assert OLD_ID not in details
    assert details[USA_ID]["developer"] is None
    assert details[USA_ID]["publisher"]["slug"] == "annapurna-interactive"
    assert {
        (credit["role"], credit["company"]["slug"])
        for credit in details[USA_ID]["companyCredits"]
    } == {
        ("originalPublisher", "annapurna-interactive"),
        ("physicalPublisherOrDistributor", "iam8bit"),
    }

    assert all(
        OLD_ID not in entry.get(field, [])
        for entry in companies.values()
        for field in ("gameIds", *ROLE_FIELDS)
    )
    assert USA_ID in companies["annapurna-interactive"]["asPublisher"]
    assert USA_ID in companies["iam8bit"]["asPhysicalPublisherOrDistributor"]
    assert USA_ID not in companies["annapurna"].get("asDeveloper", [])
    assert USA_ID not in companies["skybound-games"].get("asPublisher", [])

    assert OLD_ID not in work_map
    assert work_map[USA_ID] == "annapurna ultimate collection"
    compilation = next(
        item
        for item in commercial["compilations"]
        if item["id"] == "compilation:annapurna-ultimate-collection"
    )
    assert compilation["catalogId"] == USA_ID
    assert compilation["title"] == USA_TITLE
    assert compilation["componentCount"] == 8

    redirect = next(
        item for item in redirects["redirects"] if OLD_ID in item["sourceParams"]
    )
    assert LEGACY_ROUTE in redirect["sourceParams"]
    assert redirect["targetCatalogId"] == USA_ID
    assert redirect["targetParam"] == USA_ROUTE

    for region in campaign["regions"].values():
        for key, value in region.items():
            if key.endswith("CatalogIds") and isinstance(value, list):
                assert OLD_ID not in value
        assert region["completed"] == len(region.get("completedCatalogIds", []))
        assert region["matched"] == len(region.get("matchedCatalogIds", []))
        assert region["noMatch"] == len(region.get("noMatchCatalogIds", []))
        assert region["deferred"] == len(region.get("deferredCatalogIds", []))

    listed = [game for game in catalog if listed_game(game)]
    excluded = [game for game in catalog if not listed_game(game)]
    assert meta["catalogListed"] == len(listed) == curation["listed"]
    assert meta["catalogExcluded"] == len(excluded) == curation["excluded"]
    assert meta["catalogTotal"] == len(catalog) == curation["total"]
    assert meta["listedByPlatform"]["ps4"] == sum(
        game["platformSlug"] == "ps4" for game in listed
    )
    assert report["writesPerformed"] is True
    assert all(report["checks"].values())
    print(
        "OK Annapurna region correction: PAL record retired, USA record canonical, "
        "collection data and position preserved"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.apply:
        report = apply()
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        check()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
