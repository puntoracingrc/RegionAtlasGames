#!/usr/bin/env python3
"""Importa un lote GAME ya aprobado al catálogo sin importar sus precios.

El flujo normal de GAME sigue siendo candidato -> borrador -> revisión. Este
script existe para aperturas controladas de plataforma y exige una aprobación
explícita antes de escribir datos.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.covers_storage import public_cover_url, save_cover_jpeg  # noqa: E402
from collectors.game_details_lib import is_valid_detail  # noqa: E402
from company_entity import resolve_canonical_company  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
COLLECTION_FILE = ROOT / "data" / "collection.json"
META_FILE = ROOT / "data" / "meta.json"
COMPANIES_INDEX_FILE = ROOT / "data" / "index" / "companies.json"
GENRES_INDEX_FILE = ROOT / "data" / "index" / "genres.json"

GAME_PRODUCT_HOSTS = {"game.es", "www.game.es"}
GAME_IMAGE_HOSTS = {"media.game.es"}
SUPPORTED_PLATFORMS = {"ps4", "ps5", "switch2"}
SUPPORTED_PEGI = {3, 7, 12, 16, 18}
PUBLISHER_BLACKLIST = {"", "0", "contact sales", "tsr 0235"}

GAME_GENRE_MAP: dict[str, tuple[tuple[str, str], ...]] = {
    "ACCION": (("Acción", "action"),),
    "AVENTURA": (("Aventura", "adventure"),),
    "ROL": (("RPG", "rpg"),),
    "SIMULADOR": (("Simulación", "simulation"),),
    "CONDUCCION": (("Carreras", "racing"),),
    "SURVIVA-HORROR": (("Terror", "horror"),),
    "ARCADE": (("Arcade", "arcade"),),
    "LUCHA": (("Lucha", "fighting"),),
    "ESTRATEGIA": (("Estrategia", "strategy"),),
    "SHOOTER": (("Shooter", "shooter"),),
    "DEPORTES": (("Deportes", "sports"),),
    "AVENTURA-GRAFICA": (("Aventura", "adventure"),),
    "MUSICA": (("Música", "music"),),
    "PLATAFORMAS": (("Plataformas", "platformer"),),
    "ACCION-ESTRATEGIA": (("Acción", "action"), ("Estrategia", "strategy")),
    "PLATAFORMA-AVENTURA": (("Plataformas", "platformer"), ("Aventura", "adventure")),
    "INFANTIL": (("Niños", "ninos"),),
    "PUZZLE": (("Puzzle", "puzzle"),),
    "SANDBOX": (("Aventura", "adventure"),),
    "HABILIDAD": (("Habilidad", "habilidad"),),
    "MINI-JUEGOS": (("Party", "party"),),
    "UTILIDAD": (("Varios", "other"),),
}

GAME_PUBLISHER_ALIASES: dict[str, tuple[str, str]] = {
    "bnee": ("Bandai Namco Entertainment", "bandai-namco-entertainment"),
    "bolt-production": ("Bolt Production", "bolt-production"),
    "cd-projekt": ("CD Projekt RED", "cd-projekt-red"),
    "coffe-stain": ("Coffee Stain Publishing", "coffee-stain-publishing"),
    "creative": ("Creative", "creative"),
    "curveball": ("Curveball", "curveball"),
    "elec-arts": ("Electronic Arts", "electronic-arts"),
    "far-out": ("Far Out", "far-out"),
    "flashpoint": ("Flashpoint", "flashpoint"),
    "focus-home-int": ("Focus Home Interactive", "focus-home-interactive"),
    "funboxmedia": ("Funbox Media", "funbox-media"),
    "giants": ("GIANTS Software", "giants-software"),
    "meridiem": ("Meridiem Games", "meridiem-games"),
    "nejcraft": ("NEJCRAFT", "nejcraft"),
    "nighthawk": ("Nighthawk Interactive", "nighthawk-interactive"),
    "numskull": ("Numskull Games Ltd.", "numskull-games"),
    "outright": ("Outright Games LTD", "outright-games"),
    "paradox": ("Paradox Interactive", "paradox-interactive"),
    "pix-n-love-games": ("Pix 'n Love Games", "pix-39-n-love-games"),
    "red-art": ("Red Art Games", "red-art-games"),
    "selecta": ("Selecta Play", "selecta-play"),
    "silver-lining": ("Silver Lining", "silver-lining"),
    "straight4-studios": ("Straight4 Studios", "straight4-studios"),
    "strictly": ("Strictly Limited Games", "strictly-limited-games"),
    "sunblink": ("Sunblink", "sunblink"),
    "tripwire": ("Tripwire Interactive", "tripwire-interactive"),
    "vea-games": ("VEA Games", "vea-games"),
}


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(value, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "juego"


def normalized_title(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"\b(ps4|playstation 4|ps5|playstation 5|switch 2|nintendo switch 2)\b", " ", text)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def trusted_https_url(value: object, hosts: set[str]) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in hosts:
        return None
    return raw


def parse_iso_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value or ""))
    except ValueError:
        return None


def validate_payload(payload: dict[str, Any]) -> tuple[str, date, list[dict[str, Any]]]:
    if (
        payload.get("source") != "game-es-release-discovery"
        or payload.get("mode") != "released_catalog_candidates"
        or payload.get("containsPrices") is not False
    ):
        raise ValueError("El resultado no pertenece al descubridor seguro de catálogo GAME.")
    platform_slug = str(payload.get("platformSlug") or "").strip()
    if platform_slug not in SUPPORTED_PLATFORMS:
        raise ValueError("La plataforma GAME no está soportada para altas de catálogo.")
    if payload.get("region") != "PAL España":
        raise ValueError("El lote GAME no pertenece a la región PAL España.")
    as_of = parse_iso_date(payload.get("asOf"))
    if as_of is None:
        raise ValueError("El lote GAME no tiene una fecha de corte válida.")

    valid: list[dict[str, Any]] = []
    seen_skus: set[str] = set()
    seen_ids: set[str] = set()
    for raw in payload.get("candidates") or []:
        if not isinstance(raw, dict) or raw.get("catalogStatus") != "new":
            continue
        if any("price" in str(key).lower() for key in raw):
            raise ValueError("El lote GAME contiene campos de precio y no puede importarse.")
        title = str(raw.get("title") or "").strip()
        sku = str(raw.get("sourceSku") or "").strip()
        release_date = parse_iso_date(raw.get("releaseDate"))
        product_url = trusted_https_url(raw.get("productUrl"), GAME_PRODUCT_HOSTS)
        image_url = trusted_https_url(raw.get("imageUrl"), GAME_IMAGE_HOSTS)
        preowned_sku = str(raw.get("preownedSourceSku") or "").strip()
        preowned_url = trusted_https_url(raw.get("preownedProductUrl"), GAME_PRODUCT_HOSTS)
        if bool(preowned_sku) != bool(preowned_url):
            continue
        if (
            not title
            or not sku
            or raw.get("platformSlug") != platform_slug
            or raw.get("region") != "PAL España"
            or raw.get("availability") != "available"
            or release_date is None
            or release_date > as_of
            or not product_url
            or not image_url
        ):
            continue
        catalog_id = f"{platform_slug}-{slugify(title)}"
        cover_slug = f"{slugify(title)}-{sku}" if platform_slug == "ps4" else slugify(title)
        if sku in seen_skus or catalog_id in seen_ids:
            continue
        seen_skus.add(sku)
        seen_ids.add(catalog_id)
        valid.append(
            {
                **raw,
                "title": title,
                "sourceSku": sku,
                "productUrl": product_url,
                "imageUrl": image_url,
                "availabilityModes": [
                    mode
                    for mode in ("new", "preowned")
                    if mode in (
                        set(raw.get("availabilityModes") or ["new"])
                        | ({"preowned"} if preowned_sku else set())
                    )
                ],
                "preownedSourceSku": preowned_sku or None,
                "preownedProductUrl": preowned_url,
                "releaseDate": release_date.isoformat(),
                "year": release_date.year,
                "catalogId": catalog_id,
                "slug": slugify(title),
                "coverSlug": cover_slug,
            }
        )
    return platform_slug, as_of, valid


def genre_entities(raw_genres: list[object]) -> list[dict[str, Any]]:
    mapped: list[tuple[str, str]] = []
    for raw in raw_genres:
        key = str(raw or "").strip().upper()
        mapped.extend(GAME_GENRE_MAP.get(key, ()))
    entities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for name, canonical_slug in mapped:
        if canonical_slug in seen:
            continue
        seen.add(canonical_slug)
        entities.append(
            {
                "name": name,
                "slug": canonical_slug,
                "museumPath": None,
                "pcPath": None,
                "source": "game-es",
            }
        )
    return entities


def publisher_entity(raw_name: object) -> dict[str, Any] | None:
    name = str(raw_name or "").strip()
    if name.lower() in PUBLISHER_BLACKLIST:
        return None
    alias = GAME_PUBLISHER_ALIASES.get(slugify(name))
    canonical = {"name": alias[0], "slug": alias[1]} if alias else resolve_canonical_company(slugify(name), name)
    return {
        "name": canonical["name"],
        "slug": canonical["slug"],
        "museumPath": None,
        "pcPath": None,
        "source": "game-es",
    }


def catalog_entry(candidate: dict[str, Any], collected_at: str) -> dict[str, Any]:
    catalog_id = candidate["catalogId"]
    platform_slug = candidate["platformSlug"]
    return {
        "id": catalog_id,
        "slug": candidate["slug"],
        "title": candidate["title"],
        "titlePc": candidate["title"],
        "platformSlug": platform_slug,
        "region": "PAL España",
        "physicalVariant": None,
        "edition": "standard",
        "listingStatus": "listed",
        "coverUrl": public_cover_url(platform_slug, f"{candidate['coverSlug']}.jpg"),
        "pcPath": None,
        "pcId": None,
        "pcRegion": None,
        "pcCondition": None,
        "matchConfidence": "GAME_ES_RELEASE",
        "marketMin": None,
        "marketMax": None,
        "recommendedPrice": None,
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": None,
        "updatedAt": collected_at[:10] or None,
        "hasEsPrice": False,
        "priceRegionVerified": False,
        "seedSource": "game-es-release-discovery",
        "regionEvidence": ["game_es_retail_catalog"],
        "regionVerified": False,
        "gameEsSku": candidate["sourceSku"],
        "gameEsProductUrl": candidate["productUrl"],
        "gameEsImageUrl": candidate["imageUrl"],
        "gameEsPreownedSku": candidate.get("preownedSourceSku"),
        "gameEsPreownedProductUrl": candidate.get("preownedProductUrl"),
    }


def details_entry(candidate: dict[str, Any], collected_at: str) -> dict[str, Any]:
    publisher = publisher_entity(candidate.get("publisher"))
    genres = genre_entities(candidate.get("genres") or [])
    pegi_raw = candidate.get("pegi")
    pegi = int(pegi_raw) if str(pegi_raw or "").isdigit() else None
    if pegi not in SUPPORTED_PEGI:
        pegi = None
    field_sources: dict[str, str] = {
        "year": "game-es",
        "releaseDate": "game-es",
        "support": "game-es",
    }
    if publisher:
        field_sources["publisher"] = "game-es"
    if genres:
        field_sources["genres"] = "game-es"
    return {
        "year": candidate["year"],
        "releaseDate": candidate["releaseDate"],
        "reference": None,
        "players": None,
        "support": "Cartucho" if candidate["platformSlug"] == "switch2" else "Disco Blu-ray",
        "developer": None,
        "publisher": publisher,
        "genres": genres,
        "subgenres": [],
        "facets": [],
        "tags": [],
        "series": None,
        "museumPath": None,
        "pcProductId": None,
        "ean": None,
        "sources": {
            "gameEs": {
                "sku": candidate["sourceSku"],
                "productUrl": candidate["productUrl"],
                "imageUrl": candidate["imageUrl"],
                "fetchedAt": collected_at,
                **(
                    {
                        "preowned": {
                            "sku": candidate["preownedSourceSku"],
                            "productUrl": candidate["preownedProductUrl"],
                            "fetchedAt": collected_at,
                        }
                    }
                    if candidate.get("preownedSourceSku") and candidate.get("preownedProductUrl")
                    else {}
                ),
            }
        },
        "fieldSources": field_sources,
        "fetchedAt": collected_at,
        "mergedAt": collected_at,
        "description": None,
        "seoMeta": None,
        "videos": [],
        "pegi": pegi,
    }


def merge_details_entry(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    """Añade evidencia GAME sin reemplazar una ficha enriquecida o revisada."""
    if not existing:
        return incoming, True

    merged = copy.deepcopy(existing)
    changed = False
    incoming_field_sources = incoming.get("fieldSources") or {}
    merged_field_sources = merged.setdefault("fieldSources", {})

    for key in ("year", "releaseDate", "support", "publisher", "pegi"):
        if merged.get(key) is None and incoming.get(key) is not None:
            merged[key] = copy.deepcopy(incoming[key])
            if key in incoming_field_sources:
                merged_field_sources[key] = incoming_field_sources[key]
            changed = True

    if not merged.get("genres") and incoming.get("genres"):
        merged["genres"] = copy.deepcopy(incoming["genres"])
        merged_field_sources["genres"] = "game-es"
        changed = True

    merged_sources = merged.setdefault("sources", {})
    incoming_game_es = (incoming.get("sources") or {}).get("gameEs")
    if incoming_game_es and merged_sources.get("gameEs") != incoming_game_es:
        merged_sources["gameEs"] = copy.deepcopy(incoming_game_es)
        changed = True

    if changed:
        merged["mergedAt"] = incoming["mergedAt"]
    return merged, changed


def download_cover(candidate: dict[str, Any], covers_dir: Path) -> tuple[str, str | None]:
    catalog_id = candidate["catalogId"]
    destination = covers_dir / candidate["platformSlug"] / f"{candidate['coverSlug']}.jpg"
    if destination.is_file() and destination.stat().st_size > 500:
        return catalog_id, None
    try:
        request = urllib.request.Request(
            candidate["imageUrl"],
            headers={"User-Agent": "RegionAtlasGames/1.0 (+catalog-cover-import)"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(6_000_001)
        if len(raw) > 6_000_000 or not save_cover_jpeg(raw, destination):
            return catalog_id, "invalid_image"
        return catalog_id, None
    except Exception as exc:  # network/source failure is reported, never hidden
        return catalog_id, type(exc).__name__


def download_covers(
    candidates: list[dict[str, Any]],
    covers_dir: Path,
    *,
    workers: int,
) -> tuple[set[str], dict[str, str]]:
    completed: set[str] = set()
    failures: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max(1, min(16, workers))) as pool:
        futures = {pool.submit(download_cover, candidate, covers_dir): candidate for candidate in candidates}
        for future in as_completed(futures):
            catalog_id, error = future.result()
            if error:
                failures[catalog_id] = error
            else:
                completed.add(catalog_id)
    return completed, failures


def update_platform(platforms: list[dict[str, Any]], platform_slug: str, listed: int) -> None:
    for platform in platforms:
        if platform.get("slug") != platform_slug:
            continue
        platform["estimatedCatalogSize"] = max(listed, int(platform.get("estimatedCatalogSize") or 0))
        if platform_slug != "ps4":
            platform["status"] = "open"
            platform["active"] = True
            platform["newsEnabled"] = True
            label = "PlayStation 5" if platform_slug == "ps5" else "Nintendo Switch 2"
            platform["description"] = (
                f"Catálogo abierto de {label}, iniciado con lanzamientos físicos disponibles en GAME España "
                "y ampliado mediante revisión administrativa."
            )
        return
    raise ValueError(f"No existe la plataforma {platform_slug} en data/platforms.json.")


def link_exact_collection_rows(
    collection: list[dict[str, Any]],
    imported_games: list[dict[str, Any]],
    platform_slug: str,
) -> int:
    title_index: dict[str, set[str]] = {}
    for game in imported_games:
        if game.get("platformSlug") != platform_slug or not game.get("gameEsSku"):
            continue
        title_index.setdefault(normalized_title(game.get("title")), set()).add(str(game["id"]))
    linked = 0
    for item in collection:
        if item.get("platformSlug") != platform_slug or item.get("catalogId"):
            continue
        key = normalized_title(item.get("title"))
        matches = title_index.get(key, set()) if key else set()
        if len(matches) != 1:
            continue
        item["catalogId"] = next(iter(matches))
        item["inRetroCatalog"] = True
        linked += 1
    return linked


def update_entity_indexes(
    companies: dict[str, Any],
    genres: dict[str, Any],
    catalog: list[dict[str, Any]],
    details: dict[str, Any],
    imported_ids: set[str],
) -> dict[str, int]:
    """Añade las fichas GAME a los índices sin reordenar datos históricos."""
    by_id = {str(game.get("id")): game for game in catalog if game.get("id")}

    def add_entity(
        bucket: dict[str, Any],
        entity: dict[str, Any] | None,
        game_id: str,
        platform_slug: str,
        role: str | None = None,
    ) -> None:
        if not entity or not entity.get("name") or not entity.get("slug"):
            return
        slug = str(entity["slug"])
        entry = bucket.setdefault(
            slug,
            {
                "name": str(entity["name"]),
                "slug": slug,
                "museumPath": entity.get("museumPath") or entity.get("pcPath") or "",
                "gameIds": [],
                "byPlatform": {},
                **({"asDeveloper": [], "asPublisher": []} if role else {}),
                "gameCount": 0,
            },
        )
        game_ids = entry.setdefault("gameIds", [])
        if game_id not in game_ids:
            game_ids.append(game_id)
            by_platform = entry.setdefault("byPlatform", {})
            by_platform[platform_slug] = int(by_platform.get(platform_slug) or 0) + 1
        if role:
            role_key = "asDeveloper" if role == "developer" else "asPublisher"
            role_ids = entry.setdefault(role_key, [])
            if game_id not in role_ids:
                role_ids.append(game_id)
            entry.setdefault("asDeveloper", [])
            entry.setdefault("asPublisher", [])
        entry["gameCount"] = len(game_ids)

    indexed = 0
    for game_id in sorted(imported_ids):
        game = by_id.get(game_id)
        detail = details.get(game_id)
        if not game or game.get("listingStatus") == "excluded" or not is_valid_detail(detail):
            continue
        platform_slug = str(game.get("platformSlug") or "")
        add_entity(companies, detail.get("developer"), game_id, platform_slug, "developer")
        add_entity(companies, detail.get("publisher"), game_id, platform_slug, "publisher")
        for genre in detail.get("genres") or []:
            add_entity(genres, genre, game_id, platform_slug)
        indexed += 1
    return {
        "indexedGames": indexed,
        "companies": len(companies),
        "genres": len(genres),
    }


def update_meta(
    meta: dict[str, Any],
    catalog: list[dict[str, Any]],
    details: dict[str, Any],
    companies_index: dict[str, Any],
    genres_index: dict[str, Any],
    platforms: list[dict[str, Any]],
    collection: list[dict[str, Any]],
    imported_at: str,
) -> None:
    listed = [game for game in catalog if game.get("listingStatus") != "excluded"]
    listed_by_platform: dict[str, int] = {}
    for game in listed:
        slug = str(game.get("platformSlug") or "")
        listed_by_platform[slug] = listed_by_platform.get(slug, 0) + 1
    meta["catalogListed"] = len(listed)
    meta["catalogExcluded"] = len(catalog) - len(listed)
    meta["catalogTotal"] = len(catalog)
    meta["catalogEstimatedTotal"] = sum(int(platform.get("estimatedCatalogSize") or 0) for platform in platforms)
    meta["listedByPlatform"] = dict(sorted(listed_by_platform.items()))
    meta["coversListed"] = sum(bool(game.get("coverUrl")) for game in listed)
    meta["coversLocal"] = sum(str(game.get("coverUrl") or "").startswith("/covers/") for game in listed)
    meta["coversListedPct"] = round(100 * meta["coversListed"] / len(listed), 1) if listed else 0
    meta["gamesWithDetails"] = sum(
        str(game.get("id") or "") in details
        and is_valid_detail(details[str(game.get("id") or "")])
        for game in listed
    )
    meta["indexCompanies"] = len(companies_index)
    meta["indexGenres"] = len(genres_index)
    meta["lastGameEsCatalogImportAt"] = imported_at

    with_price = [item for item in collection if item.get("hasEsPrice")]
    linked = [item for item in collection if item.get("inRetroCatalog")]
    total_recommended = round(sum(float(item.get("totalValue") or 0) for item in with_price), 2)
    if float(total_recommended).is_integer():
        total_recommended = int(total_recommended)
    meta["collection"] = {
        "totalItems": len(collection),
        "retroItems": len(linked),
        "outOfScopeItems": len(collection) - len(linked),
        "totalUnits": sum(int(item.get("quantity") or 0) for item in collection),
        "withEsPrice": len(with_price),
        "pendingEsPrice": len(collection) - len(with_price),
        "totalRecommendedValue": total_recommended,
        "totalBuyValue": round(
            sum(float(item.get("buyPrice") or 0) * int(item.get("quantity") or 0) for item in collection),
            2,
        ),
    }


def apply_import(
    *,
    payload: dict[str, Any],
    catalog: list[dict[str, Any]],
    details: dict[str, Any],
    platforms: list[dict[str, Any]],
    collection: list[dict[str, Any]],
    companies_index: dict[str, Any] | None = None,
    genres_index: dict[str, Any] | None = None,
    available_cover_ids: set[str] | None = None,
    require_covers: bool = False,
) -> dict[str, Any]:
    platform_slug, as_of, candidates = validate_payload(payload)
    collected_at = str(payload.get("collectedAt") or f"{as_of.isoformat()}T00:00:00Z")
    by_id = {str(game.get("id")): game for game in catalog if game.get("id")}
    by_sku: dict[str, dict[str, Any]] = {}
    for game in catalog:
        for field in ("gameEsSku", "gameEsPreownedSku"):
            sku = str(game.get(field) or "").strip()
            if sku:
                by_sku[sku] = game
    added = 0
    updated = 0
    unchanged = 0
    skipped_missing_cover = 0
    collisions: list[str] = []
    imported_ids: set[str] = set()

    for candidate in candidates:
        catalog_id = candidate["catalogId"]
        if require_covers and available_cover_ids is not None and catalog_id not in available_cover_ids:
            skipped_missing_cover += 1
            continue
        entry = catalog_entry(candidate, collected_at)
        source_match = by_sku.get(candidate["sourceSku"])
        if source_match is None and candidate.get("preownedSourceSku"):
            source_match = by_sku.get(candidate["preownedSourceSku"])
        id_match = by_id.get(catalog_id)
        if source_match is not None and id_match is not None and source_match is not id_match:
            collisions.append(catalog_id)
            continue
        existing = source_match or id_match
        if existing:
            if existing.get("platformSlug") != platform_slug:
                collisions.append(catalog_id)
                continue
            if source_match is None and normalized_title(existing.get("title")) != normalized_title(candidate["title"]):
                collisions.append(catalog_id)
                continue
            before = copy.deepcopy(existing)
            for key in (
                "gameEsSku",
                "gameEsProductUrl",
                "gameEsImageUrl",
                "gameEsPreownedSku",
                "gameEsPreownedProductUrl",
            ):
                existing[key] = entry[key]
            existing["regionEvidence"] = sorted(
                set(existing.get("regionEvidence") or []) | set(entry["regionEvidence"])
            )
            if not existing.get("coverUrl") or str(existing.get("coverUrl")).startswith("https://media.game.es/"):
                existing["coverUrl"] = entry["coverUrl"]
            target = existing
        else:
            catalog.append(entry)
            by_id[catalog_id] = entry
            added += 1
            target = entry
            before = None
        by_sku[candidate["sourceSku"]] = target
        if candidate.get("preownedSourceSku"):
            by_sku[candidate["preownedSourceSku"]] = target
        detail_id = str(target["id"])
        imported_ids.add(detail_id)
        merged_details, details_changed = merge_details_entry(
            details.get(detail_id),
            details_entry(candidate, collected_at),
        )
        details[detail_id] = merged_details
        if existing:
            if existing != before or details_changed:
                updated += 1
            else:
                unchanged += 1

    listed_platform = sum(
        game.get("platformSlug") == platform_slug and game.get("listingStatus") != "excluded"
        for game in catalog
    )
    update_platform(platforms, platform_slug, listed_platform)
    linked = link_exact_collection_rows(collection, catalog, platform_slug)
    index_stats = update_entity_indexes(
        companies_index,
        genres_index,
        catalog,
        details,
        imported_ids,
    ) if companies_index is not None and genres_index is not None else {
        "indexedGames": 0,
        "companies": len(companies_index or {}),
        "genres": len(genres_index or {}),
    }
    return {
        "platformSlug": platform_slug,
        "asOf": as_of.isoformat(),
        "sourceCandidates": len(payload.get("candidates") or []),
        "validCandidates": len(candidates),
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "listedPlatform": listed_platform,
        "linkedCollectionRows": linked,
        "indexStats": index_stats,
        "skippedMissingCover": skipped_missing_cover,
        "collisions": collisions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Importar un lote GAME aprobado al catálogo")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, default=CATALOG_FILE)
    parser.add_argument("--details", type=Path, default=DETAILS_FILE)
    parser.add_argument("--platforms", type=Path, default=PLATFORMS_FILE)
    parser.add_argument("--collection", type=Path, default=COLLECTION_FILE)
    parser.add_argument("--meta", type=Path, default=META_FILE)
    parser.add_argument("--companies-index", type=Path, default=COMPANIES_INDEX_FILE)
    parser.add_argument("--genres-index", type=Path, default=GENRES_INDEX_FILE)
    parser.add_argument("--covers-dir", type=Path)
    parser.add_argument("--cover-workers", type=int, default=8)
    parser.add_argument("--require-covers", action="store_true")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--approve-source-batch", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not args.approve_source_batch:
        raise SystemExit("Falta --approve-source-batch; no se escribirá el catálogo sin aprobación explícita.")
    payload = load_json(args.input, {})
    platform_slug, _as_of, candidates = validate_payload(payload)
    available_cover_ids: set[str] | None = None
    cover_failures: dict[str, str] = {}
    if args.covers_dir and not args.dry_run:
        available_cover_ids, cover_failures = download_covers(
            candidates,
            args.covers_dir,
            workers=args.cover_workers,
        )
    elif args.require_covers and not args.dry_run:
        raise SystemExit("--require-covers necesita --covers-dir.")

    catalog = load_json(args.catalog, [])
    details = load_json(args.details, {})
    platforms = load_json(args.platforms, [])
    collection = load_json(args.collection, [])
    meta = load_json(args.meta, {})
    companies_index = load_json(args.companies_index, {})
    genres_index = load_json(args.genres_index, {})
    report = apply_import(
        payload=payload,
        catalog=catalog,
        details=details,
        platforms=platforms,
        collection=collection,
        companies_index=companies_index,
        genres_index=genres_index,
        available_cover_ids=available_cover_ids,
        require_covers=args.require_covers,
    )
    report["coverDownloaded"] = len(available_cover_ids or set())
    report["coverFailures"] = cover_failures
    report["inputSha256"] = hashlib.sha256(args.input.read_bytes()).hexdigest()
    report["collectedAt"] = str(payload.get("collectedAt") or "")

    if args.dry_run:
        print(json.dumps({"dryRun": True, **report}, ensure_ascii=False, indent=2))
        return

    imported_at = str(payload.get("collectedAt") or f"{report['asOf']}T00:00:00Z")
    update_meta(
        meta,
        catalog,
        details,
        companies_index,
        genres_index,
        platforms,
        collection,
        imported_at,
    )
    save_json(args.catalog, catalog)
    save_json(args.details, details)
    save_json(args.platforms, platforms)
    save_json(args.collection, collection)
    save_json(args.meta, meta)
    save_json(args.companies_index, companies_index)
    save_json(args.genres_index, genres_index)
    if args.report:
        save_json(args.report, report)
    print(json.dumps({"ok": True, **report}, ensure_ascii=False, indent=2))
    print(f"Plataforma {platform_slug} activa · precios GAME importados: 0")


if __name__ == "__main__":
    main()
