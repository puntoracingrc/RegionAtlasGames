"""Matching por código de referencia de producto (T-…, SLPS-, HDR-, …)."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"

REFERENCE_EXTRACTORS: list[re.Pattern[str]] = [
    re.compile(r"\b(CUSA-\d{5,6})\b", re.I),
    re.compile(r"\b(BLUS-\d{5,6})\b", re.I),
    re.compile(r"\b(BLES-\d{5,6})\b", re.I),
    re.compile(r"\b(BLJM-\d{5,6})\b", re.I),
    re.compile(r"\b(T-\d{1,6}[A-Z0-9]*(?:-\d{2})?)\b", re.I),
    re.compile(r"\b(HDR-\d{4,6})\b", re.I),
    re.compile(r"\b(GS-\d{4,5})\b", re.I),
    re.compile(r"\b(SLPS-\d{3,5})\b", re.I),
    re.compile(r"\b(SLES-\d{3,5})\b", re.I),
    re.compile(r"\b(SLED-\d{3,5})\b", re.I),
    re.compile(r"\b(SLUS-\d{3,5})\b", re.I),
    re.compile(r"\b(SCPS-\d{3,5})\b", re.I),
    re.compile(r"\b(SHVC-[A-Z0-9-]+)\b", re.I),
    re.compile(r"\b(SNSP-[A-Z0-9-]+)\b", re.I),
    re.compile(r"\b(SNS[A-Z]?-[A-Z0-9-]+)\b", re.I),
    re.compile(r"\b(MK-\d+-\d+)\b", re.I),
    re.compile(r"\b(NEO-[A-Z0-9-]+)\b", re.I),
    re.compile(r"\b(NUS-[A-Z0-9-]+)\b", re.I),
]


def normalize_reference(ref: str) -> str:
    return re.sub(r"\s+", "", ref.strip().upper())


def extract_references_from_text(text: str) -> set[str]:
    if not text:
        return set()
    found: set[str] = set()
    for pattern in REFERENCE_EXTRACTORS:
        for match in pattern.findall(text):
            norm = normalize_reference(str(match))
            if len(norm) >= 3:
                found.add(norm)
    return found


def reference_implies_region(ref: str) -> str | None:
    r = normalize_reference(ref)
    if r.startswith("HDR-") or r.startswith("GS-") or re.match(r"^T-\d+[GM]$", r):
        return "Japón"
    if re.match(r"^T-\d+N$", r) or r.startswith("SLUS-"):
        return "USA"
    if re.match(r"^T-\d+D-", r) or r.startswith("SLES-") or r.startswith("SLED-") or r.startswith("SNSP-"):
        return "PAL Europa"
    if r.startswith("SLPS-") or r.startswith("SCPS-") or r.startswith("SHVC-"):
        return "Japón"
    if re.match(r"^MK-\d+-\d+$", r):
        return "PAL Europa"
    return None


@lru_cache(maxsize=1)
def _load_details_map() -> dict[str, dict[str, Any]]:
    if not DETAILS_FILE.exists():
        return {}
    return json.loads(DETAILS_FILE.read_text(encoding="utf-8"))


def catalog_reference(catalog_id: str) -> str | None:
    details = _load_details_map().get(catalog_id) or {}
    ref = str(details.get("reference") or "").strip()
    return ref or None


def build_platform_reference_index(platform_slug: str) -> tuple[dict[str, str], dict[str, list[str]]]:
    """catalog_id → ref normalizada; ref → [catalog_id, …] en la plataforma."""
    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    details = _load_details_map()
    id_to_ref: dict[str, str] = {}
    ref_to_ids: dict[str, list[str]] = {}

    for game in catalog:
        if game.get("platformSlug") != platform_slug:
            continue
        if game.get("listingStatus") == "excluded":
            continue
        gid = str(game["id"])
        ref = str((details.get(gid) or {}).get("reference") or "").strip()
        if not ref:
            continue
        norm = normalize_reference(ref)
        id_to_ref[gid] = norm
        ref_to_ids.setdefault(norm, []).append(gid)

    return id_to_ref, ref_to_ids


def listing_reference_valid_for_catalog(
    listing_text: str,
    catalog_id: str,
    catalog_region: str,
    *,
    id_to_ref: dict[str, str] | None = None,
    ref_to_ids: dict[str, list[str]] | None = None,
) -> tuple[bool, str | None]:
    """
    Valida si los códigos en el anuncio encajan con la edición del catálogo.
    Devuelve (ok, matched_ref_normalizada).
    """
    catalog_ref_raw = catalog_reference(catalog_id)
    if not catalog_ref_raw:
        return True, None

    catalog_ref = normalize_reference(catalog_ref_raw)
    listing_refs = extract_references_from_text(listing_text)
    if not listing_refs:
        return True, None

    if catalog_ref in listing_refs:
        return True, catalog_ref

    if ref_to_ids is None:
        return True, None

    for listing_ref in listing_refs:
        owners = ref_to_ids.get(listing_ref)
        if owners is None:
            continue
        if catalog_id in owners:
            return True, listing_ref
        return False, listing_ref

    return True, None


def product_search_text(product: dict[str, Any]) -> str:
    chunks = [
        str(product.get("name") or ""),
        str(product.get("sku") or ""),
        str(product.get("short_description") or ""),
        re.sub(r"<[^>]+>", " ", str(product.get("description") or "")),
    ]
    return " ".join(chunks)
