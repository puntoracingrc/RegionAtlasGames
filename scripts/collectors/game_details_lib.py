"""Fusión de metadatos de juego desde Museo del Videojuego y PriceCharting."""

from __future__ import annotations

import json
import re
import time
import unicodedata
from pathlib import Path
from typing import Any

SOURCE_MUSEUM = "museum"
SOURCE_PC = "pricecharting"
SOURCE_SERIALSTATION = "serialstation"
SOURCE_WIKIDATA = "wikidata"

FIELD_KEYS = (
    "developer",
    "publisher",
    "genres",
    "series",
    "reference",
    "year",
    "releaseDate",
    "players",
    "support",
)

ROLE_FIELDS = {"developer", "publisher"}


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text))
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "entidad"


def slug_from_path(path: str) -> str:
    return path.strip("/").split("/")[-1]


def entity_from_museum_link(path: str, name: str) -> dict[str, Any]:
    return {
        "name": name.strip(),
        "slug": slug_from_path(path),
        "museumPath": path,
        "pcPath": None,
        "source": SOURCE_MUSEUM,
    }


def entity_from_pc_name(name: str, pc_path: str | None = None) -> dict[str, Any]:
    clean = name.strip()
    return {
        "name": clean,
        "slug": slugify(clean),
        "museumPath": None,
        "pcPath": pc_path,
        "source": SOURCE_PC,
    }


def entity_from_pc_link(path: str, name: str) -> dict[str, Any]:
    clean = name.strip()
    slug = slug_from_path(path) if path.startswith("/genre/") else slugify(clean)
    return {
        "name": clean,
        "slug": slug,
        "museumPath": None,
        "pcPath": path,
        "source": SOURCE_PC,
    }


def entity_from_wikidata(name: str, wikidata_id: str) -> dict[str, Any]:
    clean = name.strip()
    return {
        "name": clean,
        "slug": slugify(clean),
        "museumPath": None,
        "pcPath": None,
        "wikidataId": wikidata_id,
        "source": SOURCE_WIKIDATA,
    }


def entity_from_serialstation(name: str, serialstation_id: str) -> dict[str, Any]:
    clean = name.strip()
    return {
        "name": clean,
        "slug": slugify(clean),
        "museumPath": None,
        "pcPath": None,
        "serialstationId": serialstation_id,
        "source": SOURCE_SERIALSTATION,
    }


def normalize_entity(entity: dict[str, Any] | None, *, default_source: str) -> dict[str, Any] | None:
    if not entity or not entity.get("name"):
        return None
    normalized = dict(entity)
    normalized["name"] = str(normalized["name"]).strip()
    normalized["slug"] = normalized.get("slug") or slugify(normalized["name"])
    normalized.setdefault("museumPath", None)
    normalized.setdefault("pcPath", None)
    normalized.setdefault("source", default_source)
    return normalized


def plain_text(body: str) -> str:
    text = re.sub(r"<!--.*?-->", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_players(text: str | None) -> int | None:
    if not text or text.lower() == "none":
        return None
    match = re.search(r"(\d+)(?:-(\d+))?\s*player", text, re.I)
    if match:
        return int(match.group(2) or match.group(1))
    match = re.search(r"\b(\d+)\b", text)
    return int(match.group(1)) if match else None


def parse_year_from_date(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r"\b(19|20)\d{2}\b", text)
    return int(match.group(0)) if match else None


def normalize_reference(text: str | None) -> str | None:
    if not text or text.lower() == "none":
        return None
    ref = text.strip().lstrip("#").strip()
    return ref or None


def parse_genre_values(body: str, plain: str) -> list[dict[str, Any]]:
    links = LINK_RE.findall(body)
    if links:
        return [entity_from_pc_link(path, name) for path, name in links if name.strip()]
    if not plain or plain.lower() == "none":
        return []
    parts = re.split(r"[,/&]+", plain)
    return [entity_from_pc_name(part.strip()) for part in parts if part.strip()]


def parse_company_value(body: str, plain: str) -> dict[str, Any] | None:
    links = LINK_RE.findall(body)
    if links:
        path, name = links[0]
        return entity_from_pc_link(path, name)
    if not plain or plain.lower() == "none":
        return None
    return entity_from_pc_name(plain)


MUSEUM_FIELD_BLOCK_RE = re.compile(
    r'<div\s+class="field__label">([^<]+)</div>\s*(.*?)(?=<div\s+class="field__label">|\Z)',
    re.S | re.I,
)
LINK_RE = re.compile(r'href="(/[^"]+)"[^>]*>([^<]+)</a>', re.I)
SUPPORT_ALT_RE = re.compile(r'alt="Soporte:\s*([^"]+)"', re.I)
PC_DETAIL_ROW_RE = re.compile(
    r'<td class="title">([^<]+):</td>\s*<td class="details"[^>]*>(.*?)</td>',
    re.S | re.I,
)


def parse_museum_fields(html_doc: str) -> dict[str, Any]:
    section = html_doc
    main = re.search(
        r'class="group-second">(.*?)class="group-fourth">',
        html_doc,
        re.S | re.I,
    )
    if main:
        section = main.group(1)

    fields: dict[str, Any] = {}
    for label, body in MUSEUM_FIELD_BLOCK_RE.findall(section):
        label = label.strip()
        links = LINK_RE.findall(body)
        if label == "Género" and links:
            fields[label] = [entity_from_museum_link(path, name) for path, name in links]
        elif label in {"Desarrolla", "Publica", "Saga juego", "Saga"} and links:
            fields[label] = entity_from_museum_link(links[0][0], links[0][1])
        elif label == "Año" and links:
            href, text = links[0]
            year_match = re.search(r"/(\d{4})$", href)
            fields[label] = int(year_match.group(1)) if year_match else int(text) if text.isdigit() else None
        elif label == "Num. Jugadores" and links:
            fields[label] = int(links[0][1]) if links[0][1].isdigit() else None
        elif label == "Soporte":
            alt = SUPPORT_ALT_RE.search(body)
            fields[label] = alt.group(1).strip() if alt else plain_text(body) or None
        elif label == "Referencia":
            value = re.split(r"\s+<", plain_text(body))[0].strip()
            fields[label] = value if value else None
        elif label == "Lanzamiento":
            value = plain_text(body)
            fields[label] = value if value else None
        elif links:
            fields[label] = [entity_from_museum_link(path, name) for path, name in links]

    return fields


def parse_museum_details(html_doc: str, museum_path: str) -> dict[str, Any]:
    fields = parse_museum_fields(html_doc)
    series = fields.get("Saga juego") or fields.get("Saga")
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%S")
    detail = {
        "year": fields.get("Año"),
        "releaseDate": fields.get("Lanzamiento"),
        "reference": fields.get("Referencia"),
        "players": fields.get("Num. Jugadores"),
        "support": fields.get("Soporte"),
        "developer": fields.get("Desarrolla"),
        "publisher": fields.get("Publica"),
        "genres": fields.get("Género") or [],
        "series": series,
        "museumPath": museum_path,
        "fetchedAt": fetched_at,
        "sources": {
            SOURCE_MUSEUM: {
                "museumPath": museum_path,
                "fetchedAt": fetched_at,
            }
        },
        "fieldSources": {},
    }
    for field in FIELD_KEYS:
        if _field_has_value(detail, field):
            detail["fieldSources"][field] = SOURCE_MUSEUM
    return detail


def parse_pc_details(html_doc: str, pc_path: str) -> dict[str, Any]:
    rows: dict[str, str] = {}
    row_html: dict[str, str] = {}
    for label, body in PC_DETAIL_ROW_RE.findall(html_doc):
        clean_label = label.strip()
        rows[clean_label] = plain_text(body)
        row_html[clean_label] = body

    product_id_match = re.search(r'data-product-id="(\d+)"', html_doc)
    product_id = int(product_id_match.group(1)) if product_id_match else None
    if not product_id:
        pc_id_text = rows.get("PriceCharting ID")
        if pc_id_text and pc_id_text.isdigit():
            product_id = int(pc_id_text)

    developer = parse_company_value(row_html.get("Developer", ""), rows.get("Developer", ""))
    publisher = parse_company_value(row_html.get("Publisher", ""), rows.get("Publisher", ""))
    genres = parse_genre_values(row_html.get("Genre", ""), rows.get("Genre", ""))
    release_date = rows.get("Release Date")
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%S")

    detail = {
        "year": parse_year_from_date(release_date),
        "releaseDate": release_date if release_date and release_date.lower() != "none" else None,
        "reference": normalize_reference(rows.get("Model Number")),
        "players": parse_players(rows.get("Player Count")),
        "support": None,
        "developer": developer,
        "publisher": publisher,
        "genres": genres,
        "series": None,
        "pcProductId": product_id,
        "ean": rows.get("EAN / GTIN") if rows.get("EAN / GTIN", "").lower() != "none" else None,
        "pegi": rows.get("PEGI Rating") if rows.get("PEGI Rating", "").lower() != "none" else None,
        "fetchedAt": fetched_at,
        "sources": {
            SOURCE_PC: {
                "pcPath": pc_path,
                "fetchedAt": fetched_at,
                "productId": product_id,
            }
        },
        "fieldSources": {},
    }
    for field in FIELD_KEYS:
        if _field_has_value(detail, field):
            detail["fieldSources"][field] = SOURCE_PC
    return detail


def _field_has_value(detail: dict[str, Any], field: str) -> bool:
    value = detail.get(field)
    if field == "genres":
        return bool(value)
    return value not in (None, "", [])


def details_changed(before: dict[str, Any] | None, after: dict[str, Any] | None) -> bool:
    if before is None and after is None:
        return False
    if before is None or after is None:
        return True
    ignore = {"mergedAt", "fetchedAt"}
    left = {key: value for key, value in before.items() if key not in ignore}
    right = {key: value for key, value in after.items() if key not in ignore}
    return left != right


def is_valid_detail(entry: dict[str, Any] | None) -> bool:
    if not entry or entry.get("error"):
        return False
    return any(_field_has_value(entry, field) for field in FIELD_KEYS)


def _merge_entity(
    museum_entity: dict[str, Any] | None,
    pc_entity: dict[str, Any] | None,
    serialstation_entity: dict[str, Any] | None = None,
    wikidata_entity: dict[str, Any] | None = None,
    *,
    role: str,
) -> tuple[dict[str, Any] | None, str | None]:
    museum_entity = normalize_entity(museum_entity, default_source=SOURCE_MUSEUM)
    pc_entity = normalize_entity(pc_entity, default_source=SOURCE_PC)
    serialstation_entity = normalize_entity(serialstation_entity, default_source=SOURCE_SERIALSTATION)
    wikidata_entity = normalize_entity(wikidata_entity, default_source=SOURCE_WIKIDATA)

    if museum_entity:
        return museum_entity, SOURCE_MUSEUM
    if pc_entity:
        return pc_entity, SOURCE_PC
    if serialstation_entity:
        return serialstation_entity, SOURCE_SERIALSTATION
    if wikidata_entity:
        return wikidata_entity, SOURCE_WIKIDATA
    return None, None


def _merge_genres(
    museum_genres: list[dict[str, Any]] | None,
    pc_genres: list[dict[str, Any]] | None,
    serialstation_genres: list[dict[str, Any]] | None = None,
    wikidata_genres: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    museum_genres = museum_genres or []
    pc_genres = pc_genres or []
    serialstation_genres = serialstation_genres or []
    wikidata_genres = wikidata_genres or []
    if museum_genres:
        merged = [normalize_entity(g, default_source=SOURCE_MUSEUM) for g in museum_genres]
        return [g for g in merged if g], SOURCE_MUSEUM
    if pc_genres:
        merged = [normalize_entity(g, default_source=SOURCE_PC) for g in pc_genres]
        return [g for g in merged if g], SOURCE_PC
    if serialstation_genres:
        merged = [normalize_entity(g, default_source=SOURCE_SERIALSTATION) for g in serialstation_genres]
        return [g for g in merged if g], SOURCE_SERIALSTATION
    if wikidata_genres:
        merged = [normalize_entity(g, default_source=SOURCE_WIKIDATA) for g in wikidata_genres]
        return [g for g in merged if g], SOURCE_WIKIDATA
    return [], None


def _merge_scalar(
    museum_detail: dict[str, Any] | None,
    pc_detail: dict[str, Any] | None,
    serialstation_detail: dict[str, Any] | None,
    wikidata_detail: dict[str, Any] | None,
    field: str,
    *,
    source_order: tuple[str, ...] | None = None,
) -> tuple[Any, str | None]:
    order = source_order or (SOURCE_MUSEUM, SOURCE_PC, SOURCE_SERIALSTATION, SOURCE_WIKIDATA)
    by_source = {
        SOURCE_MUSEUM: museum_detail,
        SOURCE_PC: pc_detail,
        SOURCE_SERIALSTATION: serialstation_detail,
        SOURCE_WIKIDATA: wikidata_detail,
    }
    for source in order:
        detail = by_source.get(source)
        if not detail:
            continue
        value = detail.get(field)
        if value not in (None, ""):
            return value, source
    return None, None


def merge_details(
    museum_detail: dict[str, Any] | None,
    pc_detail: dict[str, Any] | None,
    wikidata_detail: dict[str, Any] | None = None,
    serialstation_detail: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not museum_detail and not pc_detail and not wikidata_detail and not serialstation_detail:
        return None

    merged: dict[str, Any] = {
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
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "mergedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    if museum_detail:
        museum_src = museum_detail.get("sources", {}).get(SOURCE_MUSEUM) or {}
        merged["sources"][SOURCE_MUSEUM] = {
            "museumPath": museum_src.get("museumPath") or museum_detail.get("museumPath"),
            "fetchedAt": museum_src.get("fetchedAt") or museum_detail.get("fetchedAt"),
        }
        merged["museumPath"] = museum_detail.get("museumPath")

    if pc_detail:
        pc_src = pc_detail.get("sources", {}).get(SOURCE_PC) or {}
        merged["sources"][SOURCE_PC] = {
            "pcPath": pc_src.get("pcPath") or pc_detail.get("sources", {}).get(SOURCE_PC, {}).get("pcPath"),
            "fetchedAt": pc_src.get("fetchedAt") or pc_detail.get("fetchedAt"),
            "productId": pc_detail.get("pcProductId"),
        }
        merged["pcProductId"] = pc_detail.get("pcProductId")
        merged["ean"] = pc_detail.get("ean")
        if pc_detail.get("pegi"):
            merged["pegi"] = pc_detail.get("pegi")

    if wikidata_detail:
        wd_src = wikidata_detail.get("sources", {}).get(SOURCE_WIKIDATA) or {}
        merged["sources"][SOURCE_WIKIDATA] = {
            "wikidataId": wd_src.get("wikidataId") or wikidata_detail.get("wikidataId"),
            "fetchedAt": wd_src.get("fetchedAt") or wikidata_detail.get("fetchedAt"),
            "matchScore": wd_src.get("matchScore"),
        }

    if serialstation_detail:
        ss_src = serialstation_detail.get("sources", {}).get(SOURCE_SERIALSTATION) or {}
        merged["sources"][SOURCE_SERIALSTATION] = {
            "serialstationId": ss_src.get("serialstationId"),
            "titleId": ss_src.get("titleId"),
            "matchMethod": ss_src.get("matchMethod"),
            "matchScore": ss_src.get("matchScore"),
            "fetchedAt": ss_src.get("fetchedAt") or serialstation_detail.get("fetchedAt"),
        }

    dev, dev_source = _merge_entity(
        museum_detail.get("developer") if museum_detail else None,
        pc_detail.get("developer") if pc_detail else None,
        serialstation_detail.get("developer") if serialstation_detail else None,
        wikidata_detail.get("developer") if wikidata_detail else None,
        role="developer",
    )
    pub, pub_source = _merge_entity(
        museum_detail.get("publisher") if museum_detail else None,
        pc_detail.get("publisher") if pc_detail else None,
        serialstation_detail.get("publisher") if serialstation_detail else None,
        wikidata_detail.get("publisher") if wikidata_detail else None,
        role="publisher",
    )
    merged["developer"] = dev
    merged["publisher"] = pub
    if dev_source:
        merged["fieldSources"]["developer"] = dev_source
    if pub_source:
        merged["fieldSources"]["publisher"] = pub_source

    genres, genre_source = _merge_genres(
        museum_detail.get("genres") if museum_detail else None,
        pc_detail.get("genres") if pc_detail else None,
        serialstation_detail.get("genres") if serialstation_detail else None,
        wikidata_detail.get("genres") if wikidata_detail else None,
    )
    merged["genres"] = genres
    if genre_source:
        merged["fieldSources"]["genres"] = genre_source

    series, series_source = _merge_entity(
        museum_detail.get("series") if museum_detail else None,
        pc_detail.get("series") if pc_detail else None,
        serialstation_detail.get("series") if serialstation_detail else None,
        wikidata_detail.get("series") if wikidata_detail else None,
        role="series",
    )
    merged["series"] = series
    if series_source:
        merged["fieldSources"]["series"] = series_source

    ref_order = (SOURCE_MUSEUM, SOURCE_SERIALSTATION, SOURCE_PC, SOURCE_WIKIDATA)
    reference, ref_source = _merge_scalar(
        museum_detail,
        pc_detail,
        serialstation_detail,
        wikidata_detail,
        "reference",
        source_order=ref_order,
    )
    if reference not in (None, ""):
        merged["reference"] = reference
        if ref_source:
            merged["fieldSources"]["reference"] = ref_source

    for field in ("year", "releaseDate", "players", "support"):
        value, source = _merge_scalar(
            museum_detail,
            pc_detail,
            serialstation_detail,
            wikidata_detail,
            field,
        )
        if value not in (None, ""):
            merged[field] = value
            if source:
                merged["fieldSources"][field] = source

    if not is_valid_detail(merged):
        return None
    return merged


def split_detail_sources(
    existing: dict[str, Any],
) -> tuple[
    dict[str, Any] | None,
    dict[str, Any] | None,
    dict[str, Any] | None,
    dict[str, Any] | None,
]:
    if not existing:
        return None, None, None, None

    museum_detail: dict[str, Any] | None = None
    pc_detail: dict[str, Any] | None = None
    wikidata_detail: dict[str, Any] | None = None
    serialstation_detail: dict[str, Any] | None = None

    if existing.get("sources", {}).get(SOURCE_MUSEUM) or existing.get("museumPath"):
        museum_detail = dict(existing)
        museum_detail["sources"] = {SOURCE_MUSEUM: existing.get("sources", {}).get(SOURCE_MUSEUM, {})}

    if existing.get("sources", {}).get(SOURCE_PC):
        pc_detail = dict(existing)
        pc_detail["sources"] = {SOURCE_PC: existing.get("sources", {}).get(SOURCE_PC, {})}

    if existing.get("sources", {}).get(SOURCE_WIKIDATA):
        wikidata_detail = dict(existing)
        wikidata_detail["sources"] = {SOURCE_WIKIDATA: existing.get("sources", {}).get(SOURCE_WIKIDATA, {})}

    if existing.get("sources", {}).get(SOURCE_SERIALSTATION):
        serialstation_detail = dict(existing)
        serialstation_detail["sources"] = {
            SOURCE_SERIALSTATION: existing.get("sources", {}).get(SOURCE_SERIALSTATION, {})
        }

    if museum_detail is None and _looks_like_museum_only(existing):
        museum_detail = dict(existing)

    if pc_detail is None and _looks_like_pc_only(existing):
        pc_detail = dict(existing)

    if wikidata_detail is None and _looks_like_wikidata_only(existing):
        wikidata_detail = dict(existing)

    if serialstation_detail is None and _looks_like_serialstation_only(existing):
        serialstation_detail = dict(existing)

    return museum_detail, pc_detail, wikidata_detail, serialstation_detail


def _looks_like_museum_only(detail: dict[str, Any]) -> bool:
    if detail.get("museumPath"):
        return True
    for entity_field in ("developer", "publisher", "series"):
        entity = detail.get(entity_field)
        if isinstance(entity, dict) and entity.get("museumPath"):
            return True
    for genre in detail.get("genres") or []:
        if isinstance(genre, dict) and genre.get("museumPath"):
            return True
    return False


def _looks_like_pc_only(detail: dict[str, Any]) -> bool:
    if detail.get("pcProductId"):
        return True
    if detail.get("sources", {}).get(SOURCE_PC):
        return True
    for entity_field in ("developer", "publisher"):
        entity = detail.get(entity_field)
        if isinstance(entity, dict) and entity.get("source") == SOURCE_PC:
            return True
    return False


def _looks_like_wikidata_only(detail: dict[str, Any]) -> bool:
    if detail.get("sources", {}).get(SOURCE_WIKIDATA):
        return True
    for entity_field in ("developer", "publisher", "series"):
        entity = detail.get(entity_field)
        if isinstance(entity, dict) and entity.get("source") == SOURCE_WIKIDATA:
            return True
    for genre in detail.get("genres") or []:
        if isinstance(genre, dict) and genre.get("source") == SOURCE_WIKIDATA:
            return True
    return False


def _looks_like_serialstation_only(detail: dict[str, Any]) -> bool:
    if detail.get("sources", {}).get(SOURCE_SERIALSTATION):
        return True
    for entity_field in ("developer", "publisher", "series"):
        entity = detail.get(entity_field)
        if isinstance(entity, dict) and entity.get("source") == SOURCE_SERIALSTATION:
            return True
    return False


def build_indexes(details: dict[str, dict], catalog: list[dict]) -> dict[str, Any]:
    listed_ids = {
        g["id"]
        for g in catalog
        if g.get("listingStatus") != "excluded" and g["id"] in details and is_valid_detail(details[g["id"]])
    }
    by_id = {g["id"]: g for g in catalog}

    companies: dict[str, dict] = {}
    genres: dict[str, dict] = {}
    series: dict[str, dict] = {}

    def entity_path(entity: dict[str, Any]) -> str:
        return entity.get("museumPath") or entity.get("pcPath") or ""

    def bump_entity(
        bucket: dict[str, dict],
        entity: dict[str, Any] | None,
        game_id: str,
        role: str | None = None,
    ) -> None:
        if not entity or not entity.get("name"):
            return
        slug = entity.get("slug") or slugify(entity["name"])
        entry = bucket.setdefault(
            slug,
            {
                "name": entity["name"],
                "slug": slug,
                "museumPath": entity_path(entity),
                "gameIds": [],
                "byPlatform": {},
                **({"asDeveloper": [], "asPublisher": []} if role else {}),
            },
        )
        if not entry["museumPath"] and entity_path(entity):
            entry["museumPath"] = entity_path(entity)
        if game_id not in entry["gameIds"]:
            entry["gameIds"].append(game_id)
            platform = by_id[game_id]["platformSlug"]
            entry["byPlatform"][platform] = entry["byPlatform"].get(platform, 0) + 1
        if role == "developer" and game_id not in entry.get("asDeveloper", []):
            entry["asDeveloper"].append(game_id)
        if role == "publisher" and game_id not in entry["asPublisher"]:
            entry["asPublisher"].append(game_id)

    for game_id in listed_ids:
        detail = details[game_id]
        bump_entity(companies, detail.get("developer"), game_id, "developer")
        bump_entity(companies, detail.get("publisher"), game_id, "publisher")
        for genre in detail.get("genres") or []:
            bump_entity(genres, genre, game_id)
        bump_entity(series, detail.get("series"), game_id)

    for bucket in (companies, genres, series):
        for entry in bucket.values():
            entry["gameCount"] = len(entry["gameIds"])
            entry["byPlatform"] = dict(sorted(entry["byPlatform"].items()))

    return {
        "companies": dict(sorted(companies.items(), key=lambda x: (-x[1]["gameCount"], x[0]))),
        "genres": dict(sorted(genres.items(), key=lambda x: (-x[1]["gameCount"], x[0]))),
        "series": dict(sorted(series.items(), key=lambda x: (-x[1]["gameCount"], x[0]))),
        "stats": {
            "gamesWithDetails": len(listed_ids),
            "companies": len(companies),
            "genres": len(genres),
            "series": len(series),
        },
    }


def load_json(path: Path, default: dict | list) -> dict | list:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def coverage_stats(details: dict[str, dict], catalog: list[dict]) -> dict[str, Any]:
    listed = [g for g in catalog if g.get("listingStatus") != "excluded"]
    total = len(listed)
    counts: dict[str, int] = {}
    role_stats = {
        "dev_pub_same": 0,
        "dev_pub_diff": 0,
        "only_developer": 0,
        "only_publisher": 0,
        "neither_role": 0,
    }
    source_mix = {
        "museum_only": 0,
        "pc_only": 0,
        "serialstation_only": 0,
        "wikidata_only": 0,
        "multi_source": 0,
    }

    for game in listed:
        detail = details.get(game["id"])
        if not is_valid_detail(detail):
            continue
        for field in ("reference", "developer", "publisher", "genres", "series", "year"):
            if _field_has_value(detail, field):
                counts[field] = counts.get(field, 0) + 1

        dev = (detail.get("developer") or {}).get("name")
        pub = (detail.get("publisher") or {}).get("name")
        if dev and pub:
            if dev.strip().lower() == pub.strip().lower():
                role_stats["dev_pub_same"] += 1
            else:
                role_stats["dev_pub_diff"] += 1
        elif dev:
            role_stats["only_developer"] += 1
        elif pub:
            role_stats["only_publisher"] += 1
        else:
            role_stats["neither_role"] += 1

        sources = detail.get("sources") or {}
        source_count = sum(
            1
            for key in (SOURCE_MUSEUM, SOURCE_PC, SOURCE_SERIALSTATION, SOURCE_WIKIDATA)
            if sources.get(key) or (key == SOURCE_MUSEUM and detail.get("museumPath"))
        )
        if source_count >= 2:
            source_mix["multi_source"] += 1
        elif sources.get(SOURCE_WIKIDATA):
            source_mix["wikidata_only"] += 1
        elif sources.get(SOURCE_SERIALSTATION):
            source_mix["serialstation_only"] += 1
        elif sources.get(SOURCE_PC) or detail.get("pcProductId"):
            source_mix["pc_only"] += 1
        elif sources.get(SOURCE_MUSEUM) or detail.get("museumPath"):
            source_mix["museum_only"] += 1

    with_details = sum(1 for g in listed if is_valid_detail(details.get(g["id"])))
    return {
        "listedGames": total,
        "withDetails": with_details,
        "coveragePct": round(100 * with_details / total, 1) if total else 0,
        "fields": {k: {"count": v, "pct": round(100 * v / total, 1)} for k, v in counts.items()},
        "roles": role_stats,
        "sourceMix": source_mix,
    }
