"""Registro y resolución de entidades de compañía (fase 2)."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from entity_normalize import (
    decode_entity_text,
    is_joint_company_name,
    normalize_company_key,
    pick_display_name,
    slugs_share_prefix_cluster,
)

ROOT = Path(__file__).resolve().parents[1]
GROUPS_PATH = ROOT / "data" / "company-groups.json"
REGISTRY_PATH = ROOT / "data" / "index" / "company-entities.json"

_manual_slug_to_canonical: dict[str, dict[str, str]] = {}
_manual_prefix_rules: list[tuple[str, dict[str, str]]] = []
_registry_loaded = False
_registry: dict[str, Any] = {}
_slug_to_canonical: dict[str, str] = {}
_wikidata_to_canonical: dict[str, str] = {}
_museum_path_to_canonical: dict[str, str] = {}
_normalized_to_canonical: dict[str, str] = {}
_entity_records: dict[str, dict[str, Any]] = {}


def _load_manual_groups() -> None:
    if _manual_slug_to_canonical:
        return
    data = json.loads(GROUPS_PATH.read_text(encoding="utf-8"))
    for group in data.get("groups", []):
        canonical = {"slug": group["slug"], "name": group["name"]}
        _manual_slug_to_canonical[group["slug"]] = canonical
        for exact in group.get("exactSlugs") or []:
            _manual_slug_to_canonical[exact] = canonical
        for prefix in group.get("slugPrefixes") or []:
            _manual_prefix_rules.append((prefix, canonical))
            _manual_slug_to_canonical[prefix] = canonical
    _manual_prefix_rules.sort(key=lambda item: len(item[0]), reverse=True)


def _manual_canonical_slug(slug: str) -> str | None:
    _load_manual_groups()
    direct = _manual_slug_to_canonical.get(slug)
    if direct:
        return direct["slug"]
    for prefix, canonical in _manual_prefix_rules:
        if slug == prefix or slug.startswith(f"{prefix}-"):
            return canonical["slug"]
    return None


def _load_registry() -> None:
    global _registry_loaded
    if _registry_loaded:
        return
    _load_manual_groups()
    if REGISTRY_PATH.exists():
        _registry.update(json.loads(REGISTRY_PATH.read_text(encoding="utf-8")))
        _slug_to_canonical.update(_registry.get("slugToCanonical") or {})
        _wikidata_to_canonical.update(_registry.get("wikidataToCanonical") or {})
        _museum_path_to_canonical.update(_registry.get("museumPathToCanonical") or {})
        _normalized_to_canonical.update(_registry.get("normalizedToCanonical") or {})
        _entity_records.update(_registry.get("entities") or {})
    _registry_loaded = True


def reload_registry() -> None:
    global _registry_loaded
    _registry_loaded = False
    _registry.clear()
    _slug_to_canonical.clear()
    _wikidata_to_canonical.clear()
    _museum_path_to_canonical.clear()
    _normalized_to_canonical.clear()
    _entity_records.clear()
    _load_registry()


def get_company_entity(slug: str) -> dict[str, Any] | None:
    _load_registry()
    canonical = resolve_canonical_company_slug(slug)
    return _entity_records.get(canonical)


def resolve_canonical_company_slug(
    slug: str,
    *,
    name: str | None = None,
    wikidata_id: str | None = None,
    museum_path: str | None = None,
) -> str:
    if not slug:
        return slug

    manual = _manual_canonical_slug(slug)
    if manual:
        return manual

    _load_registry()

    mapped = _slug_to_canonical.get(slug)
    if mapped:
        return mapped

    if wikidata_id:
        wd = _wikidata_to_canonical.get(wikidata_id)
        if wd:
            return wd

    if museum_path:
        mp = _museum_path_to_canonical.get(museum_path)
        if mp:
            return mp

    if name:
        key = normalize_company_key(name)
        if key and len(key) >= 3 and not is_joint_company_name(name):
            normalized = _normalized_to_canonical.get(key)
            if normalized and (normalized == slug or slug.startswith(f"{normalized}-") or normalized.startswith(f"{slug}-")):
                return normalized

    for prefix, canonical in _manual_prefix_rules:
        if slug == prefix or slug.startswith(f"{prefix}-"):
            return canonical["slug"]

    return slug


def resolve_canonical_company(
    slug: str,
    name: str | None = None,
    *,
    wikidata_id: str | None = None,
    museum_path: str | None = None,
) -> dict[str, str]:
    _load_manual_groups()
    _load_registry()
    canonical_slug = resolve_canonical_company_slug(
        slug,
        name=name,
        wikidata_id=wikidata_id,
        museum_path=museum_path,
    )
    manual = _manual_slug_to_canonical.get(canonical_slug)
    record = _entity_records.get(canonical_slug)
    display_name = (
        (manual or {}).get("name")
        or (record or {}).get("name")
        or pick_display_name({name or "", slug})
        or name
        or slug
    )
    return {"slug": canonical_slug, "name": display_name}


def canonicalize_entity(entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if not entity or not entity.get("name"):
        return None
    slug = str(entity.get("slug") or "")
    name = str(entity["name"])
    canonical = resolve_canonical_company(
        slug,
        name,
        wikidata_id=entity.get("wikidataId"),
        museum_path=entity.get("museumPath"),
    )
    merged = dict(entity)
    merged["slug"] = canonical["slug"]
    merged["name"] = canonical["name"]
    return merged


def _pick_cluster_canonical(
    slugs: set[str],
    slug_counts: dict[str, int],
) -> str:
    manual_hits = [_manual_canonical_slug(slug) for slug in slugs]
    manual = next((hit for hit in manual_hits if hit), None)
    if manual:
        return manual
    return max(slugs, key=lambda slug: (slug_counts.get(slug, 0), -len(slug)))


def build_company_entity_registry(
    details: dict[str, dict],
    listed_ids: set[str],
) -> dict[str, Any]:
    _load_manual_groups()

    slug_counts: dict[str, int] = defaultdict(int)
    slug_names: dict[str, set[str]] = defaultdict(set)
    slug_wikidata: dict[str, set[str]] = defaultdict(set)
    slug_museum: dict[str, set[str]] = defaultdict(set)
    wikidata_slugs: dict[str, set[str]] = defaultdict(set)
    museum_slugs: dict[str, set[str]] = defaultdict(set)
    normalized_variants: dict[str, set[str]] = defaultdict(set)

    for game_id in listed_ids:
        detail = details.get(game_id)
        if not detail or not isinstance(detail, dict):
            continue
        for role in ("developer", "publisher"):
            entity = detail.get(role)
            if not entity or not entity.get("name"):
                continue
            name = decode_entity_text(str(entity["name"]))
            slug = str(entity.get("slug") or "")
            if not slug:
                continue
            slug_counts[slug] += 1
            slug_names[slug].add(name)
            if entity.get("wikidataId"):
                wd = str(entity["wikidataId"])
                slug_wikidata[slug].add(wd)
                wikidata_slugs[wd].add(slug)
            if entity.get("museumPath"):
                mp = str(entity["museumPath"])
                slug_museum[slug].add(mp)
                museum_slugs[mp].add(slug)
            if not is_joint_company_name(name):
                key = normalize_company_key(name)
                if key and len(key) >= 3:
                    normalized_variants[key].add(slug)

    slug_to_canonical: dict[str, str] = {}
    wikidata_to_canonical: dict[str, str] = {}
    museum_path_to_canonical: dict[str, str] = {}
    normalized_to_canonical: dict[str, str] = {}
    entities: dict[str, dict[str, Any]] = {}

    def register_cluster(
        slugs: set[str],
        merge_method: str,
        *,
        wikidata_id: str | None = None,
        museum_path: str | None = None,
        normalized_key: str | None = None,
    ) -> None:
        if len(slugs) <= 1:
            only = next(iter(slugs), None)
            if only and _manual_canonical_slug(only):
                canonical_slug = _manual_canonical_slug(only) or only
                slug_to_canonical[only] = canonical_slug
            return

        canonical_slug = _pick_cluster_canonical(slugs, slug_counts)
        names: set[str] = set()
        alias_slugs: set[str] = set()
        wikidata_ids: set[str] = set()
        museum_paths: set[str] = set()

        for slug in slugs:
            slug_to_canonical[slug] = canonical_slug
            if slug != canonical_slug:
                alias_slugs.add(slug)
            names.update(slug_names.get(slug, set()))
            wikidata_ids.update(slug_wikidata.get(slug, set()))
            museum_paths.update(slug_museum.get(slug, set()))

        manual = _manual_slug_to_canonical.get(canonical_slug)
        record = entities.setdefault(
            canonical_slug,
            {
                "slug": canonical_slug,
                "name": (manual or {}).get("name") or pick_display_name(names),
                "mergeMethod": merge_method,
                "aliasSlugs": [],
                "aliasNames": [],
                "wikidataIds": [],
                "museumPaths": [],
            },
        )
        if manual:
            record["name"] = manual["name"]
            record["mergeMethod"] = "manual"
        record["aliasSlugs"] = sorted(set(record.get("aliasSlugs", [])) | alias_slugs)
        record["aliasNames"] = sorted(
            {decode_entity_text(n) for n in names if decode_entity_text(n) and decode_entity_text(n) != record["name"]}
        )
        record["wikidataIds"] = sorted(set(record.get("wikidataIds", [])) | wikidata_ids)
        record["museumPaths"] = sorted(set(record.get("museumPaths", [])) | museum_paths)
        if wikidata_id:
            wikidata_to_canonical[wikidata_id] = canonical_slug
        if museum_path:
            museum_path_to_canonical[museum_path] = canonical_slug
        if normalized_key:
            normalized_to_canonical[normalized_key] = canonical_slug

    for group in json.loads(GROUPS_PATH.read_text(encoding="utf-8")).get("groups", []):
        members = {group["slug"], *(group.get("exactSlugs") or [])}
        for prefix in group.get("slugPrefixes") or []:
            members.update(
                slug
                for slug in slug_counts
                if slug == prefix or slug.startswith(f"{prefix}-")
            )
        members = {slug for slug in members if slug in slug_counts or slug == group["slug"]}
        if members:
            register_cluster(members, "manual")

    for wikidata_id, slugs in wikidata_slugs.items():
        if len(slugs) > 1:
            register_cluster(set(slugs), "wikidata", wikidata_id=wikidata_id)

    for museum_path, slugs in museum_slugs.items():
        if len(slugs) > 1:
            register_cluster(set(slugs), "museum", museum_path=museum_path)

    for key, slugs in normalized_variants.items():
        if len(slugs) <= 1:
            continue
        names = {name for slug in slugs for name in slug_names.get(slug, set())}
        if any(is_joint_company_name(name) for name in names):
            continue
        if not slugs_share_prefix_cluster(slugs):
            continue
        register_cluster(set(slugs), "normalized", normalized_key=key)

    for slug, count in slug_counts.items():
        canonical = slug_to_canonical.get(slug, _manual_canonical_slug(slug) or slug)
        if canonical not in entities:
            manual = _manual_slug_to_canonical.get(canonical)
            entities[canonical] = {
                "slug": canonical,
                "name": (manual or {}).get("name") or pick_display_name(slug_names.get(slug, {slug})),
                "mergeMethod": "manual" if manual else "slug",
                "aliasSlugs": sorted({s for s, c in slug_to_canonical.items() if c == canonical and s != canonical}),
                "aliasNames": sorted(
                    {
                        decode_entity_text(n)
                        for s, c in slug_to_canonical.items()
                        if c == canonical
                        for n in slug_names.get(s, set())
                        if decode_entity_text(n)
                        and decode_entity_text(n) != ((manual or {}).get("name") or pick_display_name(slug_names.get(slug, {slug})))
                    }
                ),
                "wikidataIds": sorted(slug_wikidata.get(slug, set())),
                "museumPaths": sorted(slug_museum.get(slug, set())),
            }

    for slug, canonical in list(slug_to_canonical.items()):
        if _manual_canonical_slug(slug):
            slug_to_canonical[slug] = _manual_canonical_slug(slug) or canonical

    auto_normalized = sum(1 for e in entities.values() if e.get("mergeMethod") == "normalized")
    auto_wikidata = sum(1 for e in entities.values() if e.get("mergeMethod") == "wikidata")
    auto_museum = sum(1 for e in entities.values() if e.get("mergeMethod") == "museum")

    return {
        "version": 2,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {
            "entities": len(entities),
            "aliases": sum(len(e.get("aliasSlugs") or []) for e in entities.values()),
            "autoNormalized": auto_normalized,
            "autoWikidata": auto_wikidata,
            "autoMuseum": auto_museum,
        },
        "entities": dict(sorted(entities.items())),
        "slugToCanonical": dict(sorted(slug_to_canonical.items())),
        "wikidataToCanonical": dict(sorted(wikidata_to_canonical.items())),
        "museumPathToCanonical": dict(sorted(museum_path_to_canonical.items())),
        "normalizedToCanonical": dict(sorted(normalized_to_canonical.items())),
    }


def save_company_entity_registry(registry: dict[str, Any]) -> Path:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reload_registry()
    return REGISTRY_PATH
