#!/usr/bin/env python3
"""Completa desarrolladoras y publicadoras desde ediciones hermanas verificadas."""

from __future__ import annotations

import argparse
import copy
import html
import json
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.game_details_lib import is_valid_detail, load_json, save_json  # noqa: E402
from company_entity import canonicalize_entity  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
COMPANIES_FILE = ROOT / "data" / "index" / "companies.json"
META_FILE = ROOT / "data" / "meta.json"
REPORT_FILE = ROOT / "data" / "company-role-backfill-report.json"

ROLE_LABELS = {
    "developer": "desarrolladora",
    "publisher": "publicadora",
}
Canonicalizer = Callable[[Optional[dict[str, Any]]], Optional[dict[str, Any]]]


def title_key(value: object) -> str:
    text = html.unescape(str(value or ""))
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'").replace("‘", "'")
    text = re.sub(r"[‐‑‒–—]", "-", text)
    return re.sub(r"\s+", " ", text).strip().casefold()


def new_detail(now: str) -> dict[str, Any]:
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
        "fetchedAt": now,
        "mergedAt": now,
    }


def entity_value(detail: dict[str, Any] | None, role: str) -> dict[str, Any] | None:
    entity = (detail or {}).get(role)
    if not isinstance(entity, dict) or not str(entity.get("name") or "").strip():
        return None
    return entity


def canonical_consensus(
    rows: list[dict[str, Any]],
    details: dict[str, dict[str, Any]],
    role: str,
    known_company_slugs: set[str],
    canonicalizer: Canonicalizer,
    *,
    minimum_evidence: int = 1,
) -> tuple[dict[str, Any], str, int] | None:
    candidates: dict[str, list[tuple[dict[str, Any], str]]] = defaultdict(list)
    for row in rows:
        entity = canonicalizer(entity_value(details.get(row["id"]), role))
        if not entity:
            continue
        slug = str(entity.get("slug") or "").strip()
        if not slug or slug not in known_company_slugs:
            continue
        candidates[slug].append((entity, row["id"]))

    if len(candidates) != 1:
        return None
    evidence = next(iter(candidates.values()))
    if len(evidence) < minimum_evidence:
        return None
    entity, source_game_id = evidence[0]
    return entity, source_game_id, len(evidence)


def backfill_company_roles(
    catalog: list[dict[str, Any]],
    details: dict[str, dict[str, Any]],
    known_company_slugs: set[str],
    *,
    canonicalizer: Canonicalizer = canonicalize_entity,
    platform_filter: set[str] | None = None,
    limit: int | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    timestamp = now or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    evidence_details = copy.deepcopy(details)
    listed = [
        game
        for game in catalog
        if game.get("listingStatus") != "excluded"
        and (not platform_filter or game.get("platformSlug") in platform_filter)
    ]
    listed.sort(key=lambda game: str(game.get("id") or ""))

    def missing_counts(source: dict[str, dict[str, Any]]) -> dict[str, int]:
        missing_developer = sum(
            entity_value(source.get(game["id"]), "developer") is None for game in listed
        )
        missing_publisher = sum(
            entity_value(source.get(game["id"]), "publisher") is None for game in listed
        )
        missing_both = sum(
            entity_value(source.get(game["id"]), "developer") is None
            and entity_value(source.get(game["id"]), "publisher") is None
            for game in listed
        )
        return {
            "developer": missing_developer,
            "publisher": missing_publisher,
            "both": missing_both,
        }

    missing_before = missing_counts(evidence_details)

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for game in listed:
        key = (str(game.get("platformSlug") or ""), title_key(game.get("title")))
        if key[0] and key[1]:
            groups[key].append(game)

    changes: list[dict[str, Any]] = []
    changed_roles: set[tuple[str, str]] = set()
    groups_without_safe_consensus = {"developer": 0, "publisher": 0}

    def apply_consensus(
        recipients: list[dict[str, Any]],
        role: str,
        consensus: tuple[dict[str, Any], str, int] | None,
        method: str,
    ) -> None:
        nonlocal changes
        if not consensus:
            if any(entity_value(details.get(row["id"]), role) is None for row in recipients):
                groups_without_safe_consensus[role] += 1
            return
        entity, source_game_id, evidence_count = consensus
        for row in recipients:
            game_id = row["id"]
            if (game_id, role) in changed_roles or entity_value(details.get(game_id), role):
                continue
            if limit is not None and len(changes) >= limit:
                return
            detail = details.setdefault(game_id, new_detail(timestamp))
            copied_entity = copy.deepcopy(entity)
            detail[role] = copied_entity
            detail.setdefault("fieldSources", {})[role] = str(
                copied_entity.get("source") or "catalog-sibling"
            )
            detail["mergedAt"] = timestamp
            changed_roles.add((game_id, role))
            changes.append(
                {
                    "gameId": game_id,
                    "title": row.get("title"),
                    "platform": row.get("platformSlug"),
                    "region": row.get("region"),
                    "role": role,
                    "roleLabel": ROLE_LABELS[role],
                    "company": copied_entity.get("name"),
                    "companySlug": copied_entity.get("slug"),
                    "sourceGameId": source_game_id,
                    "evidenceCount": evidence_count,
                    "method": method,
                }
            )

    for rows in groups.values():
        developer = canonical_consensus(
            rows,
            evidence_details,
            "developer",
            known_company_slugs,
            canonicalizer,
        )
        apply_consensus(rows, "developer", developer, "same-platform-exact-title")

        by_region: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            by_region[str(row.get("region") or "")].append(row)
        for region_rows in by_region.values():
            publisher = canonical_consensus(
                region_rows,
                evidence_details,
                "publisher",
                known_company_slugs,
                canonicalizer,
            )
            apply_consensus(
                region_rows,
                "publisher",
                publisher,
                "same-platform-region-exact-title",
            )

    by_platform: dict[str, dict[str, int]] = defaultdict(
        lambda: {"developer": 0, "publisher": 0, "games": 0}
    )
    game_ids_by_platform: dict[str, set[str]] = defaultdict(set)
    for change in changes:
        platform = str(change["platform"])
        by_platform[platform][str(change["role"])] += 1
        game_ids_by_platform[platform].add(str(change["gameId"]))
    for platform, game_ids in game_ids_by_platform.items():
        by_platform[platform]["games"] = len(game_ids)

    changed_games = {change["gameId"] for change in changes}
    return {
        "generatedAt": timestamp,
        "policy": {
            "developer": "Consenso único entre fichas con plataforma y título exactos.",
            "publisher": "Consenso único con plataforma, título y región exactos.",
            "companies": "Solo se reutilizan slugs ya presentes en el índice canónico.",
        },
        "listedGamesScanned": len(listed),
        "knownCompanies": len(known_company_slugs),
        "missingBefore": missing_before,
        "missingAfter": missing_counts(details),
        "changedGames": len(changed_games),
        "rolesAdded": len(changes),
        "developersAdded": sum(change["role"] == "developer" for change in changes),
        "publishersAdded": sum(change["role"] == "publisher" for change in changes),
        "groupsWithoutSafeConsensus": groups_without_safe_consensus,
        "byPlatform": dict(sorted(by_platform.items())),
        "changes": changes,
    }


def update_company_index(
    companies: dict[str, dict[str, Any]], changes: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    for change in changes:
        slug = str(change["companySlug"])
        if slug not in companies:
            raise ValueError(f"La compañía {slug} no existe en el índice canónico")
        entry = companies[slug]
        game_id = str(change["gameId"])
        game_ids = entry.setdefault("gameIds", [])
        if game_id not in game_ids:
            game_ids.append(game_id)
            platform = str(change["platform"])
            by_platform = entry.setdefault("byPlatform", {})
            by_platform[platform] = int(by_platform.get(platform) or 0) + 1
        role_key = "asDeveloper" if change["role"] == "developer" else "asPublisher"
        role_ids = entry.setdefault(role_key, [])
        if game_id not in role_ids:
            role_ids.append(game_id)
        entry["gameCount"] = len(game_ids)
    return companies


def find_company_index_repairs(
    catalog: list[dict[str, Any]],
    details: dict[str, dict[str, Any]],
    companies: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    repairs: list[dict[str, Any]] = []
    for game in catalog:
        if game.get("listingStatus") == "excluded":
            continue
        game_id = str(game["id"])
        detail = details.get(game_id)
        for role in ROLE_LABELS:
            entity = canonicalize_entity(entity_value(detail, role))
            if not entity:
                continue
            slug = str(entity.get("slug") or "")
            entry = companies.get(slug)
            if not entry:
                continue
            role_key = "asDeveloper" if role == "developer" else "asPublisher"
            if game_id in entry.get("gameIds", []) and game_id in entry.get(role_key, []):
                continue
            repairs.append(
                {
                    "gameId": game_id,
                    "platform": game.get("platformSlug"),
                    "role": role,
                    "companySlug": slug,
                }
            )
    return repairs


def write_derivatives(
    details: dict[str, dict[str, Any]],
    catalog: list[dict[str, Any]],
    companies: dict[str, dict[str, Any]],
    changes: list[dict[str, Any]],
) -> dict[str, Any]:
    listed_ids = {
        game["id"] for game in catalog if game.get("listingStatus") != "excluded"
    }
    update_company_index(companies, changes)
    repairs = find_company_index_repairs(catalog, details, companies)
    update_company_index(companies, repairs)
    save_json(COMPANIES_FILE, companies)
    meta = load_json(META_FILE, {})
    meta["gamesWithDetails"] = sum(
        game_id in listed_ids and is_valid_detail(detail)
        for game_id, detail in details.items()
    )
    save_json(META_FILE, meta)
    return {
        "gamesWithDetails": meta["gamesWithDetails"],
        "companies": len(companies),
        "companyLinksRepaired": len(repairs),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Completa roles desde fichas hermanas sin crear compañías nuevas."
    )
    parser.add_argument("--apply", action="store_true", help="Guarda los cambios y regenera índices")
    parser.add_argument("--limit", type=int, help="Máximo de roles a completar")
    parser.add_argument("--platforms", help="Slugs de plataforma separados por comas")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE, [])
    details = load_json(DETAILS_FILE, {})
    companies = load_json(COMPANIES_FILE, {})
    platform_filter = (
        {value.strip() for value in args.platforms.split(",") if value.strip()}
        if args.platforms
        else None
    )
    report = backfill_company_roles(
        catalog,
        details,
        set(companies),
        platform_filter=platform_filter,
        limit=args.limit,
    )

    if args.apply:
        save_json(DETAILS_FILE, details)
        report["indexStats"] = write_derivatives(
            details,
            catalog,
            companies,
            report["changes"],
        )
        save_json(REPORT_FILE, report)

    mode = "aplicado" if args.apply else "simulación"
    summary = {key: value for key, value in report.items() if key != "changes"}
    print(json.dumps({"mode": mode, **summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
