#!/usr/bin/env python3
"""Apply the reviewed Resident Evil PS4 identity corrections."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BATCH = "resident-evil-ps4-dedup-20260915"
REVIEWED_AT = "2026-09-15"

RETIRED_VILLAGE_ID = "ps4-resident-evil-8-village"
CANONICAL_VILLAGE_ID = "ps4-resident-evil-village"
PENDING_RE7_GOLD_ID = "ps4-japon-biohazard-7-gold"

CATALOG_FILE = ROOT / "data/catalog.json"
DETAILS_FILE = ROOT / "data/game-details.json"
ALIASES_FILE = ROOT / "data/catalog-id-aliases.json"
ROUTES_FILE = ROOT / "data/catalog-route-redirects.json"
COMPANIES_FILE = ROOT / "data/index/companies.json"
WORK_IDENTITIES_FILE = ROOT / "data/index/catalog-work-identities.json"
META_FILE = ROOT / "data/meta.json"
CURATION_REPORT_FILE = ROOT / "data/curation-report.json"
COMPANY_RESEARCH_MANIFEST_FILE = ROOT / "data/research/company-study/manifest.json"
PERSON_RESEARCH_MANIFEST_FILE = ROOT / "data/research/person-study/manifest.json"
SCANS_FILE = ROOT / "data/catalog-owned-scans.json"
GUIDE_FILE = ROOT / "data/catalog-edition-guides-resident-evil-ps4.json"
AUDIT_FILE = ROOT / "data/research/resident-evil-ps4-dedup-2026-09-15.json"

PROTECTED_BEFORE_HASHES = {
    "data/index/companies.json": "3bff5d0feeaf0ded52cce367d76629b8f64c2e5d38b1f4a5b871765ff04a0dab",
    "data/game-details.json": "e751e84adbe6677001f31e835212f0069141b0b89a409cc7bd84273973bc4972",
}
PROTECTED_MANIFEST_FILES = [
    COMPANY_RESEARCH_MANIFEST_FILE,
    PERSON_RESEARCH_MANIFEST_FILE,
]

VILLAGE_WORK_KEY = "catalog-entry:ps4-resident-evil-village"
RE7_WORK_KEY = "resident evil 7"
RE4_REMAKE_WORK_KEY = "resident evil 4 remake"

VILLAGE_CATALOG_IDS = [
    RETIRED_VILLAGE_ID,
    CANONICAL_VILLAGE_ID,
    "ps4-usa-resident-evil-village",
    "ps4-japon-biohazard-village",
    "ps4-usa-resident-evil-village-gold-edition",
    "ps4-japon-biohazard-village-gold-edition",
    "ps4-usa-resident-evil-village-collector%27s-edition",
    "ps4-japon-biohazard-village-z-version-collector%27s-edition",
    "ps4-usa-resident-evil-village-deluxe-edition",
    "ps4-japon-biohazard-village-premium-set",
    "ps4-japon-biohazard-village-z-version",
    "ps4-resident-evil-village-collector%27s-edition",
    "ps4-resident-evil-village-gold-edition",
    "ps4-resident-evil-village-steelbook-edition",
]

RE7_CATALOG_IDS = [
    "ps4-resident-evil-7-biohazard",
    "ps4-usa-resident-evil-7-biohazard",
    "ps4-japon-biohazard-7-resident-evil",
    "ps4-resident-evil-7-biohazard-gold-edition",
    "ps4-usa-resident-evil-7-biohazard-gold-edition",
    "ps4-japon-biohazard-7-resident-evil-gold-edition",
    "ps4-usa-resident-evil-7-biohazard-collector%27s-edition",
    "ps4-usa-resident-evil-7-biohazard-deluxe-edition",
    "ps4-japon-biohazard-7-resident-evil-limited-edition",
    "ps4-resident-evil-7-steelbook",
    "ps4-usa-resident-evil-7-biohazard-playstation-hits",
    "ps4-japon-biohazard-7-grotesque-version",
    "ps4-resident-evil-7-biohazard-collector%27s-edition",
    "ps4-resident-evil-7-biohazard-lenticular-edition",
    "ps4-resident-evil-7-biohazard-not-for-resale",
    "ps4-resident-evil-7-biohazard-playstation-hits",
    "ps4-resident-evil-7-biohazard-steelbook-edition",
]

RE4_REMAKE_CATALOG_IDS = [
    "ps4-resident-evil-4-remake",
    "ps4-usa-resident-evil-4-remake",
    "ps4-resident-evil-4-gold-edition",
    "ps4-japon-biohazard-re4-gold-edition",
    "ps4-usa-resident-evil-4-collector%27s-edition",
    "ps4-japon-resident-evil-4-remake-collector%27s-edition",
    "ps4-resident-evil-4-remake-steelbook",
    "ps4-resident-evil-4-remake-collector%27s-edition",
    "ps4-resident-evil-4-remake-lenticular-edition",
    "ps4-resident-evil-4-remake-steelbook-edition",
]

PROTECTED_DISTINCT_EDITION_IDS = [
    "ps4-usa-resident-evil-village-collector%27s-edition",
    "ps4-usa-resident-evil-village-deluxe-edition",
    "ps4-usa-resident-evil-village-gold-edition",
    "ps4-usa-resident-evil-7-biohazard-collector%27s-edition",
    "ps4-usa-resident-evil-7-biohazard-deluxe-edition",
    "ps4-resident-evil-7-steelbook",
    "ps4-usa-resident-evil-7-biohazard-playstation-hits",
    "ps4-japon-biohazard-7-resident-evil-limited-edition",
    "ps4-resident-evil-4-gold-edition",
    "ps4-usa-resident-evil-4-collector%27s-edition",
    "ps4-resident-evil-4-remake-steelbook",
]

SCAN_SET_IDS = [
    "ps4-resident-evil-village",
    "ps4-resident-evil-7-biohazard-gold-edition",
    "ps4-resident-evil-4-remake-steelbook",
]

PRICE_FIELDS = [
    "pcCondition",
    "matchConfidence",
    "marketMin",
    "marketMax",
    "recommendedPrice",
    "estimatedPriceLoose",
    "estimatedPriceGameManual",
    "estimatedPriceComplete",
    "estimatedPriceSealed",
    "estimatedPriceNewRetail",
    "estimatedShippingToSpainLoose",
    "estimatedShippingToSpainGameManual",
    "estimatedShippingToSpainComplete",
    "estimatedShippingToSpainSealed",
    "estimatedTotalToSpainLoose",
    "estimatedTotalToSpainGameManual",
    "estimatedTotalToSpainComplete",
    "estimatedTotalToSpainSealed",
    "priceDataSources",
    "priceChartingLooseUsd",
    "priceChartingCompleteUsd",
    "priceChartingSealedUsd",
    "priceChartingCurrency",
    "priceChartingUsdPerEur",
    "priceChartingExchangeRateDate",
    "priceChartingCollectedAt",
    "pcRefPrice",
    "deltaEsVsPc",
    "priceSource",
    "updatedAt",
    "hasEsPrice",
    "priceRegionVerified",
    "gameRetailPrice",
    "gameCondition",
    "gameMatchedAt",
    "cexSellPrice",
    "cexCashPrice",
    "cexProductUrl",
    "cexMatchedAt",
    "cexRegionVerified",
    "jgoRetailPrice",
    "jgoProductUrl",
    "jgoMatchedAt",
    "jgoCondition",
    "jgoInStock",
    "cholloRetailPrice",
    "cholloProductUrl",
    "cholloMatchedAt",
    "cholloCondition",
    "cholloInStock",
    "kaotoRetailPrice",
    "kaotoProductUrl",
    "kaotoMatchedAt",
    "kaotoCondition",
    "kaotoInStock",
    "tcListingPrice",
    "tcProductUrl",
    "tcMatchedAt",
    "tcnsRetailPrice",
    "tcnsProductUrl",
    "tcnsMatchedAt",
    "tcnsCondition",
    "tcnsInStock",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_array_row(path: Path, catalog_id: str, value: dict[str, Any]) -> None:
    text = path.read_text(encoding="utf-8")
    marker = '  {\n    "id": ' + json.dumps(catalog_id)
    start = text.index(marker)
    end = text.index("\n  }", start) + 4
    replacement = "\n".join(
        "  " + line
        for line in json.dumps(value, ensure_ascii=False, indent=2).splitlines()
    )
    updated = text[:start] + replacement + text[end:]
    json.loads(updated)
    path.write_text(updated, encoding="utf-8")


def replace_object_value(path: Path, key: str, value: Any) -> None:
    text = path.read_text(encoding="utf-8")
    marker = json.dumps(key, ensure_ascii=False) + ":"
    start = text.index(marker) + len(marker)
    while text[start].isspace():
        start += 1
    _, length = json.JSONDecoder().raw_decode(text[start:])
    end = start + length
    replacement = json.dumps(value, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    updated = text[:start] + replacement + text[end:]
    json.loads(updated)
    path.write_text(updated, encoding="utf-8")


def nonempty(value: Any) -> bool:
    return value not in (None, "", [], {})


def dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def credit_key(credit: dict[str, Any]) -> tuple[str, str, str]:
    company = credit.get("company") or {}
    provenance = credit.get("provenance") or {}
    return (
        str(credit.get("role") or ""),
        str(company.get("slug") or company.get("name") or ""),
        str(provenance.get("reviewBatch") or ""),
    )


def merge_village_catalog_rows(
    retired: dict[str, Any], canonical: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    expected_identity = ("ps4", "PAL España", "standard", 2164917)
    for row in (retired, canonical):
        actual = (
            row.get("platformSlug"),
            row.get("region"),
            row.get("edition"),
            row.get("pcId"),
        )
        if actual != expected_identity:
            raise AssertionError(f"Village identity changed: {row.get('id')} -> {actual}")

    merged = copy.deepcopy(canonical)
    for field in PRICE_FIELDS:
        retired_value = retired.get(field)
        if field in {"pcCondition", "matchConfidence"}:
            if nonempty(retired_value):
                merged[field] = retired_value
        elif nonempty(retired_value) or retired_value is False:
            if not nonempty(merged.get(field)) or merged.get(field) is False:
                merged[field] = copy.deepcopy(retired_value)

    merged.update(
        {
            "id": CANONICAL_VILLAGE_ID,
            "slug": "resident-evil-village",
            "title": "Resident Evil Village",
            "titlePc": "Resident Evil Village",
            "coverUrl": canonical["coverUrl"],
            "listingStatus": "listed",
            "regionVerified": True,
        }
    )
    merged.pop("excludeCategory", None)
    merged.pop("excludeReason", None)

    archived = copy.deepcopy(retired)
    archived.update(
        {
            "listingStatus": "excluded",
            "excludeCategory": "duplicate",
            "excludeReason": (
                "Misma edición PS4 PAL España que ps4-resident-evil-village: "
                "plataforma, mercado, edición y pcId 2164917 coinciden. "
                "Datos, portada legacy y relaciones conservados mediante alias y redirección."
            ),
        }
    )
    return merged, archived


def merge_village_details(
    retired: dict[str, Any], canonical: dict[str, Any]
) -> dict[str, Any]:
    merged = copy.deepcopy(canonical)
    credits = [copy.deepcopy(credit) for credit in merged.get("companyCredits") or []]
    seen = {credit_key(credit) for credit in credits}
    for credit in retired.get("companyCredits") or []:
        key = credit_key(credit)
        if key not in seen:
            credits.append(copy.deepcopy(credit))
            seen.add(key)
    if credits:
        merged["companyCredits"] = credits
    return merged


def replace_company_catalog_id(
    companies: dict[str, Any], catalog_by_id: dict[str, dict[str, Any]]
) -> list[str]:
    changed: list[str] = []
    role_fields = [
        "gameIds",
        "asDeveloper",
        "asPublisher",
        "asDigitalPublisher",
        "asPhysicalPublisherOrDistributor",
    ]
    for slug, company in companies.items():
        touched = False
        for field in role_fields:
            values = company.get(field)
            if not isinstance(values, list) or RETIRED_VILLAGE_ID not in values:
                continue
            company[field] = dedupe(
                CANONICAL_VILLAGE_ID if value == RETIRED_VILLAGE_ID else value
                for value in values
            )
            touched = True
        if not touched:
            continue
        company["gameCount"] = len(company.get("gameIds") or [])
        by_platform = Counter(
            catalog_by_id[catalog_id]["platformSlug"]
            for catalog_id in company.get("gameIds") or []
            if catalog_id in catalog_by_id
        )
        company["byPlatform"] = dict(sorted(by_platform.items()))
        changed.append(slug)
    return changed


def catalog_counts(catalog: list[dict[str, Any]]) -> dict[str, Any]:
    listed = [row for row in catalog if row.get("listingStatus") != "excluded"]
    excluded = [row for row in catalog if row.get("listingStatus") == "excluded"]
    return {
        "total": len(catalog),
        "listed": len(listed),
        "excluded": len(excluded),
        "byCategory": dict(
            Counter(
                row.get("excludeCategory") or "other"
                for row in excluded
            )
        ),
        "listedByPlatform": dict(
            sorted(Counter(row["platformSlug"] for row in listed).items())
        ),
        "excludedByPlatform": dict(
            sorted(Counter(row["platformSlug"] for row in excluded).items())
        ),
    }


def guide_catalog_ids(guide_document: dict[str, Any]) -> set[str]:
    return {
        catalog_id
        for guide in guide_document["guides"]
        for edition in guide["physicalEditions"]
        for catalog_id in edition.get("catalogIds") or []
    }


def collect_preserved_images(scans: dict[str, Any]) -> list[dict[str, str]]:
    images: list[dict[str, str]] = [
        {
            "catalogId": RETIRED_VILLAGE_ID,
            "role": "legacy-cover",
            "url": "/covers/ps4/resident-evil-8-village.jpg",
        }
    ]
    for scan_id in SCAN_SET_IDS:
        scan_set = scans["games"][scan_id]
        for image in scan_set["images"]:
            images.append(
                {
                    "catalogId": scan_id,
                    "role": image["role"],
                    "url": image["url"],
                }
            )
    return images


def expected_route() -> dict[str, Any]:
    return {
        "sourceParams": [
            RETIRED_VILLAGE_ID,
            "resident-evil-8-village",
            "resident-evil-8-village-ps4-pal-es",
        ],
        "targetCatalogId": CANONICAL_VILLAGE_ID,
        "targetParam": "resident-evil-village-ps4-pal-es",
        "permanent": True,
        "reason": "same_product",
        "reviewedAt": REVIEWED_AT,
        "reviewBatch": BATCH,
    }


def assert_final_state() -> dict[str, Any]:
    catalog = read_json(CATALOG_FILE)
    catalog_by_id = {row["id"]: row for row in catalog}
    details = read_json(DETAILS_FILE)
    aliases = read_json(ALIASES_FILE)
    routes = read_json(ROUTES_FILE)
    companies = read_json(COMPANIES_FILE)
    work = read_json(WORK_IDENTITIES_FILE)["catalogIdToWorkKey"]
    meta = read_json(META_FILE)
    curation = read_json(CURATION_REPORT_FILE)
    protected_manifests = [read_json(path) for path in PROTECTED_MANIFEST_FILES]
    scans = read_json(SCANS_FILE)
    guide = read_json(GUIDE_FILE)
    audit = read_json(AUDIT_FILE)

    retired = catalog_by_id[RETIRED_VILLAGE_ID]
    canonical = catalog_by_id[CANONICAL_VILLAGE_ID]
    assert retired["listingStatus"] == "excluded"
    assert retired["excludeCategory"] == "duplicate"
    assert aliases[RETIRED_VILLAGE_ID] == CANONICAL_VILLAGE_ID
    assert canonical["recommendedPrice"] == 16
    assert canonical["pcRefPrice"] == 31.25
    assert canonical["deltaEsVsPc"] == -48.8
    assert canonical["hasEsPrice"] is True
    assert canonical["coverUrl"] == scans["games"][CANONICAL_VILLAGE_ID]["primaryCoverUrl"]
    assert any(
        route == expected_route() for route in routes["redirects"]
    ), "Village legacy route is missing"

    canonical_credit_keys = {
        credit_key(credit) for credit in details[CANONICAL_VILLAGE_ID].get("companyCredits") or []
    }
    retired_credit_keys = {
        credit_key(credit) for credit in details[RETIRED_VILLAGE_ID].get("companyCredits") or []
    }
    assert retired_credit_keys <= canonical_credit_keys

    for company in companies.values():
        for field in (
            "gameIds",
            "asDeveloper",
            "asPublisher",
            "asDigitalPublisher",
            "asPhysicalPublisherOrDistributor",
        ):
            assert RETIRED_VILLAGE_ID not in (company.get(field) or [])
    assert CANONICAL_VILLAGE_ID in companies["capcom"]["asPhysicalPublisherOrDistributor"]

    for catalog_id in VILLAGE_CATALOG_IDS:
        assert work[catalog_id] == VILLAGE_WORK_KEY
    for catalog_id in RE7_CATALOG_IDS:
        assert work[catalog_id] == RE7_WORK_KEY
    for catalog_id in RE4_REMAKE_CATALOG_IDS:
        assert work[catalog_id] == RE4_REMAKE_WORK_KEY
    assert work.get("ps4-resident-evil-4") != RE4_REMAKE_WORK_KEY
    assert work.get(PENDING_RE7_GOLD_ID) != RE7_WORK_KEY
    assert PENDING_RE7_GOLD_ID not in aliases

    linked_ids = guide_catalog_ids(guide)
    assert PENDING_RE7_GOLD_ID not in linked_ids
    assert RETIRED_VILLAGE_ID not in linked_ids
    for catalog_id in PROTECTED_DISTINCT_EDITION_IDS:
        assert catalog_id in catalog_by_id
        assert catalog_id not in aliases

    counts = catalog_counts(catalog)
    assert meta["catalogTotal"] == counts["total"]
    assert meta["catalogListed"] == counts["listed"]
    assert meta["catalogExcluded"] == counts["excluded"]
    assert meta["listedByPlatform"] == counts["listedByPlatform"]
    assert meta["excludedByPlatform"] == counts["excludedByPlatform"]
    assert meta["curationByCategory"] == counts["byCategory"]
    assert curation == counts

    for protected_manifest in protected_manifests:
        protected_update = next(
            (
                update
                for update in protected_manifest["protectedFileHashUpdates"]
                if update["batchId"] == BATCH
            ),
            None,
        )
        assert protected_update is not None
        for relative_path, before_hash in PROTECTED_BEFORE_HASHES.items():
            current_hash = sha256_file(ROOT / relative_path)
            assert protected_update["files"][relative_path] == {
                "before": before_hash,
                "after": current_hash,
            }
            assert protected_manifest["protectedFileHashes"][relative_path] == current_hash

    preserved_images = collect_preserved_images(scans)
    assert len(preserved_images) == 10
    assert audit["batchId"] == BATCH
    assert audit["canonicalEntities"]["village"] == CANONICAL_VILLAGE_ID
    assert audit["preservation"]["imageCount"] == len(preserved_images)
    assert audit["pendingReview"][0]["catalogId"] == PENDING_RE7_GOLD_ID
    assert audit["pendingReview"][0]["status"] == "PENDING_REVIEW"

    return {
        "canonicalVillageId": CANONICAL_VILLAGE_ID,
        "retiredVillageId": RETIRED_VILLAGE_ID,
        "catalogListed": counts["listed"],
        "catalogExcluded": counts["excluded"],
        "preservedImages": len(preserved_images),
        "pendingReview": PENDING_RE7_GOLD_ID,
    }


def apply() -> dict[str, Any]:
    catalog = read_json(CATALOG_FILE)
    catalog_by_id = {row["id"]: row for row in catalog}
    missing = sorted(
        set(VILLAGE_CATALOG_IDS + RE7_CATALOG_IDS + RE4_REMAKE_CATALOG_IDS + [PENDING_RE7_GOLD_ID])
        - set(catalog_by_id)
    )
    if missing:
        raise AssertionError(f"Missing reviewed catalog IDs: {missing}")

    retired_before = copy.deepcopy(catalog_by_id[RETIRED_VILLAGE_ID])
    canonical_before = copy.deepcopy(catalog_by_id[CANONICAL_VILLAGE_ID])
    canonical_after, retired_after = merge_village_catalog_rows(
        retired_before, canonical_before
    )
    replace_array_row(CATALOG_FILE, CANONICAL_VILLAGE_ID, canonical_after)
    replace_array_row(CATALOG_FILE, RETIRED_VILLAGE_ID, retired_after)

    catalog_by_id[CANONICAL_VILLAGE_ID] = canonical_after
    catalog_by_id[RETIRED_VILLAGE_ID] = retired_after
    catalog = [catalog_by_id[row["id"]] for row in catalog]

    details = read_json(DETAILS_FILE)
    details_after = merge_village_details(
        details[RETIRED_VILLAGE_ID], details[CANONICAL_VILLAGE_ID]
    )
    replace_object_value(DETAILS_FILE, CANONICAL_VILLAGE_ID, details_after)

    aliases = read_json(ALIASES_FILE)
    existing_alias = aliases.get(RETIRED_VILLAGE_ID)
    if existing_alias not in (None, CANONICAL_VILLAGE_ID):
        raise AssertionError(f"Conflicting Village alias: {existing_alias}")
    aliases[RETIRED_VILLAGE_ID] = CANONICAL_VILLAGE_ID
    write_json(ALIASES_FILE, aliases)

    routes = read_json(ROUTES_FILE)
    route = expected_route()
    matching_routes = [
        entry
        for entry in routes["redirects"]
        if RETIRED_VILLAGE_ID in entry.get("sourceParams", [])
    ]
    if matching_routes and matching_routes != [route]:
        raise AssertionError(f"Conflicting Village route: {matching_routes}")
    if not matching_routes:
        routes["redirects"].append(route)
    write_json(ROUTES_FILE, routes)

    companies = read_json(COMPANIES_FILE)
    changed_companies = replace_company_catalog_id(companies, catalog_by_id)
    for slug in changed_companies:
        replace_object_value(COMPANIES_FILE, slug, companies[slug])

    protected_files = {
        relative_path: {
            "before": before_hash,
            "after": sha256_file(ROOT / relative_path),
        }
        for relative_path, before_hash in PROTECTED_BEFORE_HASHES.items()
    }
    for manifest_path in PROTECTED_MANIFEST_FILES:
        protected_manifest = read_json(manifest_path)
        existing_protected_update = next(
            (
                update
                for update in protected_manifest["protectedFileHashUpdates"]
                if update["batchId"] == BATCH
            ),
            None,
        )
        if existing_protected_update is None:
            for relative_path, before_hash in PROTECTED_BEFORE_HASHES.items():
                if protected_manifest["protectedFileHashes"].get(relative_path) != before_hash:
                    raise AssertionError(
                        f"Protected hash chain changed before {BATCH}: {manifest_path} / {relative_path}"
                    )
            protected_manifest["protectedFileHashUpdates"].append(
                {
                    "batchId": BATCH,
                    "reviewedAt": REVIEWED_AT,
                    "files": protected_files,
                }
            )
        elif existing_protected_update["files"] != protected_files:
            raise AssertionError(f"Protected hash update drifted: {manifest_path} / {BATCH}")
        for relative_path, hashes in protected_files.items():
            protected_manifest["protectedFileHashes"][relative_path] = hashes["after"]
        write_json(manifest_path, protected_manifest)

    work_identity_document = read_json(WORK_IDENTITIES_FILE)
    work = work_identity_document["catalogIdToWorkKey"]
    for catalog_id in VILLAGE_CATALOG_IDS:
        work[catalog_id] = VILLAGE_WORK_KEY
    for catalog_id in RE7_CATALOG_IDS:
        work[catalog_id] = RE7_WORK_KEY
    for catalog_id in RE4_REMAKE_CATALOG_IDS:
        work[catalog_id] = RE4_REMAKE_WORK_KEY
    write_json(WORK_IDENTITIES_FILE, work_identity_document)

    counts = catalog_counts(catalog)
    meta = read_json(META_FILE)
    meta.update(
        {
            "catalogTotal": counts["total"],
            "catalogListed": counts["listed"],
            "catalogExcluded": counts["excluded"],
            "listedByPlatform": counts["listedByPlatform"],
            "excludedByPlatform": counts["excludedByPlatform"],
            "curationByCategory": counts["byCategory"],
        }
    )
    write_json(META_FILE, meta)
    write_json(CURATION_REPORT_FILE, counts)

    scans = read_json(SCANS_FILE)
    preserved_images = collect_preserved_images(scans)
    guide = read_json(GUIDE_FILE)
    linked_ids = guide_catalog_ids(guide)
    assert RETIRED_VILLAGE_ID not in linked_ids
    assert PENDING_RE7_GOLD_ID not in linked_ids

    if not AUDIT_FILE.exists():
        audit = {
            "schemaVersion": 1,
            "batchId": BATCH,
            "reviewedAt": REVIEWED_AT,
            "scope": "Resident Evil en PlayStation 4",
            "canonicalEntities": {
                "village": CANONICAL_VILLAGE_ID,
                "residentEvil7": "ps4-resident-evil-7-biohazard",
                "residentEvil4Remake": "ps4-resident-evil-4-remake",
            },
            "exactMerge": {
                "retiredCatalogId": RETIRED_VILLAGE_ID,
                "canonicalCatalogId": CANONICAL_VILLAGE_ID,
                "evidence": [
                    "Ambas filas son PS4, PAL España, Standard y comparten pcId 2164917.",
                    "La ficha canónica conserva el scan propio España / Italia; la portada legacy permanece en la galería V2.",
                ],
                "before": {
                    "retired": retired_before,
                    "canonical": canonical_before,
                },
                "after": {
                    "retired": retired_after,
                    "canonical": canonical_after,
                },
                "redirect": route,
            },
            "regionalRelationships": {
                "villageWorkKey": VILLAGE_WORK_KEY,
                "residentEvil7WorkKey": RE7_WORK_KEY,
                "residentEvil4RemakeWorkKey": RE4_REMAKE_WORK_KEY,
                "villageCatalogIds": VILLAGE_CATALOG_IDS,
                "residentEvil7CatalogIds": RE7_CATALOG_IDS,
                "residentEvil4RemakeCatalogIds": RE4_REMAKE_CATALOG_IDS,
            },
            "protectedDistinctEditions": PROTECTED_DISTINCT_EDITION_IDS,
            "preservation": {
                "ownedScanSetIds": SCAN_SET_IDS,
                "images": preserved_images,
                "imageCount": len(preserved_images),
                "userDataModified": False,
                "historicalResearchModified": False,
            },
            "changedCompanyIndexes": changed_companies,
            "pendingReview": [
                {
                    "catalogId": PENDING_RE7_GOLD_ID,
                    "title": catalog_by_id[PENDING_RE7_GOLD_ID]["title"],
                    "status": "PENDING_REVIEW",
                    "reason": (
                        "El repositorio no permite demostrar si Biohazard 7: Gold es la misma caja "
                        "que Biohazard 7: Resident Evil [Gold Edition]. No se fusiona ni se reasigna."
                    ),
                }
            ],
        }
        write_json(AUDIT_FILE, audit)

    return assert_final_state()


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    result = apply() if args.write else assert_final_state()
    print(json.dumps({"ok": True, **result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
