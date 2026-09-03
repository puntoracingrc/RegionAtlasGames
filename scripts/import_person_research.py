#!/usr/bin/env python3
"""Build the additive Region Atlas people layer from the audited research package."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


PUBLIC_STATUSES = {"READY_EDITORIAL"}
APPROVALS_FILE = "data/research/person-editorial-approvals.json"
OUTPUT_FILES = (
    "core.json",
    "relations.json",
    "works.json",
    "awards.json",
    "positions.json",
    "media.json",
    "provenance.json",
    "sources.json",
    "review.json",
    "public.json",
    "manifest.json",
)
PROTECTED_FILES = (
    "data/game-details.json",
    "data/company-profiles.json",
    "data/index/companies.json",
    "data/index/company-entities.json",
    "data/research/company-study/core.json",
    "data/research/company-study/public.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--download-portraits", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def first_year(*values: Any) -> int | None:
    for value in values:
        match = re.search(r"\b(?:18|19|20)\d{2}\b", str(value or ""))
        if match:
            return int(match.group(0))
    return None


def clean_url(value: str) -> str:
    if not value:
        return ""
    parsed = urllib.parse.urlsplit(value)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    clean_query = [(key, item) for key, item in query if not key.lower().startswith("utm_")]
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(clean_query), parsed.fragment)
    )


def source_title(row: dict[str, Any]) -> str:
    title = str(row.get("title") or "").strip()
    if title:
        return title
    hostname = urllib.parse.urlsplit(str(row.get("url") or "")).hostname or "Fuente documental"
    labels = {
        "www.wikidata.org": "Wikidata",
        "www.wikipedia.org": "Wikipedia",
        "es.wikipedia.org": "Wikipedia en español",
        "en.wikipedia.org": "Wikipedia en inglés",
        "commons.wikimedia.org": "Wikimedia Commons",
    }
    return labels.get(hostname, hostname.removeprefix("www."))


def is_public_person(person: dict[str, Any], approved_slugs: set[str]) -> bool:
    return (
        person["slug"] in approved_slugs
        and not person["requires_review"]
        and person["publication_status"] in PUBLIC_STATUSES
    )


def portrait_is_usable(media: dict[str, Any]) -> bool:
    required = bool(str(media.get("attribution_required", "")).lower() == "true")
    return bool(
        media.get("thumbnail_url")
        and media.get("source_url")
        and media.get("license")
        and (not required or media.get("artist"))
    )


def public_profile(
    person: dict[str, Any],
    media: dict[str, Any] | None,
    approval: dict[str, Any],
    reviewed_at: str,
) -> dict[str, Any]:
    portrait = None
    if media:
        portrait = {
            "path": f"/person-portraits/{person['slug']}.webp",
            "sourceUrl": clean_url(media["source_url"]),
            "license": media["license"],
            "licenseUrl": clean_url(media.get("license_url", "")) or None,
            "artist": media.get("artist") or None,
            "credit": media.get("credit") or None,
            "attributionRequired": str(media.get("attribution_required", "")).lower() == "true",
            "sourceId": media["source_id"],
        }

    claims = approval["biographyClaims"]
    if not claims or any(not claim.get("text") or not claim.get("sourceIds") for claim in claims):
        raise ValueError(f"Editorial biography claims need text and sources: {person['slug']}")
    biography_source_ids = sorted({source_id for claim in claims for source_id in claim["sourceIds"]})
    fact_source_ids = sorted(set(approval["factSourceIds"]))
    occupations_by_name = {row["name"]: row for row in person.get("occupations", [])}
    occupations = [
        occupations_by_name.get(name, {"qid": "", "name": name, "source_urls": []})
        for name in approval.get("occupationNames", [])
    ]
    field_sources = {
        "identity": fact_source_ids,
        "life": fact_source_ids,
        "originDisplay": fact_source_ids,
        "occupations": fact_source_ids,
        "biographyEs": biography_source_ids,
    }
    return {
        "slug": person["slug"],
        "name": person["name"],
        "qid": person["qid"],
        "publicationLevel": "editorial",
        "aliases": person.get("aliases", []),
        "nativeNames": person.get("native_names", []),
        "birthDate": person.get("birth_date") or None,
        "birthYear": person.get("birth_year"),
        "birthPrecision": person.get("birth_precision") or None,
        "deathDate": person.get("death_date") or None,
        "deathYear": person.get("death_year"),
        "deathPrecision": person.get("death_precision") or None,
        "lifeStatus": person.get("life_status") or "UNKNOWN",
        "birthPlace": None,
        "citizenships": [],
        "originDisplay": approval.get("originDisplay") or None,
        "occupations": occupations,
        "fieldsOfWork": [],
        "education": [],
        "careerStart": None,
        "careerEnd": None,
        "officialWebsites": [],
        "biographyEs": " ".join(claim["text"] for claim in claims),
        "biographyClaims": claims,
        "careerSummaryEs": None,
        "industryImpactEs": None,
        "publicReceptionEs": None,
        "portrait": portrait,
        "fieldSources": field_sources,
        "sourceIds": sorted(set(fact_source_ids + biography_source_ids)),
        "lastChecked": reviewed_at,
    }


def public_source(row: dict[str, Any]) -> dict[str, Any]:
    kind = row.get("source_kind") or "UNCLASSIFIED"
    reliability = row.get("reliability") or "UNVERIFIED"
    return {
        "id": row["source_id"],
        "url": clean_url(row["url"]),
        "title": source_title(row),
        "kind": kind,
        "reliability": reliability,
        "language": row.get("language") or None,
        "retrievedAt": row.get("retrieved_at") or None,
        "verifiedPrimary": kind in {
            "OFFICIAL_OR_FIRST_PARTY",
            "AWARD_OR_CULTURAL_INSTITUTION",
        } and reliability == "HIGH",
    }


def build_outputs(repo: Path, package_dir: Path) -> dict[str, Any]:
    package = read_json(package_dir / "data/person-profile-import.json")
    summary = package["summary"]
    people = package["people"]

    expected = {
        "people_profiles": 488,
        "editorially_reviewed": 25,
        "ready_structured": 302,
        "staging_review": 161,
        "person_company_relations": 911,
        "works": 247,
        "exact_editorial_credits": 63,
        "awards": 364,
        "milestones": 1693,
        "curiosities": 25,
        "sources": 1736,
        "field_provenance_rows": 5154,
        "unresolved_source_mentions": 138,
    }
    for key, value in expected.items():
        if summary.get(key) != value:
            raise ValueError(f"Unexpected package count for {key}: {summary.get(key)} != {value}")

    slugs = [person["slug"] for person in people]
    qids = [person["qid"] for person in people]
    if len(set(slugs)) != 488 or len(set(qids)) != 488:
        raise ValueError("People must have 488 unique slugs and 488 unique QIDs")
    if any(person.get("entity_kind") != "PERSON" for person in people):
        raise ValueError("The package contains a non-human profile")
    if any(person.get("automatic_merge_allowed") for person in people):
        raise ValueError("Automatic person merges are forbidden")

    companies = read_json(repo / "data/index/companies.json")
    company_research = read_json(repo / "data/research/company-study/core.json")
    company_research_by_slug = {row["slug"]: row for row in company_research["records"]}
    people_by_slug = {person["slug"]: person for person in people}
    sources_by_id = {row["source_id"]: row for row in package["person_sources"]}
    approvals = read_json(repo / APPROVALS_FILE)
    if approvals.get("version") != 1:
        raise ValueError("Unsupported editorial approval version")
    approval_rows = approvals.get("profiles", [])
    approvals_by_slug = {row["slug"]: row for row in approval_rows}
    if len(approval_rows) != 25 or len(approvals_by_slug) != 25:
        raise ValueError("Editorial approvals must contain 25 unique profiles")

    editorial_slugs = {
        person["slug"]
        for person in people
        if person["publication_status"] == "READY_EDITORIAL" and not person["requires_review"]
    }
    if approvals_by_slug.keys() != editorial_slugs:
        raise ValueError("Editorial approvals must match the 25 READY_EDITORIAL identities exactly")

    public_people = [person for person in people if is_public_person(person, editorial_slugs)]
    public_slugs = {person["slug"] for person in public_people}
    structured_people = [
        person
        for person in people
        if person["publication_status"] == "READY_STRUCTURED" and not person["requires_review"]
    ]
    structured_slugs = {person["slug"] for person in structured_people}
    staged_people = [
        person for person in people if person["slug"] not in public_slugs | structured_slugs
    ]
    if len(public_people) != 25 or len(structured_people) != 302 or len(staged_people) != 161:
        raise ValueError("The editorial/structured/blocked partition must be exactly 25/302/161")

    retained_portrait_slugs = {
        path.stem for path in (repo / "public/person-portraits").glob("*.webp")
    }
    if len(retained_portrait_slugs) != 217:
        raise ValueError(f"Expected 217 retained portrait files, found {len(retained_portrait_slugs)}")
    usable_media = {
        row["person_slug"]: row
        for row in package["person_media"]
        if portrait_is_usable(row)
    }
    missing_retained_media = retained_portrait_slugs - usable_media.keys()
    if missing_retained_media:
        raise ValueError(f"Retained portraits lack license metadata: {sorted(missing_retained_media)[:10]}")
    retained_media_by_slug = {
        slug: usable_media[slug] for slug in retained_portrait_slugs
    }
    media_by_slug = {
        slug: media for slug, media in retained_media_by_slug.items() if slug in public_slugs
    }

    approved_relations = {row["id"]: row for row in approvals.get("approvedRelations", [])}
    known_blocked_relations = approvals.get("knownBlockedRelations", {})
    relation_rows_by_id = {row["relation_id"]: row for row in package["person_company_relations"]}
    if approved_relations.keys() - relation_rows_by_id.keys():
        raise ValueError("An approved relation does not exist in the research package")
    if known_blocked_relations.keys() - relation_rows_by_id.keys():
        raise ValueError("A known blocked relation does not exist in the research package")

    canonical_aliases = approvals.get("canonicalCompanyAliases", {})
    relations = []
    public_relations = []
    public_relation_keys: set[tuple[str, str]] = set()
    for row in package["person_company_relations"]:
        relation_id = row["relation_id"]
        approved = approved_relations.get(relation_id)
        visibility = "published" if approved else "internal"
        block_reason = known_blocked_relations.get(relation_id)
        relations.append(
            {
                **row,
                "publication_status": visibility,
                "publication_block_reason": block_reason,
            }
        )
        if not approved:
            continue
        if row["person_slug"] not in public_slugs or row.get("requires_review", True):
            raise ValueError(f"An unreviewed relation cannot be public: {relation_id}")
        if row.get("relation_origin") == "WIKIDATA_P108":
            raise ValueError(f"Wikidata P108 alone cannot verify a relation: {relation_id}")
        company_slug = canonical_aliases.get(row.get("company_slug"), row.get("company_slug"))
        if not company_slug or company_slug not in companies:
            raise ValueError(f"Public relation has no canonical company: {relation_id}")
        source_id = approved["sourceId"]
        source = sources_by_id.get(source_id)
        if not source or source.get("reliability") != "HIGH" or source.get("source_kind") not in {
            "OFFICIAL_OR_FIRST_PARTY",
            "AWARD_OR_CULTURAL_INSTITUTION",
        }:
            raise ValueError(f"Public relation needs an independent high-confidence source: {relation_id}")
        relation_key = (row["person_slug"], company_slug)
        if relation_key in public_relation_keys:
            raise ValueError(f"Duplicate public relation through a company alias: {relation_id}")
        public_relation_keys.add(relation_key)
        start = approved.get("start") or row.get("role_start") or None
        end = approved.get("end") or row.get("role_end") or None
        point_in_time = approved.get("pointInTime") or row.get("point_in_time") or None
        person = people_by_slug[row["person_slug"]]
        death_year = person.get("death_year")
        relation_years = [
            year
            for year in (
                first_year(start),
                first_year(point_in_time),
                first_year(end),
            )
            if year is not None
        ]
        if death_year and any(year > death_year for year in relation_years):
            raise ValueError(f"Public relation occurs after the person's death: {relation_id}")
        company_founded_year = company_research_by_slug.get(company_slug, {}).get("foundedYear")
        if death_year and company_founded_year and company_founded_year > death_year:
            raise ValueError(f"Company was founded after the person's death: {relation_id}")
        if "FOUNDER" in row["role"] and company_founded_year:
            relation_year = first_year(start, point_in_time)
            if relation_year != company_founded_year:
                raise ValueError(f"Founder relation must match the company founding year: {relation_id}")
        public_relations.append(
            {
                "id": relation_id,
                "personSlug": row["person_slug"],
                "companySlug": company_slug,
                "companyName": row["company_name"],
                "role": row["role"],
                "roleLabelEs": row["role_label_es"],
                "start": start,
                "end": end,
                "pointInTime": point_in_time,
                "confidence": "HIGH",
                "sourceId": source_id,
                "relationOrigin": row.get("relation_origin") or "UNKNOWN",
                "verificationStatus": "INDEPENDENT_SOURCE_VERIFIED",
            }
        )

    def approved_ids(field: str) -> set[str]:
        values = [item for approval in approval_rows for item in approval.get(field, [])]
        if len(values) != len(set(values)):
            raise ValueError(f"Duplicate identifiers in editorial approvals: {field}")
        return set(values)

    approved_exact_credit_ids = approved_ids("exactCreditIds")
    approved_award_ids = approved_ids("awardIds")
    approved_position_ids = approved_ids("positionIds")
    approved_curiosity_ids = approved_ids("curiosityIds")

    works = []
    exact_credits = []
    related_works = []
    found_exact_credit_ids: set[str] = set()
    for row in package["person_works"]:
        work_id = row["work_id"]
        visibility = "published" if work_id in approved_exact_credit_ids else "internal"
        works.append({**row, "publication_status": visibility})
        if visibility != "published":
            continue
        if (
            row["person_slug"] not in public_slugs
            or row.get("requires_review", True)
            or row.get("relationship_precision") != "EXACT_EDITORIAL_CREDIT"
        ):
            raise ValueError(f"Only reviewed exact credits can be public: {work_id}")
        found_exact_credit_ids.add(work_id)
        exact_credits.append(
            {
                "id": work_id,
                "personSlug": row["person_slug"],
                "workQid": row.get("work_qid") or None,
                "title": row["title"],
                "year": row.get("year") or None,
                "role": row["role"],
                "relationshipPrecision": row["relationship_precision"],
                "confidence": row["confidence"],
                "sourceId": row["source_id"],
            }
        )
    if found_exact_credit_ids != approved_exact_credit_ids or len(exact_credits) != 63:
        raise ValueError("The 63 approved exact credits must resolve exactly")

    awards = []
    public_awards = []
    found_award_ids: set[str] = set()
    for row in package["person_awards"]:
        award_id = row["award_id"]
        visibility = "published" if award_id in approved_award_ids else "internal"
        awards.append({**row, "publication_status": visibility})
        if visibility != "published":
            continue
        if row["person_slug"] not in public_slugs or row.get("requires_review", True):
            raise ValueError(f"An unreviewed award cannot be public: {award_id}")
        found_award_ids.add(award_id)
        public_awards.append(
            {
                "id": award_id,
                "personSlug": row["person_slug"],
                "name": row["award_name"],
                "date": row.get("date") or None,
                "confidence": row["confidence"],
                "sourceId": row["source_id"],
            }
        )
    if found_award_ids != approved_award_ids:
        raise ValueError("Every approved award must resolve to a reviewed public record")

    positions = []
    public_positions = []
    found_position_ids: set[str] = set()
    for row in package["person_positions"]:
        position_id = row["position_id"]
        visibility = "published" if position_id in approved_position_ids else "internal"
        positions.append({**row, "publication_status": visibility})
        if visibility != "published":
            continue
        if row["person_slug"] not in public_slugs or row.get("requires_review", True):
            raise ValueError(f"An unreviewed position cannot be public: {position_id}")
        found_position_ids.add(position_id)
        public_positions.append(
            {
                "id": position_id,
                "personSlug": row["person_slug"],
                "name": row["position_name"],
                "start": row.get("start") or None,
                "end": row.get("end") or None,
                "pointInTime": row.get("point_in_time") or None,
                "confidence": row["confidence"],
                "sourceId": row["source_id"],
            }
        )
    if found_position_ids != approved_position_ids:
        raise ValueError("Every approved position must resolve to a reviewed public record")

    public_curiosities = []
    found_curiosity_ids: set[str] = set()
    for row in package["person_curiosities"]:
        curiosity_id = row["curiosity_id"]
        if curiosity_id not in approved_curiosity_ids:
            continue
        if row["person_slug"] not in public_slugs or row.get("requires_review", True):
            raise ValueError(f"An unreviewed curiosity cannot be public: {curiosity_id}")
        found_curiosity_ids.add(curiosity_id)
        public_curiosities.append(
            {
                "id": curiosity_id,
                "personSlug": row["person_slug"],
                "summaryEs": row["summary_es"],
                "confidence": row["confidence"],
                "sourceId": row["source_id"],
            }
        )
    if found_curiosity_ids != approved_curiosity_ids:
        raise ValueError("Every approved curiosity must resolve to a reviewed public record")

    profiles = [
        public_profile(
            person,
            media_by_slug.get(person["slug"]),
            approvals_by_slug[person["slug"]],
            approvals["reviewedAt"],
        )
        for person in public_people
    ]
    profiles.sort(key=lambda row: (row["name"].casefold(), row["slug"]))

    referenced_source_ids = {source_id for profile in profiles for source_id in profile["sourceIds"]}
    referenced_source_ids.update(row["sourceId"] for row in public_relations)
    referenced_source_ids.update(row["sourceId"] for row in exact_credits)
    referenced_source_ids.update(row["sourceId"] for row in related_works)
    referenced_source_ids.update(row["sourceId"] for row in public_awards)
    referenced_source_ids.update(row["sourceId"] for row in public_positions)
    referenced_source_ids.update(row["sourceId"] for row in public_curiosities)
    referenced_source_ids.update(media["source_id"] for media in media_by_slug.values())

    missing_sources = referenced_source_ids - sources_by_id.keys()
    if missing_sources:
        raise ValueError(f"Missing public sources: {sorted(missing_sources)[:10]}")
    public_sources = [public_source(sources_by_id[source_id]) for source_id in sorted(referenced_source_ids)]

    core_records = []
    for person in people:
        if person["slug"] in public_slugs:
            visibility = "published"
        elif person["slug"] in structured_slugs:
            visibility = "admin_structured"
        else:
            visibility = "blocked"
        core_records.append({**person, "visibility": visibility})
    media_records = [
        {
            **row,
            "thumbnail_url": clean_url(row.get("thumbnail_url", "")),
            "original_url": clean_url(row.get("original_url", "")),
            "source_url": clean_url(row.get("source_url", "")),
            "license_url": clean_url(row.get("license_url", "")),
            "local_path": (
                f"/person-portraits/{row['person_slug']}.webp"
                if row["person_slug"] in retained_portrait_slugs
                else None
            ),
            "publication_status": (
                "published"
                if row["person_slug"] in media_by_slug
                else "internal_retained"
                if row["person_slug"] in retained_portrait_slugs
                else "internal"
            ),
        }
        for row in package["person_media"]
    ]
    source_records = [
        {
            **row,
            "url": clean_url(row.get("url", "")),
            "title": source_title(row),
            "publication_status": (
                "published" if row["source_id"] in referenced_source_ids else "internal"
            ),
        }
        for row in package["person_sources"]
    ]

    protected_hashes = {relative: sha256_file(repo / relative) for relative in PROTECTED_FILES}
    generated_at = package["generated_at"]
    manifest = {
        "version": 1,
        "generatedAt": generated_at,
        "sourcePackage": "estudio-personas-regionatlas-2026-09-03.zip",
        "counts": {
            "totalPeople": 488,
            "publishedPeople": 25,
            "editorialPeople": 25,
            "structuredPeople": 302,
            "stagingPeople": 161,
            "publicPortraits": len(media_by_slug),
            "retainedPortraits": 217,
            "publicCompanyRelations": len(public_relations),
            "internalCompanyRelations": len(relations) - len(public_relations),
            "explicitlyBlockedRelations": len(known_blocked_relations),
            "removedPublicRelations": 87 - len(public_relations),
            "publicExactCredits": 63,
            "publicContextualWorks": 0,
            "publicAwards": len(public_awards),
            "publicPositions": len(public_positions),
            "publicCuriosities": len(public_curiosities),
            "unresolvedMentions": 138,
            "internalSources": 1736,
            "internalProvenanceRows": 5154,
        },
        "policies": {
            "identityKey": "qid",
            "routeKey": "slug",
            "automaticMergeAllowed": False,
            "stagingIsPublic": False,
            "structuredIsPublic": False,
            "reviewRelationIsPublic": False,
            "wikidataOnlyRelationIsVerified": False,
            "contextualWorkIsExactCredit": False,
            "portraitHotlinkingAllowed": False,
        },
        "protectedFileHashes": protected_hashes,
        "editorialApprovalHash": sha256_file(repo / APPROVALS_FILE),
    }

    return {
        "core.json": {"version": 1, "records": core_records},
        "relations.json": {"version": 1, "records": relations},
        "works.json": {"version": 1, "records": works},
        "awards.json": {"version": 1, "records": awards},
        "positions.json": {"version": 1, "records": positions},
        "media.json": {"version": 1, "records": media_records},
        "provenance.json": {"version": 1, "records": package["person_field_provenance"]},
        "sources.json": {"version": 1, "records": source_records},
        "review.json": {
            "version": 1,
            "records": [
                {
                    "slug": person["slug"],
                    "name": person["name"],
                    "qid": person["qid"],
                    "confidence": person["confidence"],
                    "reasons": person["review_reasons"],
                    "visibility": "blocked",
                }
                for person in staged_people
            ],
            "unresolvedMentions": package["unresolved_mentions"],
        },
        "public.json": {
            "version": 1,
            "generatedAt": generated_at,
            "profiles": profiles,
            "companyRelations": public_relations,
            "positions": public_positions,
            "exactCredits": exact_credits,
            "relatedWorks": related_works,
            "awards": public_awards,
            "curiosities": public_curiosities,
            "sources": public_sources,
        },
        "manifest.json": manifest,
    }


def download_portrait(item: dict[str, Any], destination: Path) -> tuple[str, str]:
    slug = item["person_slug"]
    output = destination / f"{slug}.webp"
    url = clean_url(item["thumbnail_url"])
    last_error: Exception | None = None
    if output.exists():
        try:
            with Image.open(output) as existing:
                if existing.size == (640, 800) and existing.format == "WEBP":
                    return slug, sha256_file(output)
        except OSError:
            output.unlink()

    for attempt in range(7):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "RegionAtlasResearch/1.0 (https://www.regionatlas.games)",
                    "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
                },
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = response.read(24 * 1024 * 1024)
            with Image.open(io.BytesIO(payload)) as loaded:
                image = ImageOps.exif_transpose(loaded).convert("RGB")
                image = ImageOps.fit(
                    image,
                    (640, 800),
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.42),
                )
                image.save(output, "WEBP", quality=82, method=6, exif=b"", icc_profile=None)
            with Image.open(output) as checked:
                if checked.size != (640, 800) or checked.format != "WEBP":
                    raise ValueError(f"Invalid normalized portrait for {slug}")
            time.sleep(0.55)
            return slug, sha256_file(output)
        except Exception as error:  # pragma: no cover - network retry boundary
            last_error = error
            time.sleep(min(45, 2 ** (attempt + 1)))
    raise RuntimeError(f"Unable to download portrait for {slug}: {last_error}")


def write_portraits(package: dict[str, Any], repo: Path) -> dict[str, str]:
    retained_slugs = {
        path.stem for path in (repo / "public/person-portraits").glob("*.webp")
    }
    items = [
        media
        for media in package["person_media"]
        if media["person_slug"] in retained_slugs and portrait_is_usable(media)
    ]
    destination = repo / "public/person-portraits"
    destination.mkdir(parents=True, exist_ok=True)
    hashes: dict[str, str] = {}
    for item in items:
        slug, digest = download_portrait(item, destination)
        hashes[slug] = digest
    if len(hashes) != 217:
        raise ValueError(f"Expected 217 downloaded portraits, found {len(hashes)}")
    return dict(sorted(hashes.items()))


def main() -> None:
    args = parse_args()
    repo = args.repo.resolve()
    package_dir = args.package_dir.resolve()
    output_dir = repo / "data/research/person-study"
    outputs = build_outputs(repo, package_dir)

    if args.write:
        output_dir.mkdir(parents=True, exist_ok=True)
        for name, value in outputs.items():
            (output_dir / name).write_text(pretty_json(value), encoding="utf-8")
        if args.download_portraits:
            package = read_json(package_dir / "data/person-profile-import.json")
            portrait_hashes = write_portraits(package, repo)
            manifest_path = output_dir / "manifest.json"
            manifest = read_json(manifest_path)
            manifest["portraitHashes"] = portrait_hashes
            manifest_path.write_text(pretty_json(manifest), encoding="utf-8")

    if args.check:
        for name in OUTPUT_FILES:
            path = output_dir / name
            if not path.exists():
                raise FileNotFoundError(path)
            expected = outputs[name]
            if name == "manifest.json":
                stored = read_json(path)
                portrait_hashes = stored.get("portraitHashes", {})
                if len(portrait_hashes) != 217:
                    raise ValueError("Manifest must contain 217 portrait hashes")
                expected = {**expected, "portraitHashes": portrait_hashes}
                for slug, digest in portrait_hashes.items():
                    portrait_path = repo / f"public/person-portraits/{slug}.webp"
                    if not portrait_path.exists() or sha256_file(portrait_path) != digest:
                        raise ValueError(f"Portrait hash mismatch: {slug}")
            if read_json(path) != expected:
                raise ValueError(f"Generated output is stale: {name}")

    print(pretty_json(outputs["manifest.json"]).strip())


if __name__ == "__main__":
    main()
