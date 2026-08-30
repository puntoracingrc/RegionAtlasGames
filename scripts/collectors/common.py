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
    env_region = os.environ.get("PRICE_COLLECT_REGION", "").strip()
    if not region and env_region:
        region = env_region
    catalog = load_json(CATALOG_FILE, [])
    games = [
        g
        for g in catalog
        if g.get("platformSlug") == platform_slug and g.get("listingStatus") != "excluded"
    ]
    if region:
        games = [g for g in games if g.get("region") == region]
    selected_ids: set[str] = set()
    catalog_ids_raw = os.environ.get("PRICE_COLLECT_CATALOG_IDS", "").strip()
    if catalog_ids_raw:
        try:
            parsed = json.loads(catalog_ids_raw)
        except json.JSONDecodeError:
            parsed = [part.strip() for part in catalog_ids_raw.split(",")]
        if isinstance(parsed, list):
            selected_ids.update(str(value).strip() for value in parsed if str(value).strip())
    catalog_id = os.environ.get("PRICE_COLLECT_CATALOG_ID", "").strip()
    if catalog_id:
        selected_ids.add(catalog_id)
    if selected_ids:
        games = [g for g in games if str(g.get("id")) in selected_ids]
    return sorted(games, key=lambda g: g["title"].lower())


def _collector_window_state_path() -> Path:
    return INGEST_DIR / "collector-window-state.json"


def _rotating_window(
    items: list[dict[str, Any]],
    limit: int,
    rotation_key: str,
) -> list[dict[str, Any]]:
    if not items or limit <= 0:
        return []
    state_path = _collector_window_state_path()
    state = load_json(state_path, {})
    if not isinstance(state, dict):
        state = {}

    entry = state.get(rotation_key, {})
    if not isinstance(entry, dict):
        entry = {}
    try:
        offset = int(entry.get("offset") or 0)
    except (TypeError, ValueError):
        offset = 0
    offset = offset % len(items)

    rotated = items[offset:] + items[:offset]
    selected = rotated[:limit]
    next_offset = (offset + min(limit, len(items))) % len(items)
    state[rotation_key] = {
        "offset": next_offset,
        "updatedAt": now_iso(),
        "limit": limit,
        "poolSize": len(items),
    }
    save_json(state_path, state)
    return selected


def prioritize_catalog_games(
    games: list[dict[str, Any]],
    limit: int | None,
    rotation_key: str | None = None,
) -> list[dict[str, Any]]:
    """Para ingest diario: prioriza juegos sin precio ES verificado."""
    if not limit or limit <= 0:
        return games
    without_price = [g for g in games if not g.get("hasEsPrice")]
    with_price = [g for g in games if g.get("hasEsPrice")]
    if rotation_key:
        selected_without_price = _rotating_window(
            without_price,
            min(limit, len(without_price)),
            f"{rotation_key}:missing",
        )
        remaining = limit - len(selected_without_price)
        selected_with_price = _rotating_window(
            with_price,
            remaining,
            f"{rotation_key}:priced",
        )
        return selected_without_price + selected_with_price
    return (without_price + with_price)[:limit]


def es_market_games(platform_slug: str, region: str | None = None) -> list[dict[str, Any]]:
    """Alias retrocompatible: ahora incluye todas las regiones del catálogo."""
    return platform_catalog_games(platform_slug, region)


def normalize_query(text: str) -> str:
    import html
    import re
    import unicodedata

    t = str(text or "")
    for _ in range(5):
        decoded = html.unescape(t)
        if decoded == t:
            break
        t = decoded
    t = t.replace("’", "'").replace("`", "'").replace("´", "'")
    t = unicodedata.normalize("NFKD", t)
    t = t.encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^\w\s'-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def platform_search_keyword(platform_slug: str) -> str:
    slug = platform_slug.strip().lower()
    from collectors.platform_sources import search_keyword

    return search_keyword(slug)


def platform_search_aliases(platform_slug: str) -> list[str]:
    slug = platform_slug.strip().lower()
    from collectors.platform_sources import search_aliases

    return search_aliases(slug)


def build_search_query(game: dict[str, Any], platform: dict[str, Any] | None = None) -> str:
    """Título limpio del juego, sin añadir plataforma ni alias de consola."""
    return normalize_query(str(game.get("title") or "").strip())


def build_search_queries(
    game: dict[str, Any],
    platform: dict[str, Any] | None = None,
    *,
    include_title_only: bool = True,
) -> list[str]:
    title = str(game.get("title") or "").strip()

    queries: list[str] = []
    if include_title_only:
        queries.append(normalize_query(title))

    clean: list[str] = []
    seen: set[str] = set()
    for query in queries:
        key = query.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        clean.append(query)
    return clean


def build_ebay_search_query(game: dict[str, Any], platform: dict[str, Any] | None = None) -> str:
    """Título limpio del juego también para eBay; la plataforma se valida después."""
    return build_search_query(game, platform)


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
    shipping_eur: float | None = None,
    total_to_spain_eur: float | None = None,
    original_price: float | str | None = None,
    original_currency: str | None = None,
    origin_country: str | None = None,
    origin_label: str | None = None,
    destination_country: str | None = None,
    destination_postal_code: str | None = None,
    marketplace_id: str | None = None,
    import_costs_may_apply: bool | None = None,
    force_cover_vision: bool = False,
    keep_unverified: bool = False,
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

        if force_cover_vision or region_needs_cover_vision(
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
                    force_weak_evidence=force_cover_vision,
                )
            )
        else:
            verified = _verified
        if not verified and not keep_unverified:
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
    try:
        parsed_shipping = float(shipping_eur) if shipping_eur is not None else None
    except (TypeError, ValueError):
        parsed_shipping = None
    if parsed_shipping is not None and parsed_shipping >= 0:
        row["shippingEur"] = round(parsed_shipping, 2)
    try:
        parsed_total = float(total_to_spain_eur) if total_to_spain_eur is not None else None
    except (TypeError, ValueError):
        parsed_total = None
    if parsed_total is not None and parsed_total > 0:
        row["estimatedTotalToSpainEur"] = round(parsed_total, 2)
    if original_price is not None:
        try:
            row["originalPrice"] = round(float(original_price), 2)
        except (TypeError, ValueError):
            pass
    if original_currency:
        row["originalCurrency"] = str(original_currency).upper()
    if origin_country:
        row["originCountry"] = str(origin_country).upper()
    if origin_label:
        row["originLabel"] = str(origin_label)
    if destination_country:
        row["destinationCountry"] = str(destination_country).upper()
    if destination_postal_code:
        row["destinationPostalCode"] = str(destination_postal_code)
    if marketplace_id:
        row["marketplaceId"] = str(marketplace_id)
    if import_costs_may_apply is not None:
        row["importCostsMayApply"] = bool(import_costs_may_apply)
    return row


load_local_env()
