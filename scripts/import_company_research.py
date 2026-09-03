#!/usr/bin/env python3
"""Build the approved, additive company-research layer from audited artifacts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any


PUBLIC_HISTORY_SLUGS = {"nintendo", "sega", "capcom", "konami"}
QID_CORRECTIONS = {
    "adk": ("Q18247429", "Q2634015"),
    "capcom": ("Q144680", "Q14428"),
    "sims": ("Q16883354", "Q4048789"),
}
PRIMARY_HISTORY_URLS = {
    "nintendo": "https://www.nintendo.co.jp/corporate/en/history/index.html",
    "sega": "https://www.sega.co.jp/en/company/history/",
    "capcom": "https://www.capcom.co.jp/ir/english/company/history.html",
    "konami": "https://www.konami.com/corporate/en/history/",
}
EXTERNAL_RELATION_SOURCES = {
    "https://www.sec.gov/Archives/edgar/data/718877/000091205702025821/a2083006z10-k.htm": {
        "title": "Activision 2002 annual report",
        "kind": "OFFICIAL_REGULATORY_FILING",
        "reliability": "PRIMARY_OFFICIAL",
    },
    "https://corp.marv.jp/english/company/history.html": {
        "title": "Marvelous corporate history",
        "kind": "OFFICIAL_CORPORATE_HISTORY",
        "reliability": "PRIMARY_OFFICIAL",
    },
}
GENERATED_FILES = (
    "core.json",
    "provenance.json",
    "sources.json",
    "review.json",
    "editorial.json",
    "public.json",
    "relationship-decisions.json",
    "manifest.json",
)
PROTECTED_FILES = (
    "data/company-profiles.json",
    "data/company-groups.json",
    "data/company-separations.json",
    "data/index/companies.json",
    "data/index/company-entities.json",
    "data/game-details.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-dir", type=Path, required=True)
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}-{sha256_bytes(value.encode('utf-8'))[:16]}"


def parse_json_list(raw: str) -> list[str]:
    if not raw.strip():
        return []
    parsed = json.loads(raw)
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise ValueError(f"Expected a JSON string list, got: {raw[:120]}")
    return parsed


def parse_bool(raw: str) -> bool:
    return raw.strip().lower() == "true"


def split_pipe(raw: str) -> list[str]:
    return sorted({item.strip() for item in raw.split("|") if item.strip()})


def git_head(repo: Path) -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()


def build_source_registry(
    source_rows: list[dict[str, str]],
    requested_urls: dict[str, set[str]],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    by_url: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in source_rows:
        if row["url"].strip():
            by_url[row["url"].strip()].append(row)

    sources: list[dict[str, Any]] = []
    ids: dict[str, str] = {}
    for url in sorted(requested_urls):
        rows = by_url.get(url, [])
        source_id = stable_id("source", url)
        ids[url] = source_id
        manual = EXTERNAL_RELATION_SOURCES.get(url)
        title = manual["title"] if manual else (rows[0]["source_title"] if rows else url)
        kind = manual["kind"] if manual else (rows[0]["source_kind"] if rows else "UNREGISTERED_PROVENANCE")
        reliability = manual["reliability"] if manual else (rows[0]["reliability"] if rows else "UNVERIFIED")
        languages = sorted({row["language"] for row in rows if row["language"]})
        supports = sorted({field for row in rows for field in split_pipe(row["supports_fields"])})
        retrieved = sorted({row["retrieved_at"] for row in rows if row["retrieved_at"]})
        sources.append(
            {
                "id": source_id,
                "url": url,
                "title": title,
                "kind": kind,
                "reliability": reliability,
                "languages": languages,
                "subjectSlugs": sorted(requested_urls[url]),
                "supportsFields": supports,
                "retrievedAt": retrieved[-1] if retrieved else "2026-09-03",
                "verifiedPrimary": reliability == "PRIMARY_OFFICIAL",
                "registryState": "registered" if rows or manual else "missing",
            }
        )
    return sources, ids


def build_outputs(
    repo: Path,
    audit_dir: Path,
    package_dir: Path,
    base_commit: str,
) -> dict[str, Any]:
    core_candidates = read_json(audit_dir / "candidate-research-core.json")
    review_gates = read_json(audit_dir / "review-gates.json")
    report = read_json(audit_dir / "report.json")
    editorial_candidates = read_json(audit_dir / "candidate-editorial-staging.json")
    public_children = read_json(audit_dir / "candidate-public-child-records.json")

    package_data = package_dir / "data"
    provenance_rows = read_csv(package_data / "company-field-provenance.csv")
    source_rows = read_csv(package_data / "company-sources.csv")
    profile_rows = read_csv(package_data / "company-profiles.csv")

    companies = read_json(repo / "data/index/companies.json")
    profile_by_slug = {row["slug"]: row for row in profile_rows}
    core_slugs = {row["slug"] for row in core_candidates}
    if len(core_candidates) != 1400 or len(core_slugs) != 1400:
        raise ValueError("The approved internal core must contain exactly 1,400 unique slugs")
    if not core_slugs.issubset(companies):
        raise ValueError("The internal core contains slugs absent from the live company index")

    provenance_by_key: dict[tuple[str, str], dict[str, str]] = {}
    requested_urls: dict[str, set[str]] = defaultdict(set)
    for row in provenance_rows:
        key = (row["slug"], row["field_path"])
        provenance_by_key[key] = row

    core_records: list[dict[str, Any]] = []
    provenance: list[dict[str, Any]] = []
    for candidate in sorted(core_candidates, key=lambda item: item["slug"]):
        slug = candidate["slug"]
        provenance_ids: list[str] = []
        for field_path in sorted(candidate["provenancePaths"]):
            row = provenance_by_key.get((slug, field_path))
            if row is None:
                raise ValueError(f"Missing provenance for {slug}:{field_path}")
            urls = parse_json_list(row["source_urls"])
            for url in urls:
                requested_urls[url].add(slug)
            provenance_id = stable_id("provenance", f"company:{slug}:{field_path}")
            provenance_ids.append(provenance_id)
            provenance.append(
                {
                    "id": provenance_id,
                    "subjectType": "company",
                    "subjectSlug": slug,
                    "fieldPath": field_path,
                    "value": row["value"],
                    "confidence": row["confidence"],
                    "sourceUrls": urls,
                    "lastChecked": row["last_checked"],
                    "publicationStatus": "internal",
                }
            )
        record = {key: value for key, value in candidate.items() if key != "provenancePaths"}
        record["provenanceIds"] = provenance_ids
        record["visibility"] = "admin_only"
        core_records.append(record)

    for editorial in editorial_candidates:
        for url in sorted(set(editorial["historySourceUrls"] + editorial["impactSourceUrls"])):
            requested_urls[url].add(editorial["slug"])
    for slug, (_, new_qid) in QID_CORRECTIONS.items():
        requested_urls[f"https://www.wikidata.org/wiki/{new_qid}"].add(slug)
    for slug, url in PRIMARY_HISTORY_URLS.items():
        requested_urls[url].add(slug)
    for conflict in report["child_datasets"]["relationships"]["externally_verified_conflicts"]:
        requested_urls[conflict["verification_url"]].add(conflict["source_slug"])

    sources, source_ids = build_source_registry(source_rows, requested_urls)
    for row in provenance:
        row["sourceIds"] = [source_ids[url] for url in row.pop("sourceUrls")]

    public_sources_urls = {
        *PRIMARY_HISTORY_URLS.values(),
        *(f"https://www.wikidata.org/wiki/{qid}" for _, qid in QID_CORRECTIONS.values()),
    }
    public_sources = [source for source in sources if source["url"] in public_sources_urls]

    public_profiles: list[dict[str, Any]] = []
    for slug in sorted(PUBLIC_HISTORY_SLUGS | set(QID_CORRECTIONS)):
        item: dict[str, Any] = {
            "slug": slug,
            "publicationStatus": "published",
            "reviewedAt": "2026-09-03",
            "sourceIds": [],
        }
        if slug in QID_CORRECTIONS:
            previous_qid, corrected_qid = QID_CORRECTIONS[slug]
            qid_url = f"https://www.wikidata.org/wiki/{corrected_qid}"
            item["identityCorrection"] = {
                "field": "wikidataId",
                "previousValue": previous_qid,
                "value": corrected_qid,
                "sourceId": source_ids[qid_url],
                "replaceLegacyIdentitySources": True,
            }
            item["sourceIds"].append(source_ids[qid_url])
        if slug in PUBLIC_HISTORY_SLUGS:
            editorial = next(row for row in editorial_candidates if row["slug"] == slug)
            official_url = PRIMARY_HISTORY_URLS[slug]
            if not editorial["historyPublicationReady"]:
                raise ValueError(f"Public history was not approved by the audit: {slug}")
            item["history"] = {
                "textEs": editorial["historyEs"],
                "method": "research",
                "sourceIds": [source_ids[official_url]],
            }
            item["sourceIds"].append(source_ids[official_url])
        item["sourceIds"] = sorted(set(item["sourceIds"]))
        public_profiles.append(item)

    achievements: list[dict[str, Any]] = []
    for row in public_children["achievements"]:
        source_url = row["source_url"]
        requested_slug = row["slug"]
        if source_url != PRIMARY_HISTORY_URLS[requested_slug]:
            raise ValueError(f"Achievement lacks the approved primary source: {requested_slug}")
        achievements.append(
            {
                "id": stable_id("achievement", compact_json(row)),
                "companySlug": requested_slug,
                "type": row["achievement_type"],
                "title": row["title"],
                "summaryEs": row["summary_es"],
                "yearLabel": row["year"] or None,
                "relatedGamesOrSeries": parse_json_list(row["related_games_or_series"]),
                "confidence": row["confidence"],
                "sourceId": source_ids[source_url],
                "publicationStatus": "published",
            }
        )
    achievements.sort(key=lambda item: (item["companySlug"], item["yearLabel"] or "9999", item["title"]))
    if len(achievements) != 7:
        raise ValueError("Exactly seven achievements are authorized for publication")

    editorials: list[dict[str, Any]] = []
    for row in sorted(editorial_candidates, key=lambda item: item["slug"]):
        urls = sorted(set(row["historySourceUrls"] + row["impactSourceUrls"]))
        editorials.append(
            {
                "slug": row["slug"],
                "historyEs": row["historyEs"],
                "industryImpactEs": row["industryImpactEs"],
                "publicationStatus": "published" if row["slug"] in PUBLIC_HISTORY_SLUGS else "draft",
                "historyEvidenceReady": row["historyEvidenceReady"],
                "impactEvidenceReady": row["impactEvidenceReady"],
                "sourceIds": [source_ids[url] for url in urls],
            }
        )

    blocked = []
    for detail in review_gates["profile_details"]:
        if not detail["reasons"]:
            continue
        row = profile_by_slug[detail["slug"]]
        blocked.append(
            {
                "slug": detail["slug"],
                "name": row["company_name"],
                "qid": row["qid"] or None,
                "confidence": row["confidence"],
                "identityStatus": row["identity_status"],
                "entityKind": row["entity_kind"],
                "reasons": sorted(set(detail["reasons"])),
                "visibility": "blocked",
            }
        )
    blocked.sort(key=lambda item: item["slug"])
    if len(blocked) != 2926 or len(blocked) + len(core_records) != 4326:
        raise ValueError("Approved and blocked records must partition all 4,326 companies")

    individual_slugs = report["integrity"]["individual_creator_profile_slugs"]
    composite_slugs = sorted(
        row["slug"]
        for row in profile_rows
        if row["current_status"] == "COMPOSITE_CREDIT_TO_SPLIT"
    )
    if len(individual_slugs) != 12 or len(composite_slugs) != 383:
        raise ValueError("Protected person/composite counts changed")

    relationship_conflicts = []
    for conflict in report["child_datasets"]["relationships"]["externally_verified_conflicts"]:
        relationship_conflicts.append(
            {
                "companySlug": conflict["source_slug"],
                "relationshipType": conflict["relationship_type"],
                "rejectedTargetQid": conflict["target_qid"],
                "decision": "excluded_pending_research",
                "reason": conflict["reason"],
                "sourceId": source_ids[conflict["verification_url"]],
                "replacementImported": False,
            }
        )

    protected_hashes = {path: sha256_file(repo / path) for path in PROTECTED_FILES}
    audit_hashes = {
        name: sha256_file(audit_dir / name)
        for name in (
            "candidate-research-core.json",
            "candidate-editorial-staging.json",
            "candidate-public-child-records.json",
            "review-gates.json",
            "report.json",
        )
    }
    source_package_sha = report["package"]["sha256"]
    outputs: dict[str, Any] = {
        "core.json": {
            "version": 1,
            "visibility": "admin_only",
            "records": core_records,
        },
        "provenance.json": {
            "version": 1,
            "visibility": "admin_only",
            "records": provenance,
        },
        "sources.json": {
            "version": 1,
            "visibility": "admin_only",
            "records": sources,
        },
        "review.json": {
            "version": 1,
            "visibility": "admin_only",
            "records": blocked,
            "qidCollisionGroups": report["identity_collisions"]["groups"],
            "individualCreatorSlugs": individual_slugs,
            "compositeCreditSlugs": composite_slugs,
        },
        "editorial.json": {
            "version": 1,
            "visibility": "admin_only_except_published_projection",
            "records": editorials,
        },
        "public.json": {
            "version": 1,
            "profiles": public_profiles,
            "achievements": achievements,
            "sources": public_sources,
        },
        "relationship-decisions.json": {
            "version": 1,
            "visibility": "admin_only",
            "importedRelationships": [],
            "heldRelationshipCount": report["child_datasets"]["relationships"]["rows"],
            "externallyVerifiedExclusions": relationship_conflicts,
        },
    }
    outputs["manifest.json"] = {
        "version": 1,
        "generatedAt": "2026-09-03",
        "baseCommit": base_commit,
        "sourcePackage": {
            "name": "estudio-companias-regionatlas-2026-09-03.zip",
            "sha256": source_package_sha,
        },
        "auditArtifacts": audit_hashes,
        "counts": {
            "totalCompanies": 4326,
            "internalCore": len(core_records),
            "blocked": len(blocked),
            "publishedHistories": len(PUBLIC_HISTORY_SLUGS),
            "publishedAchievements": len(achievements),
            "publishedQidCorrections": len(QID_CORRECTIONS),
            "qidCollisionGroups": len(report["identity_collisions"]["groups"]),
            "qidCollisionSlugs": report["identity_collisions"]["affected_slug_count"],
            "blockedIndividuals": len(individual_slugs),
            "blockedCompositeProfiles": len(composite_slugs),
            "publishedRelationships": 0,
        },
        "protectedFileHashes": protected_hashes,
        "generatedFiles": list(GENERATED_FILES),
        "rollback": {
            "mode": "additive_layer",
            "instructions": "Remove this research directory and its loader imports. No canonical profile, entity, slug or game-credit file was overwritten by the import.",
        },
    }
    return outputs


def main() -> int:
    args = parse_args()
    repo = args.repo.resolve()
    output_dir = repo / "data/research/company-study"
    existing_manifest = output_dir / "manifest.json"
    base_commit = (
        read_json(existing_manifest)["baseCommit"]
        if existing_manifest.exists()
        else git_head(repo)
    )
    outputs = build_outputs(
        repo,
        args.audit_dir.resolve(),
        args.package_dir.resolve(),
        base_commit,
    )
    rendered = {name: pretty_json(value) for name, value in outputs.items()}

    if args.check:
        mismatches = []
        for name, content in rendered.items():
            path = output_dir / name
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                mismatches.append(name)
        if mismatches:
            raise SystemExit(f"Generated company research data is stale: {', '.join(mismatches)}")
        print("Company research data is deterministic and current.")
        return 0

    if not args.write:
        summary = outputs["manifest.json"]["counts"]
        print(pretty_json(summary), end="")
        print("Dry-run only. Pass --write to create the additive data layer.")
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    for name, content in rendered.items():
        (output_dir / name).write_text(content, encoding="utf-8")
    print(f"Wrote {len(rendered)} files to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
