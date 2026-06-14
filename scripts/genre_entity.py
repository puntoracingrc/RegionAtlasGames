"""Registro y resolución de entidades de género."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from entity_normalize import decode_entity_text, pick_display_name, slugs_share_prefix_cluster

ROOT = Path(__file__).resolve().parents[1]
GROUPS_PATH = ROOT / "data" / "genre-groups.json"
REGISTRY_PATH = ROOT / "data" / "index" / "genre-entities.json"

_manual_slug_to_canonical: dict[str, dict[str, str]] = {}
_manual_prefix_rules: list[tuple[str, dict[str, str]]] = []
_registry_loaded = False
_registry: dict[str, Any] = {}
_slug_to_canonical: dict[str, str] = {}
_museum_path_to_canonical: dict[str, str] = {}
_normalized_to_canonical: dict[str, str] = {}
_entity_records: dict[str, dict[str, Any]] = {}


def normalize_genre_key(name: str) -> str:
    text = decode_entity_text(name).lower()
    import re
    import unicodedata

    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return re.sub(r"\s+", " ", text)


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
        _museum_path_to_canonical.update(_registry.get("museumPathToCanonical") or {})
        _normalized_to_canonical.update(_registry.get("normalizedToCanonical") or {})
        _entity_records.update(_registry.get("entities") or {})
    _registry_loaded = True


def resolve_canonical_genre_slug(
    slug: str,
    *,
    name: str | None = None,
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
    if museum_path:
        mp = _museum_path_to_canonical.get(museum_path)
        if mp:
            return mp
    if name:
        key = normalize_genre_key(name)
        if key and len(key) >= 3:
            normalized = _normalized_to_canonical.get(key)
            if normalized:
                return normalized
    for prefix, canonical in _manual_prefix_rules:
        if slug == prefix or slug.startswith(f"{prefix}-"):
            return canonical["slug"]
    return slug


def resolve_canonical_genre(slug: str, name: str | None = None, *, museum_path: str | None = None) -> dict[str, str]:
    _load_manual_groups()
    _load_registry()
    canonical_slug = resolve_canonical_genre_slug(slug, name=name, museum_path=museum_path)
    manual = _manual_slug_to_canonical.get(canonical_slug)
    record = _entity_records.get(canonical_slug)
    return {
        "slug": canonical_slug,
        "name": (manual or {}).get("name") or (record or {}).get("name") or name or slug,
    }


def canonicalize_genre_entity(entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if not entity or not entity.get("name"):
        return None
    slug = str(entity.get("slug") or "")
    name = str(entity["name"])
    canonical = resolve_canonical_genre(slug, name, museum_path=entity.get("museumPath"))
    merged = dict(entity)
    merged["slug"] = canonical["slug"]
    merged["name"] = canonical["name"]
    return merged


def _pick_cluster_canonical(slugs: set[str], slug_counts: dict[str, int]) -> str:
    manual = next((hit for hit in (_manual_canonical_slug(s) for s in slugs) if hit), None)
    if manual:
        return manual
    return max(slugs, key=lambda slug: (slug_counts.get(slug, 0), -len(slug)))


def build_genre_entity_registry(details: dict[str, dict], listed_ids: set[str]) -> dict[str, Any]:
    _load_manual_groups()
    slug_counts: dict[str, int] = defaultdict(int)
    slug_names: dict[str, set[str]] = defaultdict(set)
    slug_museum: dict[str, set[str]] = defaultdict(set)
    museum_slugs: dict[str, set[str]] = defaultdict(set)
    normalized_variants: dict[str, set[str]] = defaultdict(set)

    for game_id in listed_ids:
        detail = details.get(game_id)
        if not detail or not isinstance(detail, dict):
            continue
        for entity in detail.get("genres") or []:
            if not entity or not entity.get("name"):
                continue
            slug = str(entity.get("slug") or "")
            if not slug:
                continue
            name = decode_entity_text(str(entity["name"]))
            slug_counts[slug] += 1
            slug_names[slug].add(name)
            if entity.get("museumPath"):
                mp = str(entity["museumPath"])
                slug_museum[slug].add(mp)
                museum_slugs[mp].add(slug)
            key = normalize_genre_key(name)
            if key and len(key) >= 3:
                normalized_variants[key].add(slug)

    slug_to_canonical: dict[str, str] = {}
    museum_path_to_canonical: dict[str, str] = {}
    normalized_to_canonical: dict[str, str] = {}
    entities: dict[str, dict[str, Any]] = {}

    def register_cluster(
        slugs: set[str],
        merge_method: str,
        *,
        museum_path: str | None = None,
        normalized_key: str | None = None,
    ) -> None:
        if len(slugs) <= 1:
            only = next(iter(slugs), None)
            if only and _manual_canonical_slug(only):
                slug_to_canonical[only] = _manual_canonical_slug(only) or only
            return
        canonical_slug = _pick_cluster_canonical(slugs, slug_counts)
        names: set[str] = set()
        alias_slugs: set[str] = set()
        museum_paths: set[str] = set()
        for slug in slugs:
            slug_to_canonical[slug] = canonical_slug
            if slug != canonical_slug:
                alias_slugs.add(slug)
            names.update(slug_names.get(slug, set()))
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
        record["museumPaths"] = sorted(set(record.get("museumPaths", [])) | museum_paths)
        if museum_path:
            museum_path_to_canonical[museum_path] = canonical_slug
        if normalized_key:
            normalized_to_canonical[normalized_key] = canonical_slug

    for group in json.loads(GROUPS_PATH.read_text(encoding="utf-8")).get("groups", []):
        members = {group["slug"], *(group.get("exactSlugs") or [])}
        for prefix in group.get("slugPrefixes") or []:
            members.update(slug for slug in slug_counts if slug == prefix or slug.startswith(f"{prefix}-"))
        members = {slug for slug in members if slug in slug_counts or slug == group["slug"]}
        if members:
            register_cluster(members, "manual")

    for museum_path, slugs in museum_slugs.items():
        if len(slugs) > 1:
            register_cluster(set(slugs), "museum", museum_path=museum_path)

    for key, slugs in normalized_variants.items():
        if len(slugs) <= 1:
            continue
        if _normalized_to_canonical.get(key):
            continue
        if not slugs_share_prefix_cluster(slugs):
            manual_targets = {_manual_canonical_slug(slug) for slug in slugs}
            manual_targets.discard(None)
            if len(manual_targets) != 1:
                continue
        register_cluster(set(slugs), "normalized", normalized_key=key)

    for slug in slug_counts:
        canonical = slug_to_canonical.get(slug, _manual_canonical_slug(slug) or slug)
        if canonical not in entities:
            manual = _manual_slug_to_canonical.get(canonical)
            entities[canonical] = {
                "slug": canonical,
                "name": (manual or {}).get("name") or pick_display_name(slug_names.get(slug, {slug})),
                "mergeMethod": "manual" if manual else "slug",
                "aliasSlugs": sorted({s for s, c in slug_to_canonical.items() if c == canonical and s != canonical}),
                "aliasNames": [],
                "museumPaths": sorted(slug_museum.get(slug, set())),
            }

    return {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {
            "entities": len(entities),
            "aliases": sum(len(e.get("aliasSlugs") or []) for e in entities.values()),
            "autoNormalized": sum(1 for e in entities.values() if e.get("mergeMethod") == "normalized"),
        },
        "entities": dict(sorted(entities.items())),
        "slugToCanonical": dict(sorted(slug_to_canonical.items())),
        "museumPathToCanonical": dict(sorted(museum_path_to_canonical.items())),
        "normalizedToCanonical": dict(sorted(normalized_to_canonical.items())),
    }


def save_genre_entity_registry(registry: dict[str, Any]) -> Path:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return REGISTRY_PATH
