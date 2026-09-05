#!/usr/bin/env python3
"""Build and apply the guarded PS4 PAL HIGH company-credit additions."""

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
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data/catalog.json"
DETAILS_FILE = ROOT / "data/game-details.json"
COMPANIES_FILE = ROOT / "data/index/companies.json"
RESEARCH_DIR = ROOT / "data/research"
FIRST_BATCH_FILE = RESEARCH_DIR / "company-credit-ps4-pal-batch-1.csv"
REPORT_FILE = RESEARCH_DIR / "company-credit-ps4-pal-high-additions-report.json"
REPORT_MD_FILE = RESEARCH_DIR / "company-credit-ps4-pal-high-additions-report.md"
VERIFIED_INDEX_BUILDER = ROOT / "scripts/build_verified_company_credit_index.py"
COMPANY_STUDY_MANIFEST = RESEARCH_DIR / "company-study/manifest.json"
PERSON_STUDY_MANIFEST = RESEARCH_DIR / "person-study/manifest.json"

OUTPUT_FILES = {
    "publicationCandidates": RESEARCH_DIR / "ps4-pal-high-publication-candidates.csv",
    "additionsReady": RESEARCH_DIR / "ps4-pal-high-additions-ready.csv",
    "retains": RESEARCH_DIR / "ps4-pal-high-retains.csv",
    "replacementsReview": RESEARCH_DIR / "ps4-pal-high-replacements-review.csv",
    "identifierBlocked": RESEARCH_DIR / "ps4-pal-high-identifier-blocked.csv",
    "conflictingCandidates": RESEARCH_DIR / "ps4-pal-high-conflicting-candidates.csv",
    "unresolvedEntities": RESEARCH_DIR / "ps4-pal-high-unresolved-entities.csv",
    "residualQueue": RESEARCH_DIR / "ps4-pal-residual-company-research-queue.csv",
}

BATCH_ID = "company-credit-ps4-pal-high-additions-1"
REVIEWED_AT = "2026-09-05"
REVIEWED_AT_TIMESTAMP = "2026-09-05T00:00:00Z"
SUCCESSOR_BATCH_ID = "company-credit-ps4-pal-compilations-2026-09-05"
ALLOWED_SUCCESSOR_APPLICATIONS = {
    ("ps4-air-conflicts-secret-wars", "developer"): {
        "companySlug": "games-farm",
        "previousValue": "Games Farm",
    },
    ("ps4-batman-arkham-vr", "developer"): {
        "companySlug": "rocksteady-studios",
        "previousValue": "Rocksteady Studios",
    },
}
SOURCE_SNAPSHOT = "e6e0d88793e5ac0a6d5ea4b3bfb665427f90abfa"
SOURCE_PACKAGE_SHA256 = "b19148e273b952d18854623b4b4f07f85b6b07277d4917a0d0bea0899082a081"
FIRST_PR_BASE = "2ab671e1e974ef627434edd2ab3d2a2aec2e7468"
FIRST_PR_HEAD = "2fe23bbaf0980b68b0ecc4ca8388a03c6cd38464"

EXPECTED_INITIAL = {
    "rows": 2397,
    "developer": 1344,
    "publisher": 1053,
    "retain": 1538,
    "add": 759,
    "replace": 100,
}
EXPECTED_IDENTIFIER_BLOCKED = {"rows": 126, "retain": 110, "add": 10, "replace": 6}
EXPECTED_READY = {
    "rows": 749,
    "developer": 591,
    "publisher": 158,
    "catalogIds": 657,
    "bothFields": 92,
    "retains": 1428,
    "cleanReplacements": 94,
}

ALLOWED_ROLES = {"DEVELOPER", "PHYSICAL_PUBLISHER_OR_DISTRIBUTOR"}
ROLE_FIELDS = {
    "DEVELOPER": "developer",
    "PHYSICAL_PUBLISHER_OR_DISTRIBUTOR": "publisher",
}
ROLE_INDEX_KEYS = {"developer": "asDeveloper", "publisher": "asPublisher"}
ALLOWED_CONTENT_TYPES = {"GAME_OR_UNKNOWN", "EDITION_VARIANT"}
FORBIDDEN_ROLES = {"DIGITAL_PUBLISHER", "GENERAL_PUBLISHER_CONTEXT", "SUPPORT_DEVELOPER"}
CONFIDENCE_ORDER = {"": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "VERY_HIGH": 4}
RESIDUAL_CATEGORIES = {
    "HIGH_REPLACEMENT_CONFLICT",
    "MULTIPLE_HIGH_COMPANIES",
    "COMPANY_ENTITY_UNRESOLVED",
    "IDENTIFIER_OR_TITLE_CONFLICT",
    "MISSING_DEVELOPER",
    "MISSING_PHYSICAL_PUBLISHER",
    "MISSING_BOTH_CORE_ROLES",
    "COMPOSITE_CREDIT",
    "MULTI_PRODUCT_REVIEW",
    "SOURCE_FETCH_FAILED",
}


class StaleInputError(ValueError):
    """Raised before writes when the audited addition no longer targets an empty field."""


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            extrasaction="ignore",
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})
    temporary.replace(path)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_json(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def git_head() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def split_pipe(value: str) -> list[str]:
    return [part.strip() for part in str(value or "").split(" | ") if part.strip()]


def unique_join(values: Iterable[str]) -> str:
    return " | ".join(sorted({value.strip() for value in values if value and value.strip()}))


def company_slug(value: Any) -> str:
    return str(value.get("slug") or "") if isinstance(value, dict) else ""


def company_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or "")
    return str(value or "")


def looks_composite_company(value: str) -> bool:
    return any(separator in value for separator in (" | ", " / ", " + ", ";", "\n"))


def source_for(row: dict[str, str]) -> str:
    sources = set(split_pipe(row.get("sources", "")))
    grades = set(split_pipe(row.get("source_grades", "")))
    if "PLAYSTATION_STORE_EXPLICIT_CREDIT" in sources or "STEAM_STORE" in sources:
        return "official"
    if any("OFFICIAL" in source for source in sources) or any(grade.startswith("A_") for grade in grades):
        return "official"
    if "PRICECHARTING_EXACT_PAL_PAGE" in sources:
        return "pricecharting"
    if "WIKIDATA" in sources:
        return "wikidata"
    raise ValueError(f"No supported provenance source for {row['catalog_id']}:{row['target_field']}")


def desired_entity(row: dict[str, str], companies: dict[str, dict[str, Any]]) -> dict[str, Any]:
    company = companies[row["proposed_company_slug"]]
    return {
        "name": company["name"],
        "slug": row["proposed_company_slug"],
        "museumPath": None,
        "pcPath": None,
        "source": source_for(row),
    }


def desired_provenance(row: dict[str, str]) -> dict[str, Any]:
    return {
        "source": source_for(row),
        "evidenceUrls": split_pipe(row["source_urls"]),
        "evidenceSummary": row["evidence_summary"],
        "reviewedAt": REVIEWED_AT,
        "reviewBatch": BATCH_ID,
    }


def is_allowed_successor_application(
    row: dict[str, str], detail: dict[str, Any]
) -> bool:
    field = row["target_field"]
    allowed = ALLOWED_SUCCESSOR_APPLICATIONS.get((row["catalog_id"], field))
    if not allowed:
        return False
    entity = detail.get(field)
    provenance = (detail.get("fieldProvenance") or {}).get(field) or {}
    field_source = (detail.get("fieldSources") or {}).get(field)
    return (
        company_slug(entity) == allowed["companySlug"] == row["proposed_company_slug"]
        and company_name(entity) == row["proposed_company"]
        and provenance.get("reviewBatch") == SUCCESSOR_BATCH_ID
        and allowed["previousValue"] in provenance.get("previousValues", [])
        and provenance.get("source") == field_source == entity.get("source")
        and bool(provenance.get("evidenceUrls"))
        and bool(provenance.get("evidenceSummary"))
        and provenance.get("reviewedAt") == REVIEWED_AT
    )


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


def validate_package_manifest(package_dir: Path) -> dict[str, Any]:
    manifest_path = package_dir / "MANIFEST.sha256"
    failures: list[dict[str, str]] = []
    checked = 0
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative = line.split(maxsplit=1)
        relative = relative.removeprefix("./")
        path = package_dir / relative
        checked += 1
        if not path.is_file():
            failures.append({"path": relative, "reason": "missing"})
        elif sha256(path) != expected:
            failures.append({"path": relative, "reason": "sha256 mismatch"})
    if failures:
        raise ValueError(f"Source package manifest failed: {failures}")
    return {"filesChecked": checked, "failures": failures}


def group_high_or_better(rows: list[dict[str, str]]) -> dict[tuple[str, str], list[dict[str, str]]]:
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row["confidence"] in {"HIGH", "VERY_HIGH"} and row["role"] in ALLOWED_ROLES:
            grouped[(row["catalog_id"], row["target_field"])].append(row)
    return grouped


def valid_unique_group(
    rows: list[dict[str, str]], companies: dict[str, dict[str, Any]]
) -> bool:
    return bool(rows) and all(
        row["company_resolution"] == "EXACT_NAME_OR_ALIAS"
        and row["proposed_company_slug"]
        and row["proposed_company_slug"] in companies
        for row in rows
    ) and len({row["proposed_company_slug"] for row in rows}) == 1


def validate_row_shape(row: dict[str, str]) -> None:
    if row["confidence"] != "HIGH":
        raise ValueError(f"Only HIGH is allowed: {row['catalog_id']}")
    if row["role"] in FORBIDDEN_ROLES or row["role"] not in ALLOWED_ROLES:
        raise ValueError(f"Forbidden role: {row['role']}")
    if ROLE_FIELDS[row["role"]] != row["target_field"]:
        raise ValueError(f"Role/field mismatch: {row['catalog_id']}")
    if row["content_type"] not in ALLOWED_CONTENT_TYPES:
        raise ValueError(f"Forbidden content type: {row['content_type']}")
    if row["company_resolution"] != "EXACT_NAME_OR_ALIAS" or not row["proposed_company_slug"]:
        raise ValueError(f"Unresolved company: {row['catalog_id']}")
    if looks_composite_company(row["proposed_company"]):
        raise ValueError(f"Composite company: {row['catalog_id']}")
    if not row["source_urls"].strip():
        raise ValueError(f"Missing evidence URL: {row['catalog_id']}")


def build_source_cut(
    package_dir: Path,
    companies: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    data_dir = package_dir / "data"
    proposals = read_csv(data_dir / "ps4-pal-company-credit-proposals.csv")
    entries = read_csv(data_dir / "ps4-pal-entry-research.csv")
    entry_by_id = {row["catalog_id"]: row for row in entries}
    if len(entry_by_id) != len(entries):
        raise ValueError("Entry research contains duplicate catalog IDs")

    grouped = group_high_or_better(proposals)
    publication: list[dict[str, str]] = []
    for row in proposals:
        if not (
            row["confidence"] == "HIGH"
            and row["role"] in ALLOWED_ROLES
            and row["content_type"] in ALLOWED_CONTENT_TYPES
            and row["company_resolution"] == "EXACT_NAME_OR_ALIAS"
            and row["proposed_company_slug"] in companies
            and valid_unique_group(grouped[(row["catalog_id"], row["target_field"])], companies)
        ):
            continue
        validate_row_shape(row)
        enriched = dict(row)
        entry = entry_by_id[row["catalog_id"]]
        enriched["identifier_warning"] = entry["identifier_warning"].strip()
        enriched["current_cusa"] = entry["cusa"].strip()
        enriched["pricecharting_model_cusa"] = entry["pricecharting_model_cusa"].strip()
        publication.append(enriched)

    publication.sort(key=lambda row: (row["catalog_id"], row["target_field"]))
    if len({(row["catalog_id"], row["target_field"]) for row in publication}) != len(publication):
        raise ValueError("Publication candidates contain duplicate catalog_id/target_field pairs")

    identifier_blocked = [row for row in publication if row["identifier_warning"]]
    clean = [row for row in publication if not row["identifier_warning"]]
    additions = [row for row in clean if row["recommended_action"] == "ADD_MISSING"]
    retains = [row for row in clean if row["recommended_action"] == "RETAIN"]
    replacements = [row for row in publication if row["recommended_action"] == "REPLACE_OR_ADD_REVIEW"]

    initial_counts = {
        "rows": len(publication),
        "developer": sum(row["target_field"] == "developer" for row in publication),
        "publisher": sum(row["target_field"] == "publisher" for row in publication),
        "retain": sum(row["recommended_action"] == "RETAIN" for row in publication),
        "add": sum(row["recommended_action"] == "ADD_MISSING" for row in publication),
        "replace": sum(row["recommended_action"] == "REPLACE_OR_ADD_REVIEW" for row in publication),
    }
    warning_counts = {
        "rows": len(identifier_blocked),
        "retain": sum(row["recommended_action"] == "RETAIN" for row in identifier_blocked),
        "add": sum(row["recommended_action"] == "ADD_MISSING" for row in identifier_blocked),
        "replace": sum(row["recommended_action"] == "REPLACE_OR_ADD_REVIEW" for row in identifier_blocked),
    }
    ready_counts = {
        "rows": len(additions),
        "developer": sum(row["target_field"] == "developer" for row in additions),
        "publisher": sum(row["target_field"] == "publisher" for row in additions),
        "catalogIds": len({row["catalog_id"] for row in additions}),
        "bothFields": sum(
            fields == {"developer", "publisher"}
            for fields in (
                {row["target_field"] for row in additions if row["catalog_id"] == catalog_id}
                for catalog_id in {row["catalog_id"] for row in additions}
            )
        ),
        "retains": len(retains),
        "cleanReplacements": sum(not row["identifier_warning"] for row in replacements),
    }
    if initial_counts != EXPECTED_INITIAL:
        raise ValueError(f"Unexpected initial HIGH cut: {initial_counts}")
    if warning_counts != EXPECTED_IDENTIFIER_BLOCKED:
        raise ValueError(f"Unexpected identifier-warning cut: {warning_counts}")
    if ready_counts != EXPECTED_READY:
        raise ValueError(f"Unexpected ready HIGH cut: {ready_counts}")

    conflicting: list[dict[str, str]] = []
    unresolved: list[dict[str, str]] = []
    for key, candidates in sorted(grouped.items()):
        high_rows = [
            row
            for row in candidates
            if row["confidence"] == "HIGH" and row["content_type"] in ALLOWED_CONTENT_TYPES
        ]
        if not high_rows:
            continue
        exact_slugs = sorted(
            {
                row["proposed_company_slug"]
                for row in candidates
                if row["company_resolution"] == "EXACT_NAME_OR_ALIAS"
                and row["proposed_company_slug"] in companies
            }
        )
        if len(exact_slugs) > 1:
            conflicting.append(
                {
                    "catalog_id": key[0],
                    "title": high_rows[0]["title"],
                    "target_field": key[1],
                    "role": high_rows[0]["role"],
                    "candidate_slugs": " | ".join(exact_slugs),
                    "candidate_companies": unique_join(row["proposed_company"] for row in candidates),
                    "confidence_levels": unique_join(row["confidence"] for row in candidates),
                    "group_row_count": str(len(candidates)),
                    "conflict_reason": "MULTIPLE_HIGH_COMPANIES",
                    "source_urls": unique_join(
                        url for row in candidates for url in split_pipe(row["source_urls"])
                    ),
                }
            )
        for row in high_rows:
            reasons: list[str] = []
            if row["company_resolution"] != "EXACT_NAME_OR_ALIAS":
                reasons.append(row["company_resolution"] or "UNRESOLVED")
            if not row["proposed_company_slug"]:
                reasons.append("MISSING_SLUG")
            elif row["proposed_company_slug"] not in companies:
                reasons.append("SLUG_NOT_IN_COMPANY_INDEX")
            if any(
                candidate["company_resolution"] != "EXACT_NAME_OR_ALIAS"
                or not candidate["proposed_company_slug"]
                or candidate["proposed_company_slug"] not in companies
                for candidate in candidates
            ):
                reasons.append("HIGH_OR_BETTER_GROUP_NOT_FULLY_RESOLVED")
            if reasons:
                unresolved.append(
                    {
                        **row,
                        "unresolved_reason": unique_join(reasons),
                    }
                )

    price_rows = read_csv(data_dir / "pricecharting-pal-ps4-details.csv")
    price_by_url = {row["url"]: row for row in price_rows}
    residual = build_residual_queue(
        entries,
        proposals,
        publication,
        additions,
        conflicting,
        unresolved,
        price_by_url,
        companies,
    )

    return {
        "packageManifest": validate_package_manifest(package_dir),
        "proposals": proposals,
        "entries": entries,
        "publication": publication,
        "additions": additions,
        "retains": retains,
        "replacements": replacements,
        "identifierBlocked": identifier_blocked,
        "conflicting": conflicting,
        "unresolved": unresolved,
        "residual": residual,
        "initialCounts": initial_counts,
        "warningCounts": warning_counts,
        "readyCounts": ready_counts,
    }


def build_residual_queue(
    entries: list[dict[str, str]],
    proposals: list[dict[str, str]],
    publication: list[dict[str, str]],
    additions: list[dict[str, str]],
    conflicting: list[dict[str, str]],
    unresolved: list[dict[str, str]],
    price_by_url: dict[str, dict[str, str]],
    companies: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    additions_by_key = {(row["catalog_id"], row["target_field"]): row for row in additions}
    proposals_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in proposals:
        if row["role"] in ALLOWED_ROLES:
            proposals_by_id[row["catalog_id"]].append(row)
    replacement_ids = {
        row["catalog_id"] for row in publication if row["recommended_action"] == "REPLACE_OR_ADD_REVIEW"
    }
    conflicting_ids = {row["catalog_id"] for row in conflicting}
    unresolved_ids = {row["catalog_id"] for row in unresolved}
    work_counts = Counter(row["provisional_work_key"] for row in entries)
    queue: list[dict[str, str]] = []

    for entry in entries:
        catalog_id = entry["catalog_id"]
        categories: set[str] = set()
        if catalog_id in replacement_ids:
            categories.add("HIGH_REPLACEMENT_CONFLICT")
        if catalog_id in conflicting_ids:
            categories.add("MULTIPLE_HIGH_COMPANIES")
        if catalog_id in unresolved_ids:
            categories.add("COMPANY_ENTITY_UNRESOLVED")
        if entry["identifier_warning"].strip():
            categories.add("IDENTIFIER_OR_TITLE_CONFLICT")
        if "COMPOSITE" in entry["current_credit_warning"]:
            categories.add("COMPOSITE_CREDIT")
        if entry["content_type"] in {
            "POSSIBLE_COMPILATION_OR_MULTI_PRODUCT",
            "BUNDLE_OR_MULTI_PRODUCT",
        } or entry["research_status"] == "MULTI_PRODUCT_SPLIT_REQUIRED":
            categories.add("MULTI_PRODUCT_REVIEW")
        price_url = entry["pricecharting_url"].strip()
        if price_url and price_by_url.get(price_url, {}).get("status") not in {None, "OK"}:
            categories.add("SOURCE_FETCH_FAILED")

        has_developer = bool(entry["current_developer"].strip()) or (
            catalog_id,
            "developer",
        ) in additions_by_key
        has_publisher = bool(entry["current_physical_publisher"].strip()) or (
            catalog_id,
            "publisher",
        ) in additions_by_key
        if not has_developer and not has_publisher:
            categories.add("MISSING_BOTH_CORE_ROLES")
        elif not has_developer:
            categories.add("MISSING_DEVELOPER")
        elif not has_publisher:
            categories.add("MISSING_PHYSICAL_PUBLISHER")
        if not categories:
            continue

        candidate_rows = proposals_by_id.get(catalog_id, [])
        candidate_slugs = sorted(
            {row["proposed_company_slug"] for row in candidate_rows if row["proposed_company_slug"]}
        )
        candidate_companies = unique_join(
            f"{row['proposed_company']} [{row['proposed_company_slug'] or 'unresolved'}]"
            for row in candidate_rows
        )
        impact = unique_join(
            f"{slug}:{companies[slug].get('gameCount', 0)}"
            for slug in candidate_slugs
            if slug in companies
        )
        best_confidence = max(
            (row["confidence"] for row in candidate_rows),
            key=lambda value: CONFIDENCE_ORDER.get(value, 0),
            default="",
        )
        urls = {
            url
            for row in candidate_rows
            for url in split_pipe(row["source_urls"])
            if url
        }
        urls.update(url for url in (price_url, entry["playstation_store_url"].strip()) if url)
        roles: list[str] = []
        if not has_developer or any(row["target_field"] == "developer" for row in candidate_rows):
            roles.append("developer")
        if not has_publisher or any(row["target_field"] == "publisher" for row in candidate_rows):
            roles.append("physical_publisher")

        ordered_categories = sorted(categories, key=residual_category_order)
        priority = residual_priority(categories, candidate_slugs, companies, not has_developer, not has_publisher)
        queue.append(
            {
                "provisional_work_key": entry["provisional_work_key"],
                "representative_title": entry["title"],
                "catalog_ids": catalog_id,
                "missing_or_conflicting_roles": " | ".join(roles),
                "current_values": (
                    f"developer={entry['current_developer'] or '(empty)'}; "
                    f"physical_publisher={entry['current_physical_publisher'] or '(empty)'}"
                ),
                "candidate_companies": candidate_companies,
                "best_confidence": best_confidence,
                "conflict_reason": " | ".join(ordered_categories),
                "catalog_entry_count": str(work_counts[entry["provisional_work_key"]]),
                "company_game_impact": impact,
                "source_urls": " | ".join(sorted(urls)),
                "recommended_next_research": recommended_research(categories),
                "priority": str(priority),
            }
        )

    queue.sort(
        key=lambda row: (
            int(row["priority"]),
            row["provisional_work_key"].casefold(),
            row["catalog_ids"],
        )
    )
    return queue


def residual_category_order(category: str) -> tuple[int, str]:
    order = {
        "HIGH_REPLACEMENT_CONFLICT": 1,
        "MULTIPLE_HIGH_COMPANIES": 2,
        "MISSING_BOTH_CORE_ROLES": 3,
        "COMPANY_ENTITY_UNRESOLVED": 4,
        "SOURCE_FETCH_FAILED": 5,
    }
    return order.get(category, 6), category


def residual_priority(
    categories: set[str],
    candidate_slugs: list[str],
    companies: dict[str, dict[str, Any]],
    missing_developer: bool,
    missing_publisher: bool,
) -> int:
    if "HIGH_REPLACEMENT_CONFLICT" in categories:
        return 1
    if "MULTIPLE_HIGH_COMPANIES" in categories:
        return 2
    if max((int(companies[slug].get("gameCount", 0)) for slug in candidate_slugs if slug in companies), default=0) >= 10:
        return 3
    if missing_developer and missing_publisher:
        return 4
    if "COMPANY_ENTITY_UNRESOLVED" in categories:
        return 5
    if "SOURCE_FETCH_FAILED" in categories:
        return 6
    return 7


def recommended_research(categories: set[str]) -> str:
    if "HIGH_REPLACEMENT_CONFLICT" in categories:
        return "Contrastar el valor actual y el candidato con una fuente primaria exacta antes de sustituir."
    if "MULTIPLE_HIGH_COMPANIES" in categories:
        return "Resolver qué compañía ocupa el rol principal sin concatenar créditos ni propagar entre ediciones."
    if "IDENTIFIER_OR_TITLE_CONFLICT" in categories:
        return "Resolver primero el identificador y el título exactos de esta ficha."
    if "MULTI_PRODUCT_REVIEW" in categories:
        return "Separar los componentes del producto antes de asignar créditos singulares."
    if "COMPANY_ENTITY_UNRESOLVED" in categories:
        return "Resolver el nombre contra una entidad existente; no crear ni fusionar automáticamente."
    if "SOURCE_FETCH_FAILED" in categories:
        return "Recuperar una fuente exacta accesible y volver a evaluar el rol."
    return "Buscar una fuente primaria o física exacta para el rol que continúa vacío."


def publication_fields(rows: list[dict[str, str]]) -> list[str]:
    base = list(rows[0].keys()) if rows else []
    for field in ("identifier_warning", "current_cusa", "pricecharting_model_cusa"):
        if field not in base:
            base.append(field)
    return base


def enriched_ready_rows(rows: list[dict[str, str]], companies: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in rows:
        output.append(
            {
                **row,
                "previous_value": row["current_company"],
                "new_company_name": companies[row["proposed_company_slug"]]["name"],
                "new_company_slug": row["proposed_company_slug"],
                "field_source": source_for(row),
                "reviewed_at": REVIEWED_AT,
                "review_batch": BATCH_ID,
                "publication_status": "READY_ADD_MISSING",
            }
        )
    return output


def write_artifacts(cut: dict[str, Any], companies: dict[str, dict[str, Any]]) -> None:
    publication = cut["publication"]
    common = publication_fields(publication)
    ready = enriched_ready_rows(cut["additions"], companies)
    ready_extra = [
        "previous_value",
        "new_company_name",
        "new_company_slug",
        "field_source",
        "reviewed_at",
        "review_batch",
        "publication_status",
    ]
    replacements = [
        {
            **row,
            "publication_status": (
                "IDENTIFIER_BLOCKED" if row["identifier_warning"] else "HIGH_REPLACEMENT_BLOCKED"
            ),
        }
        for row in cut["replacements"]
    ]
    write_csv(OUTPUT_FILES["publicationCandidates"], publication, common)
    write_csv(OUTPUT_FILES["additionsReady"], ready, common + ready_extra)
    write_csv(OUTPUT_FILES["retains"], cut["retains"], common)
    write_csv(OUTPUT_FILES["replacementsReview"], replacements, common + ["publication_status"])
    write_csv(OUTPUT_FILES["identifierBlocked"], cut["identifierBlocked"], common)
    write_csv(
        OUTPUT_FILES["conflictingCandidates"],
        cut["conflicting"],
        [
            "catalog_id",
            "title",
            "target_field",
            "role",
            "candidate_slugs",
            "candidate_companies",
            "confidence_levels",
            "group_row_count",
            "conflict_reason",
            "source_urls",
        ],
    )
    unresolved_fields = list(cut["unresolved"][0].keys()) if cut["unresolved"] else common + ["unresolved_reason"]
    write_csv(OUTPUT_FILES["unresolvedEntities"], cut["unresolved"], unresolved_fields)
    write_csv(
        OUTPUT_FILES["residualQueue"],
        cut["residual"],
        [
            "provisional_work_key",
            "representative_title",
            "catalog_ids",
            "missing_or_conflicting_roles",
            "current_values",
            "candidate_companies",
            "best_confidence",
            "conflict_reason",
            "catalog_entry_count",
            "company_game_impact",
            "source_urls",
            "recommended_next_research",
            "priority",
        ],
    )


def evaluate_additions(
    rows: list[dict[str, str]],
    catalog: list[dict[str, Any]],
    details: dict[str, dict[str, Any]],
    companies: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    catalog_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for catalog_row in catalog:
        catalog_rows[str(catalog_row["id"])].append(catalog_row)
    results: list[dict[str, Any]] = []
    for row in rows:
        validate_row_shape(row)
        issues: list[str] = []
        if row["recommended_action"] != "ADD_MISSING":
            issues.append(f"action={row['recommended_action']}")
        if row.get("identifier_warning", "").strip():
            issues.append(f"identifier_warning={row['identifier_warning']}")
        matches = catalog_rows.get(row["catalog_id"], [])
        catalog_row = matches[0] if len(matches) == 1 else None
        if len(matches) != 1:
            issues.append(f"catalog_id_count={len(matches)}")
        else:
            if catalog_row.get("platformSlug") != "ps4":
                issues.append(f"platform={catalog_row.get('platformSlug')}")
            if catalog_row.get("region") != row["region"]:
                issues.append(f"region={catalog_row.get('region')}")
            if catalog_row.get("edition") != row["edition"]:
                issues.append(f"edition={catalog_row.get('edition')}")
            if html.unescape(str(catalog_row.get("title") or "")) != row["title"]:
                issues.append(f"title={catalog_row.get('title')}")
        if row["proposed_company_slug"] not in companies:
            issues.append(f"missing_company_slug={row['proposed_company_slug']}")

        detail = details.get(row["catalog_id"], {})
        field = row["target_field"]
        actual = detail.get(field)
        expected_entity = desired_entity(row, companies)
        expected_provenance = desired_provenance(row)
        already_applied = (
            actual == expected_entity
            and (detail.get("fieldSources") or {}).get(field) == source_for(row)
            and (detail.get("fieldProvenance") or {}).get(field) == expected_provenance
        )
        if not already_applied and company_name(actual):
            issues.append(f"expected_empty_found={company_name(actual)}")
        results.append(
            {
                "catalogId": row["catalog_id"],
                "targetField": field,
                "status": "STALE_INPUT" if issues else "ALREADY_APPLIED" if already_applied else "WOULD_APPLY",
                "issues": issues,
                "before": copy.deepcopy(actual),
                "after": expected_entity,
                "provenance": expected_provenance,
            }
        )
    return results


def add_index_credit(
    companies: dict[str, dict[str, Any]], catalog_id: str, field: str, slug: str, platform: str
) -> None:
    company = companies[slug]
    role_key = ROLE_INDEX_KEYS[field]
    if catalog_id not in company.setdefault(role_key, []):
        company[role_key].append(catalog_id)
    if catalog_id not in company.setdefault("gameIds", []):
        company["gameIds"].append(catalog_id)
        by_platform = company.setdefault("byPlatform", {})
        by_platform[platform] = int(by_platform.get(platform, 0)) + 1
    company["gameCount"] = len(company["gameIds"])


def changed_top_level_fields(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    return sorted(key for key in before.keys() | after.keys() if before.get(key) != after.get(key))


def desired_protected_manifest(
    path: Path, before_hashes: dict[str, str], after_hashes: dict[str, str]
) -> dict[str, Any]:
    manifest = read_json(path)
    protected = manifest.get("protectedFileHashes")
    if not isinstance(protected, dict):
        raise ValueError(f"Missing protectedFileHashes in {path.relative_to(ROOT)}")
    protected_paths = [relative for relative in before_hashes if relative in protected]
    for relative in protected_paths:
        if protected[relative] != before_hashes[relative]:
            raise ValueError(f"Unexpected protected hash for {relative} in {path.relative_to(ROOT)}")
        protected[relative] = after_hashes[relative]
    updates = [row for row in manifest.get("protectedFileHashUpdates", []) if row.get("batchId") != BATCH_ID]
    updates.append(
        {
            "batchId": BATCH_ID,
            "reviewedAt": REVIEWED_AT,
            "files": {
                relative: {"before": before_hashes[relative], "after": after_hashes[relative]}
                for relative in protected_paths
            },
        }
    )
    ordered: dict[str, Any] = {}
    for key, value in manifest.items():
        if key == "protectedFileHashUpdates":
            continue
        ordered[key] = value
        if key == "protectedFileHashes":
            ordered["protectedFileHashUpdates"] = updates
    return ordered


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    residual = report["residualQueue"]
    lines = [
        "# PS4 PAL - altas HIGH de creditos de companias",
        "",
        f"Fecha de revision: {REVIEWED_AT}",
        "",
        "## Separacion de fases",
        "",
        f"- Base de la primera PR: `{FIRST_PR_BASE}`.",
        f"- HEAD de la primera PR y base de esta fase: `{FIRST_PR_HEAD}`.",
        "- Esta fase solo contiene altas HIGH en campos vacios y depende de la primera PR.",
        "- El HEAD final de la segunda PR se registra en GitHub tras crear el commit, evitando una referencia circular dentro del propio commit.",
        "",
        "## Resultado",
        "",
        f"- {summary['publicationCandidates']} candidatos HIGH iniciales.",
        f"- {summary['appliedAdditions']} altas aplicadas: {summary['developerAdditions']} desarrolladoras y {summary['publisherAdditions']} publishers fisicos.",
        f"- {summary['changedCatalogIds']} fichas afectadas; {summary['bothFields']} reciben ambos campos.",
        f"- {summary['retains']} RETAIN documentados sin reescritura.",
        f"- {summary['replacementCandidates']} sustituciones HIGH bloqueadas.",
        f"- {summary['identifierBlocked']} relaciones bloqueadas por identificador o titulo.",
        "- Cero propagaciones, sustituciones HIGH, entidades nuevas o cambios en catalog.json.",
        "",
        "## Cola residual",
        "",
        f"- {residual['rows']} fichas pendientes, ordenadas por prioridad, obra provisional y catalog_id.",
    ]
    for category, count in residual["categories"].items():
        lines.append(f"- {category}: {count}")
    lines.extend(
        [
            "",
            "## Verificacion",
            "",
            "Los resultados finales de typecheck, lint, pruebas, build y QA Preview se documentan en la descripcion/comentario de la PR para el HEAD inmutable revisado.",
            "",
        ]
    )
    return "\n".join(lines)


def run_apply(cut: dict[str, Any], apply: bool) -> dict[str, Any]:
    catalog: list[dict[str, Any]] = read_json(CATALOG_FILE)
    details: dict[str, dict[str, Any]] = read_json(DETAILS_FILE)
    companies: dict[str, dict[str, Any]] = read_json(COMPANIES_FILE)
    rows = cut["additions"]
    first_keys = {
        (row["catalog_id"], row["target_field"]) for row in read_csv(FIRST_BATCH_FILE)
    }
    ready_keys = {(row["catalog_id"], row["target_field"]) for row in rows}
    if first_keys & ready_keys:
        raise ValueError(f"The HIGH phase duplicates first-batch mutations: {sorted(first_keys & ready_keys)}")

    evaluations = evaluate_additions(rows, catalog, details, companies)
    stale = [row for row in evaluations if row["status"] == "STALE_INPUT"]
    if stale:
        raise StaleInputError(f"{len(stale)} HIGH additions are stale; no data files were written")

    catalog_ids = [str(row["id"]) for row in catalog]
    if len(catalog_ids) != len(set(catalog_ids)):
        raise ValueError("Catalog IDs are not unique")
    catalog_by_id = {str(row["id"]): row for row in catalog}
    details_before = copy.deepcopy(details)
    companies_before = copy.deepcopy(companies)
    details_hash_before = sha256(DETAILS_FILE)
    companies_hash_before = sha256(COMPANIES_FILE)
    catalog_hash = sha256(CATALOG_FILE)
    created_details: set[str] = set()

    for row, evaluation in zip(rows, evaluations):
        catalog_id = row["catalog_id"]
        detail = details.get(catalog_id)
        if not isinstance(detail, dict):
            detail = new_detail()
            details[catalog_id] = detail
            created_details.add(catalog_id)
        if evaluation["status"] == "WOULD_APPLY":
            field = row["target_field"]
            detail[field] = desired_entity(row, companies)
            detail.setdefault("fieldSources", {})[field] = source_for(row)
            detail.setdefault("fieldProvenance", {})[field] = desired_provenance(row)
            add_index_credit(
                companies,
                catalog_id,
                field,
                row["proposed_company_slug"],
                str(catalog_by_id[catalog_id]["platformSlug"]),
            )

    expected_ids = {row["catalog_id"] for row in rows}
    detail_changes: list[dict[str, Any]] = []
    for catalog_id in sorted(details_before.keys() | details.keys()):
        before = details_before.get(catalog_id, {})
        after = details.get(catalog_id, {})
        fields = changed_top_level_fields(before, after)
        if not fields:
            continue
        if catalog_id not in expected_ids:
            raise ValueError(f"Unexpected propagated detail change: {catalog_id}")
        if catalog_id not in created_details:
            allowed = {
                "fieldSources",
                "fieldProvenance",
                *[row["target_field"] for row in rows if row["catalog_id"] == catalog_id],
            }
            if set(fields) - allowed:
                raise ValueError(f"Unexpected fields changed for {catalog_id}: {fields}")
        detail_changes.append(
            {"catalogId": catalog_id, "fields": fields, "createdDetailRecord": catalog_id in created_details}
        )

    affected_slugs = {row["proposed_company_slug"] for row in rows}
    unexpected_company_changes = [
        slug
        for slug in companies_before.keys() | companies.keys()
        if slug not in affected_slugs and companies_before.get(slug) != companies.get(slug)
    ]
    if unexpected_company_changes:
        raise ValueError(f"Unexpected company index changes: {unexpected_company_changes}")
    if len(companies_before) != len(companies):
        raise ValueError("The company count changed")

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

    category_counts = Counter(
        category
        for row in cut["residual"]
        for category in row["conflict_reason"].split(" | ")
        if category
    )
    report = {
        "schemaVersion": 1,
        "batchId": BATCH_ID,
        "reviewedAt": REVIEWED_AT,
        "sourceSnapshot": SOURCE_SNAPSHOT,
        "sourcePackageSha256": SOURCE_PACKAGE_SHA256,
        "git": {
            "firstPrBase": FIRST_PR_BASE,
            "firstPrHead": FIRST_PR_HEAD,
            "secondPhaseBase": FIRST_PR_HEAD,
            "headAtGeneration": git_head(),
            "stackedBaseBranch": "codex/company-credit-ps4-pal-batch-1-20260905",
        },
        "packageManifest": cut["packageManifest"],
        "writesPerformed": apply,
        "sourceCut": {
            "initial": cut["initialCounts"],
            "identifierBlocked": cut["warningCounts"],
            "ready": cut["readyCounts"],
        },
        "summary": {
            "publicationCandidates": len(cut["publication"]),
            "appliedAdditions": len(rows),
            "developerAdditions": sum(row["target_field"] == "developer" for row in rows),
            "publisherAdditions": sum(row["target_field"] == "publisher" for row in rows),
            "changedCatalogIds": len(expected_ids),
            "bothFields": cut["readyCounts"]["bothFields"],
            "retains": len(cut["retains"]),
            "replacementCandidates": len(cut["replacements"]),
            "cleanReplacementCandidates": sum(not row["identifier_warning"] for row in cut["replacements"]),
            "identifierBlocked": len(cut["identifierBlocked"]),
            "conflictingCandidateGroups": len(cut["conflicting"]),
            "unresolvedEntityRows": len(cut["unresolved"]),
            "createdDetailRecords": len(created_details),
            "staleInput": 0,
        },
        "catalog": {
            "rowsBefore": len(catalog),
            "rowsAfter": len(catalog),
            "idsBefore": len(set(catalog_ids)),
            "idsAfter": len(set(catalog_ids)),
            "sha256Before": catalog_hash,
            "sha256After": catalog_hash,
            "unchanged": True,
        },
        "companies": {"rowsBefore": len(companies_before), "rowsAfter": len(companies), "created": 0},
        "details": {
            "sha256Before": details_hash_before,
            "sha256After": details_hash_after,
            "changedCatalogIds": len(detail_changes),
            "createdRecords": len(created_details),
        },
        "residualQueue": {
            "rows": len(cut["residual"]),
            "categories": dict(sorted(category_counts.items())),
        },
        "artifacts": {key: str(path.relative_to(ROOT)) for key, path in OUTPUT_FILES.items()},
        "scopeChecks": {
            "onlyHighConfidence": True,
            "onlyAddMissing": True,
            "noHighReplacements": True,
            "noDigitalPublisherAsPhysical": True,
            "noIdentifierWarningsApplied": True,
            "uniqueCanonicalCompanyPerField": True,
            "noFirstBatchDuplicates": True,
            "changedDetailsOnlyForReadyCatalogIds": True,
            "changedCompanyIndexOnlyForReferencedSlugs": True,
            "allChangedCatalogRowsArePs4Pal": all(
                catalog_by_id[catalog_id]["platformSlug"] == "ps4"
                and str(catalog_by_id[catalog_id]["region"]).startswith("PAL")
                for catalog_id in expected_ids
            ),
            "catalogIdsUrlsTitlesRegionsEditionsCoversPricesCusaUnchanged": True,
            "noRegionalPlatformOrEditionPropagation": True,
            "noCompaniesCreated": True,
        },
        "protectedFileHashes": {
            relative: {"before": before_hashes[relative], "after": after_hashes[relative]}
            for relative in before_hashes
        },
        "verification": {
            "semanticComparator": "PENDING",
            "typecheck": "PENDING",
            "lint": "PENDING",
            "unitTests": "PENDING",
            "collectorControls": "PENDING",
            "affiliateOffersV1": "PENDING",
            "build": "PENDING",
            "previewQa": "PENDING",
        },
    }

    if apply:
        write_json(DETAILS_FILE, details)
        write_json(COMPANIES_FILE, companies)
        for path, manifest in protected_manifests.items():
            write_json(path, manifest)
        subprocess.run([sys.executable, str(VERIFIED_INDEX_BUILDER), "--write"], cwd=ROOT, check=True)
    write_json(REPORT_FILE, report)
    REPORT_MD_FILE.write_text(render_markdown(report), encoding="utf-8")
    return report


def check_committed() -> dict[str, Any]:
    publication = read_csv(OUTPUT_FILES["publicationCandidates"])
    additions = read_csv(OUTPUT_FILES["additionsReady"])
    retains = read_csv(OUTPUT_FILES["retains"])
    replacements = read_csv(OUTPUT_FILES["replacementsReview"])
    identifier_blocked = read_csv(OUTPUT_FILES["identifierBlocked"])
    residual = read_csv(OUTPUT_FILES["residualQueue"])
    report = read_json(REPORT_FILE)
    catalog = read_json(CATALOG_FILE)
    details = read_json(DETAILS_FILE)
    companies = read_json(COMPANIES_FILE)

    if len(publication) != EXPECTED_INITIAL["rows"] or len(additions) != EXPECTED_READY["rows"]:
        raise ValueError("Committed HIGH artifact counts changed")
    if len(retains) != EXPECTED_READY["retains"] or len(replacements) != EXPECTED_INITIAL["replace"]:
        raise ValueError("Committed retain/replacement counts changed")
    if len(identifier_blocked) != EXPECTED_IDENTIFIER_BLOCKED["rows"]:
        raise ValueError("Committed identifier-blocked count changed")
    if any(row["confidence"] != "HIGH" for row in additions):
        raise ValueError("A committed addition is not HIGH")
    if any(row["recommended_action"] != "ADD_MISSING" for row in additions):
        raise ValueError("A committed addition is not ADD_MISSING")
    if any(row["identifier_warning"].strip() for row in additions):
        raise ValueError("A committed addition has an identifier warning")
    if any(row["role"] in FORBIDDEN_ROLES for row in additions):
        raise ValueError("A forbidden role reached committed additions")
    if any(row["content_type"] not in ALLOWED_CONTENT_TYPES for row in additions):
        raise ValueError("A forbidden content type reached committed additions")
    if len({(row["catalog_id"], row["target_field"]) for row in additions}) != len(additions):
        raise ValueError("Committed additions contain duplicate fields")

    evaluations = evaluate_additions(additions, catalog, details, companies)
    invalid_evaluations = [
        evaluation
        for row, evaluation in zip(additions, evaluations)
        if evaluation["status"] != "ALREADY_APPLIED"
        and not is_allowed_successor_application(row, details.get(row["catalog_id"], {}))
    ]
    if invalid_evaluations:
        raise ValueError("Committed HIGH additions are not applied exactly")
    if report["writesPerformed"] is not True or report["summary"]["appliedAdditions"] != len(additions):
        raise ValueError("Structured report is not an applied 749-row report")
    catalog_report = report["catalog"]
    if (
        catalog_report["rowsBefore"] != catalog_report["rowsAfter"]
        or catalog_report["idsBefore"] != catalog_report["idsAfter"]
        or catalog_report["sha256Before"] != catalog_report["sha256After"]
        or catalog_report["unchanged"] is not True
    ):
        raise ValueError("Historical HIGH batch catalog invariants changed")
    if len(catalog) != len({row["id"] for row in catalog}):
        raise ValueError("Current catalog contains duplicate IDs")
    companies_report = report["companies"]
    if companies_report["rowsBefore"] != companies_report["rowsAfter"] or companies_report["created"] != 0:
        raise ValueError("Historical HIGH batch company invariants changed")
    for row in residual:
        categories = set(split_pipe(row["conflict_reason"]))
        if not categories or categories - RESIDUAL_CATEGORIES:
            raise ValueError(f"Unknown residual category: {row['conflict_reason']}")
    for path in OUTPUT_FILES.values():
        if not path.is_file():
            raise ValueError(f"Missing committed artifact: {path.relative_to(ROOT)}")
    print(
        "OK PS4 PAL HIGH credits: 749 additions, 1428 RETAIN rows, "
        "100 replacements blocked and no propagation"
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--generate", action="store_true", help="Write dry-run artifacts only")
    mode.add_argument("--apply", action="store_true", help="Write artifacts and guarded additions")
    mode.add_argument("--check", action="store_true", help="Validate committed artifacts and data")
    parser.add_argument("--package-dir", type=Path)
    args = parser.parse_args()

    if args.check:
        check_committed()
        return 0
    if args.package_dir is None:
        raise ValueError("--generate and --apply require --package-dir")
    package_dir = args.package_dir.resolve()
    companies = read_json(COMPANIES_FILE)
    cut = build_source_cut(package_dir, companies)
    write_artifacts(cut, companies)
    report = run_apply(cut, apply=args.apply)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
