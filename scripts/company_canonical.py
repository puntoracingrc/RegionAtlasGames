"""Canonical company grouping (mirrors src/lib/company-canonical.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GROUPS_PATH = ROOT / "data" / "company-groups.json"

_slug_to_canonical: dict[str, dict[str, str]] = {}
_prefix_rules: list[tuple[str, dict[str, str]]] = []


def _load_groups() -> None:
    if _slug_to_canonical:
        return
    data = json.loads(GROUPS_PATH.read_text(encoding="utf-8"))
    for group in data.get("groups", []):
        canonical = {"slug": group["slug"], "name": group["name"]}
        _slug_to_canonical[group["slug"]] = canonical
        for exact in group.get("exactSlugs") or []:
            _slug_to_canonical[exact] = canonical
        for prefix in group.get("slugPrefixes") or []:
            _prefix_rules.append((prefix, canonical))
            _slug_to_canonical[prefix] = canonical
    _prefix_rules.sort(key=lambda item: len(item[0]), reverse=True)


def resolve_canonical_company_slug(slug: str) -> str:
    if not slug:
        return slug
    _load_groups()
    direct = _slug_to_canonical.get(slug)
    if direct:
        return direct["slug"]
    for prefix, canonical in _prefix_rules:
        if slug == prefix or slug.startswith(f"{prefix}-"):
            return canonical["slug"]
    return slug


def resolve_canonical_company(slug: str, name: str | None = None) -> dict[str, str]:
    _load_groups()
    canonical_slug = resolve_canonical_company_slug(slug)
    canonical = _slug_to_canonical.get(canonical_slug)
    return {
        "slug": canonical_slug,
        "name": (canonical or {}).get("name") or name or slug,
    }


def canonicalize_entity(entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if not entity or not entity.get("name"):
        return None
    slug = entity.get("slug") or ""
    canonical = resolve_canonical_company(slug, str(entity["name"]))
    merged = dict(entity)
    merged["slug"] = canonical["slug"]
    merged["name"] = canonical["name"]
    return merged
