"""Utilidades compartidas para collectors de precios ES."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collectors.listing_images import attach_image_urls
from collectors.reference_match import listing_reference_valid_for_catalog
from collectors.region_inference import (
    infer_listing_region_and_evidence,
    title_conflicts_region,
)

from collectors.storage_paths import ingest_dir

ROOT = Path(__file__).resolve().parents[2]
CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
INGEST_DIR = ingest_dir()

# Solo para filtros opcionales (p. ej. plantillas PAL); el sync usa todas las regiones.
ES_MARKET_FOCUS = {"pal españa", "españa", "pal europa"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_platforms() -> dict[str, dict[str, Any]]:
    rows = load_json(PLATFORMS_FILE, [])
    return {p["slug"]: p for p in rows}


def platform_catalog_games(platform_slug: str, region: str | None = None) -> list[dict[str, Any]]:
    """Todos los juegos indexados de la plataforma (todas las regiones)."""
    catalog = load_json(CATALOG_FILE, [])
    games = [
        g
        for g in catalog
        if g.get("platformSlug") == platform_slug and g.get("listingStatus") != "excluded"
    ]
    if region:
        games = [g for g in games if g.get("region") == region]
    return sorted(games, key=lambda g: g["title"].lower())


def es_market_games(platform_slug: str, region: str | None = None) -> list[dict[str, Any]]:
    """Alias retrocompatible: ahora incluye todas las regiones del catálogo."""
    return platform_catalog_games(platform_slug, region)


def normalize_query(text: str) -> str:
    import re
    import unicodedata

    t = unicodedata.normalize("NFKD", text)
    t = t.encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^\w\s-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# Una palabra corta por plataforma en la query (slug del catálogo). Igual que Wallapop.
PLATFORM_SEARCH_KEYWORDS: dict[str, str] = {
    "megadrive": "megadrive",
    "mastersystem": "mastersystem",
    "gamegear": "gamegear",
    "megacd": "megacd",
    "sega32x": "32x",
    "saturn": "saturn",
    "dreamcast": "dreamcast",
    "neogeo": "neogeo",
    "neogeocd": "neogeocd",
    "neogeopocket": "ngpc",
    "gameboy": "gameboy",
    "gamecube": "gamecube",
    "nes": "nes",
    "snes": "snes",
    "n64": "n64",
    "wii": "wii",
    "ds": "ds",
    "3ds": "3ds",
    "ps1": "ps1",
    "ps2": "ps2",
    "ps3": "ps3",
    "ps4": "ps4",
}


def platform_search_keyword(platform_slug: str) -> str:
    slug = platform_slug.strip().lower()
    return PLATFORM_SEARCH_KEYWORDS.get(slug, slug)


def build_search_query(game: dict[str, Any], platform: dict[str, Any] | None = None) -> str:
    """Título + plataforma. Ej.: «Batman Arkham Knight ps4», «Sonic megadrive»."""
    parts = [str(game.get("title") or "").strip()]
    platform_slug = str(game.get("platformSlug") or "").strip()
    if not platform_slug and platform:
        platform_slug = str(platform.get("slug") or "").strip()
    platform_kw = platform_search_keyword(platform_slug)
    if platform_kw:
        parts.append(platform_kw)
    return normalize_query(" ".join(p for p in parts if p))


def to_ingest_listing(
    *,
    catalog_id: str,
    source: str,
    listing_type: str,
    price_eur: float,
    title: str,
    catalog_region: str,
    external_id: str | None = None,
    ref_to_ids: dict[str, list[str]] | None = None,
    platform_slug: str | None = None,
    product_url: str | None = None,
    image_url: str | None = None,
) -> dict[str, Any] | None:
    if price_eur <= 0:
        return None
    if title_conflicts_region(title, catalog_region):
        return None

    ok_ref, matched_ref = listing_reference_valid_for_catalog(
        title,
        catalog_id,
        catalog_region,
        ref_to_ids=ref_to_ids,
    )
    if not ok_ref:
        return None

    listing_region, evidence, ai_conf, verified = infer_listing_region_and_evidence(
        title,
        catalog_region,
        matched_reference=matched_ref,
    )

    if platform_slug:
        from region_evidence_rules import check_listing_evidence_meets_rules

        ok, _ = check_listing_evidence_meets_rules(platform_slug, catalog_region, evidence, ai_conf)
        if not ok:
            return None

    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": source,
        "listingType": listing_type,
        "priceEur": round(price_eur, 2),
        "listingRegion": listing_region,
        "regionVerified": verified,
        "regionEvidence": evidence,
        "aiConfidence": ai_conf,
    }
    if external_id:
        row["externalId"] = external_id
    if matched_ref:
        row["matchedReference"] = matched_ref
    row["title"] = title
    if product_url:
        row["productUrl"] = product_url
    product_payload: dict[str, Any] = {"productUrl": product_url, "url": product_url}
    if image_url:
        product_payload["imageUrl"] = image_url
    attach_image_urls(row, product_payload, source)
    return row
