"""Contrato del catalogo canonico usado por los workers de precios."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class CatalogSourceError(ValueError):
    """El archivo indicado no cumple el contrato del catalogo de Region Atlas."""


def load_catalog(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CatalogSourceError(f"No existe el catalogo canonico: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogSourceError(f"No se puede leer el catalogo canonico {path}: {exc}") from exc
    if not isinstance(value, list):
        raise CatalogSourceError(f"El catalogo canonico debe ser una lista JSON: {path}")
    return [item for item in value if isinstance(item, dict)]


def listed_platform_games(
    catalog: list[dict[str, Any]],
    platform_slug: str,
    *,
    region: str | None = None,
) -> list[dict[str, Any]]:
    slug = platform_slug.strip().lower()
    rows = [
        item
        for item in catalog
        if str(item.get("platformSlug") or "").strip().lower() == slug
        and str(item.get("listingStatus") or "listed") != "excluded"
        and str(item.get("id") or "").strip()
        and str(item.get("title") or "").strip()
    ]
    if region:
        rows = [item for item in rows if str(item.get("region") or "") == region]
    return rows


def require_platform_catalog(
    catalog: list[dict[str, Any]],
    platform_slug: str,
    *,
    source: Path | None = None,
    region: str | None = None,
) -> list[dict[str, Any]]:
    rows = listed_platform_games(catalog, platform_slug, region=region)
    if rows:
        return rows
    location = str(source) if source else "data/catalog.json"
    scope = f" para la region {region}" if region else ""
    raise CatalogSourceError(
        f"El catalogo canonico {location} no contiene fichas validas de "
        f"platformSlug={platform_slug}{scope}. data/games.json es un archivo legado y no "
        "puede usarse para decidir si una plataforma esta disponible."
    )


def platform_inventory(
    catalog: list[dict[str, Any]],
    platform_slug: str,
    *,
    region: str | None = None,
) -> dict[str, Any]:
    slug = platform_slug.strip().lower()
    raw = [
        item
        for item in catalog
        if str(item.get("platformSlug") or "").strip().lower() == slug
    ]
    listed = listed_platform_games(catalog, slug)
    regional = listed_platform_games(catalog, slug, region=region) if region else listed
    return {
        "platformSlug": slug,
        "rawEntries": len(raw),
        "validListedEntries": len(listed),
        "uniqueListedIds": len({str(item["id"]) for item in listed}),
        "region": region,
        "validRegionEntries": len(regional),
    }
