#!/usr/bin/env python3
"""Build the additive Region Atlas people layer from the audited research package."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


PUBLIC_STATUSES = {"READY_EDITORIAL", "READY_STRUCTURED"}
PUBLIC_LEVELS = {
    "READY_EDITORIAL": "editorial",
    "READY_STRUCTURED": "structured",
}
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


def is_public_person(person: dict[str, Any]) -> bool:
    return not person["requires_review"] and person["publication_status"] in PUBLIC_STATUSES


def portrait_is_usable(media: dict[str, Any]) -> bool:
    required = bool(str(media.get("attribution_required", "")).lower() == "true")
    return bool(
        media.get("thumbnail_url")
        and media.get("source_url")
        and media.get("license")
        and (not required or media.get("artist"))
    )


def public_profile(person: dict[str, Any], media: dict[str, Any] | None) -> dict[str, Any]:
    level = PUBLIC_LEVELS[person["publication_status"]]
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

    editorial = level == "editorial"
    return {
        "slug": person["slug"],
        "name": person["name"],
        "qid": person["qid"],
        "publicationLevel": level,
        "aliases": person.get("aliases", []),
        "nativeNames": person.get("native_names", []),
        "birthDate": person.get("birth_date") or None,
        "birthYear": person.get("birth_year"),
        "birthPrecision": person.get("birth_precision") or None,
        "deathDate": person.get("death_date") or None,
        "deathYear": person.get("death_year"),
        "deathPrecision": person.get("death_precision") or None,
        "lifeStatus": person.get("life_status") or "UNKNOWN",
        "birthPlace": person.get("birth_place"),
        "citizenships": person.get("citizenships", []),
        "originDisplay": person.get("origin_display") or None,
        "occupations": person.get("occupations", []),
        "fieldsOfWork": person.get("fields_of_work", []),
        "education": person.get("education", []),
        "careerStart": person.get("career_start") or None,
        "careerEnd": person.get("career_end") or None,
        "officialWebsites": [clean_url(url) for url in person.get("official_websites", [])],
        "biographyEs": person["biography_es"],
        "careerSummaryEs": person.get("career_summary_es") or None,
        "industryImpactEs": person.get("industry_impact_es") if editorial else None,
        "publicReceptionEs": person.get("public_reception_es") if editorial else None,
        "portrait": portrait,
        "sourceIds": sorted(set(person.get("source_ids", []))),
        "lastChecked": person["last_checked"],
    }


def publication_for_child(
    row: dict[str, Any], public_slugs: set[str], *, allow_association: bool = False
) -> str:
    if row.get("person_slug") not in public_slugs:
        return "internal"
    if allow_association and row.get("relationship_precision") == "ASSOCIATION_NOT_EXACT_CREDIT":
        return "published_context"
    return "published" if not row.get("requires_review", True) else "internal"


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
    public_people = [person for person in people if is_public_person(person)]
    public_slugs = {person["slug"] for person in public_people}
    staged_people = [person for person in people if person["slug"] not in public_slugs]
    if len(public_people) != 327 or len(staged_people) != 161:
        raise ValueError("The public/staging partition must be exactly 327/161")

    media_by_slug = {
        row["person_slug"]: row
        for row in package["person_media"]
        if row["person_slug"] in public_slugs and portrait_is_usable(row)
    }
    if len(media_by_slug) != 217:
        raise ValueError(f"Expected 217 usable public portraits, found {len(media_by_slug)}")

    relations = []
    public_relations = []
    for row in package["person_company_relations"]:
        visibility = publication_for_child(row, public_slugs)
        if visibility == "published" and (not row.get("company_slug") or row["company_slug"] not in companies):
            raise ValueError(f"Public relation has no canonical company: {row['relation_id']}")
        record = {**row, "publication_status": visibility}
        relations.append(record)
        if visibility == "published":
            public_relations.append(
                {
                    "id": row["relation_id"],
                    "personSlug": row["person_slug"],
                    "companySlug": row["company_slug"],
                    "companyName": row["company_name"],
                    "role": row["role"],
                    "roleLabelEs": row["role_label_es"],
                    "start": row.get("role_start") or None,
                    "end": row.get("role_end") or None,
                    "pointInTime": row.get("point_in_time") or None,
                    "confidence": row["confidence"],
                    "sourceId": row["source_id"],
                }
            )
    if len(public_relations) != 87:
        raise ValueError(f"Expected 87 safe public company relations, found {len(public_relations)}")

    works = []
    exact_credits = []
    related_works = []
    for row in package["person_works"]:
        visibility = publication_for_child(row, public_slugs, allow_association=True)
        record = {**row, "publication_status": visibility}
        works.append(record)
        public_record = {
            "id": row["work_id"],
            "personSlug": row["person_slug"],
            "workQid": row.get("work_qid") or None,
            "title": row["title"],
            "year": row.get("year") or None,
            "role": row["role"],
            "confidence": row["confidence"],
            "sourceId": row["source_id"],
        }
        if visibility == "published" and row["relationship_precision"] == "EXACT_EDITORIAL_CREDIT":
            exact_credits.append(public_record)
        elif visibility == "published_context":
            related_works.append(public_record)
    if len(exact_credits) != 63 or len(related_works) != 159:
        raise ValueError(
            f"Expected 63 exact credits and 159 contextual works, found {len(exact_credits)}/{len(related_works)}"
        )

    awards = []
    public_awards = []
    for row in package["person_awards"]:
        visibility = publication_for_child(row, public_slugs)
        awards.append({**row, "publication_status": visibility})
        if visibility == "published":
            public_awards.append(
                {
                    "id": row["award_id"],
                    "personSlug": row["person_slug"],
                    "name": row["award_name"],
                    "date": row.get("date") or None,
                    "confidence": row["confidence"],
                    "sourceId": row["source_id"],
                }
            )
    if len(public_awards) != 173:
        raise ValueError(f"Expected 173 safe public awards, found {len(public_awards)}")

    positions = []
    public_positions = []
    for row in package["person_positions"]:
        visibility = publication_for_child(row, public_slugs)
        positions.append({**row, "publication_status": visibility})
        if visibility == "published":
            public_positions.append(
                {
                    "id": row["position_id"],
                    "personSlug": row["person_slug"],
                    "name": row["position_name"],
                    "start": row.get("start") or None,
                    "end": row.get("end") or None,
                    "pointInTime": row.get("point_in_time") or None,
                    "confidence": row["confidence"],
                    "sourceId": row["source_id"],
                }
            )
    if len(public_positions) != 15:
        raise ValueError(f"Expected 15 safe public positions, found {len(public_positions)}")

    public_curiosities = []
    for row in package["person_curiosities"]:
        if row["person_slug"] in public_slugs and not row["requires_review"]:
            public_curiosities.append(
                {
                    "id": row["curiosity_id"],
                    "personSlug": row["person_slug"],
                    "summaryEs": row["summary_es"],
                    "confidence": row["confidence"],
                    "sourceId": row["source_id"],
                }
            )
    if len(public_curiosities) != 25:
        raise ValueError(f"Expected 25 safe curiosities, found {len(public_curiosities)}")

    profiles = [public_profile(person, media_by_slug.get(person["slug"])) for person in public_people]
    profiles.sort(key=lambda row: (row["name"].casefold(), row["slug"]))

    referenced_source_ids = {source_id for profile in profiles for source_id in profile["sourceIds"]}
    referenced_source_ids.update(row["sourceId"] for row in public_relations)
    referenced_source_ids.update(row["sourceId"] for row in exact_credits)
    referenced_source_ids.update(row["sourceId"] for row in related_works)
    referenced_source_ids.update(row["sourceId"] for row in public_awards)
    referenced_source_ids.update(row["sourceId"] for row in public_positions)
    referenced_source_ids.update(row["sourceId"] for row in public_curiosities)
    referenced_source_ids.update(media["source_id"] for media in media_by_slug.values())

    sources_by_id = {row["source_id"]: row for row in package["person_sources"]}
    missing_sources = referenced_source_ids - sources_by_id.keys()
    if missing_sources:
        raise ValueError(f"Missing public sources: {sorted(missing_sources)[:10]}")
    public_sources = [public_source(sources_by_id[source_id]) for source_id in sorted(referenced_source_ids)]

    core_records = [
        {
            **person,
            "visibility": "published" if person["slug"] in public_slugs else "admin_only",
        }
        for person in people
    ]
    media_records = [
        {
            **row,
            "thumbnail_url": clean_url(row.get("thumbnail_url", "")),
            "original_url": clean_url(row.get("original_url", "")),
            "source_url": clean_url(row.get("source_url", "")),
            "license_url": clean_url(row.get("license_url", "")),
            "local_path": (
                f"/person-portraits/{row['person_slug']}.webp"
                if row["person_slug"] in media_by_slug
                else None
            ),
            "publication_status": "published" if row["person_slug"] in media_by_slug else "internal",
        }
        for row in package["person_media"]
    ]
    source_records = [
        {
            **row,
            "url": clean_url(row.get("url", "")),
            "title": source_title(row),
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
            "publishedPeople": 327,
            "editorialPeople": 25,
            "structuredPeople": 302,
            "stagingPeople": 161,
            "publicPortraits": 217,
            "publicCompanyRelations": 87,
            "publicExactCredits": 63,
            "publicContextualWorks": 159,
            "publicAwards": 173,
            "publicPositions": 15,
            "publicCuriosities": 25,
            "unresolvedMentions": 138,
            "internalSources": 1736,
            "internalProvenanceRows": 5154,
        },
        "policies": {
            "identityKey": "qid",
            "routeKey": "slug",
            "automaticMergeAllowed": False,
            "stagingIsPublic": False,
            "contextualWorkIsExactCredit": False,
            "portraitHotlinkingAllowed": False,
        },
        "protectedFileHashes": protected_hashes,
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
    public_slugs = {
        person["slug"] for person in package["people"] if is_public_person(person)
    }
    items = [
        media
        for media in package["person_media"]
        if media["person_slug"] in public_slugs and portrait_is_usable(media)
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
