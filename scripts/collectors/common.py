"""Utilidades compartidas para collectors de precios ES."""

from __future__ import annotations

import json
import os
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

_LOCAL_ENV_LOADED = False


def load_local_env() -> None:
    """Carga .env.local en os.environ (sin sobrescribir variables ya exportadas)."""
    global _LOCAL_ENV_LOADED
    if _LOCAL_ENV_LOADED:
        return
    _LOCAL_ENV_LOADED = True
    path = ROOT / ".env.local"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ[key] = value


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


def platform_search_keyword(platform_slug: str) -> str:
    slug = platform_slug.strip().lower()
    from collectors.platform_sources import search_keyword

    return search_keyword(slug)


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


def build_ebay_search_query(game: dict[str, Any], platform: dict[str, Any] | None = None) -> str:
    """Título + keyword eBay (ebaySearchKeyword si existe en platform-sources.json)."""
    from collectors.platform_sources import ebay_search_keyword

    parts = [str(game.get("title") or "").strip()]
    platform_slug = str(game.get("platformSlug") or "").strip()
    if not platform_slug and platform:
        platform_slug = str(platform.get("slug") or "").strip()
    platform_kw = ebay_search_keyword(platform_slug)
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
    game_title: str | None = None,
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

    listing_region, evidence, ai_conf, _verified = infer_listing_region_and_evidence(
        title,
        catalog_region,
        matched_reference=matched_ref,
    )

    product_payload: dict[str, Any] = {"productUrl": product_url, "url": product_url}
    if image_url:
        product_payload["imageUrl"] = image_url
    image_scratch: dict[str, Any] = {}
    attach_image_urls(image_scratch, product_payload, source)

    verified = _verified
    vision_condition: str | None = None
    if platform_slug:
        from collectors.listing_region_enrich import (
            enrich_listing_region_from_cover,
            region_needs_cover_vision,
        )

        if region_needs_cover_vision(
            platform_slug=platform_slug,
            catalog_region=catalog_region,
            listing_region=listing_region,
            evidence=evidence,
            ai_conf=float(ai_conf or 0),
            ok_ref=True,
        ):
            listing_region, evidence, ai_conf, verified, vision_condition, _ = (
                enrich_listing_region_from_cover(
                    platform_slug=platform_slug,
                    catalog_region=catalog_region,
                    game_title=game_title or title,
                    listing_title=title,
                    listing_region=listing_region,
                    evidence=evidence,
                    ai_conf=float(ai_conf or 0),
                    ok_ref=True,
                    source=source,
                    product=product_payload,
                    row=image_scratch,
                    external_id=external_id,
                )
            )
        else:
            verified = _verified
        if not verified:
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
    if vision_condition:
        row["condition"] = vision_condition
    if image_scratch.get("imageUrls"):
        row["imageUrls"] = image_scratch["imageUrls"]
        row["imageUrl"] = image_scratch.get("imageUrl")
    elif image_url:
        row["imageUrl"] = image_url
    return row


load_local_env()
