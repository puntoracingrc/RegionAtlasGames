#!/usr/bin/env python3
"""Alta reproducible del catálogo inicial de NEOGEO AES+."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
META_FILE = ROOT / "data" / "meta.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
INDEX_DIR = ROOT / "data" / "index"

PLATFORM_SLUG = "neogeo-aes-plus"
FETCHED_AT = "2026-09-02T12:00:00+02:00"
ARTICLE_URL = (
    "https://areajugones.sport.es/videojuegos/"
    "los-10-juegos-del-catalogo-inicial-de-la-neo-geo-aes-ordenados-de-mejor-a-peor-cual-merece-tu-dinero/"
)
OFFICIAL_URL = "https://plaionreplai.com/pages/neogeo"
OFFICIAL_JP_URL = "https://plaionreplai.jp/pages/neogeo"


def entity(name: str, slug: str) -> dict:
    return {
        "name": name,
        "slug": slug,
        "museumPath": None,
        "pcPath": None,
        "source": "merged",
    }


GAMES = [
    {
        "slug": "garou-mark-of-the-wolves",
        "title": "Garou: Mark of the Wolves",
        "developer": ("SNK", "snk"),
        "genres": [("Lucha", "lucha")],
        "series": ("Fatal Fury", "fatal-fury"),
        "description": (
            "La última gran evolución de Fatal Fury apuesta por duelos técnicos, animación muy cuidada "
            "y un sistema de defensa que premia la precisión. Esta reedición devuelve a formato físico "
            "uno de los juegos de lucha más celebrados de SNK."
        ),
    },
    {
        "slug": "metal-slug",
        "title": "Metal Slug",
        "developer": ("Nazca", "nazca"),
        "genres": [("Acción", "accion"), ("Shooter", "shooter")],
        "series": ("Metal Slug", "metal-slug"),
        "description": (
            "Acción arcade directa, vehículos, rescates y escenarios repletos de animaciones dibujadas a mano. "
            "Su ritmo, humor y capacidad cooperativa convierten esta primera entrega en una de las señas de "
            "identidad del catálogo Neo Geo."
        ),
    },
    {
        "slug": "the-king-of-fighters-2002",
        "title": "The King of Fighters 2002",
        "developer": ("Eolith", "eolith"),
        "genres": [("Lucha", "lucha")],
        "series": ("The King of Fighters", "the-king-of-fighters"),
        "description": (
            "Esta entrega reúne un amplio plantel y recupera el combate por equipos de tres con pocas distracciones. "
            "La profundidad de sus enfrentamientos y su velocidad la mantienen como una referencia competitiva "
            "dentro de The King of Fighters."
        ),
    },
    {
        "slug": "pulstar",
        "title": "Pulstar",
        "developer": ("Aicom", "aicom"),
        "genres": [("Shoot 'em up", "shoot-em-up")],
        "series": None,
        "description": (
            "Un matamarcianos horizontal de avance calculado, grandes jefes y patrones que exigen aprender cada tramo. "
            "La carga del disparo y el uso de módulos defensivos aportan una capa táctica a su espectacular apartado visual."
        ),
    },
    {
        "slug": "samurai-shodown-v-special",
        "title": "Samurai Shodown V Special",
        "developer": ("Yuki Enterprise", "yuki-enterprise"),
        "genres": [("Lucha", "lucha")],
        "series": ("Samurai Shodown", "samurai-shodown"),
        "description": (
            "Combates armados de gran tensión donde la distancia y un solo golpe bien medido pueden decidir la ronda. "
            "Esta versión especial ajusta el equilibrio, amplía la selección de luchadores y conserva el tono más "
            "contundente de la saga."
        ),
    },
    {
        "slug": "shock-troopers",
        "title": "Shock Troopers",
        "developer": ("Saurus", "saurus"),
        "genres": [("Acción", "accion"), ("Shooter", "shooter")],
        "series": ("Shock Troopers", "shock-troopers"),
        "description": (
            "Un run and gun con perspectiva cenital, rutas alternativas y escuadrones que permiten cambiar de especialista "
            "durante la partida. Su acción cooperativa, sus evasiones y la variedad de armas sostienen un ritmo arcade constante."
        ),
    },
    {
        "slug": "twinkle-star-sprites",
        "title": "Twinkle Star Sprites",
        "developer": ("ADK", "adk"),
        "genres": [("Shooter", "shooter"), ("Puzzle", "puzzle")],
        "series": ("Twinkle Star Sprites", "twinkle-star-sprites"),
        "description": (
            "Mezcla disparos y puzles competitivos en duelos donde encadenar enemigos envía ataques al campo rival. "
            "Su apariencia alegre esconde partidas rápidas, tácticas y especialmente pensadas para dos jugadores."
        ),
    },
    {
        "slug": "big-tournament-golf",
        "title": "Big Tournament Golf",
        "developer": ("Nazca", "nazca"),
        "genres": [("Deporte", "deporte"), ("Golf", "golf")],
        "series": None,
        "description": (
            "Golf arcade de controles accesibles, personajes diferenciados y recorridos que obligan a valorar viento y terreno. "
            "También conocido como Neo Turf Masters, combina partidas inmediatas con suficiente precisión para mejorar vuelta a vuelta."
        ),
    },
    {
        "slug": "magician-lord",
        "title": "Magician Lord",
        "developer": ("ADK", "adk"),
        "genres": [("Plataformas", "plataformas"), ("Acción", "accion")],
        "series": ("Magician Lord", "magician-lord"),
        "description": (
            "Plataformas y acción fantástica se combinan en una aventura exigente protagonizada por un mago capaz de transformarse. "
            "Cada forma cambia sus ataques y ayuda a superar escenarios verticales, criaturas enormes y jefes de marcado sabor arcade."
        ),
    },
    {
        "slug": "over-top",
        "title": "Over Top",
        "developer": ("ADK", "adk"),
        "genres": [("Conducción", "conduccion")],
        "series": None,
        "description": (
            "Carreras con vista isométrica que atraviesan ciudad, nieve, tierra y otros firmes en una misma prueba. "
            "La elección del vehículo modifica el comportamiento en cada superficie y convierte la búsqueda del mejor tiempo "
            "en el centro de la experiencia."
        ),
    },
]


def catalog_entry(game: dict, region: str) -> dict:
    region_slug = "international" if region == "Internacional" else "japanese"
    game_id = f"{PLATFORM_SLUG}-{region_slug}-{game['slug']}"
    return {
        "id": game_id,
        "slug": game["slug"],
        "title": game["title"],
        "titlePc": None,
        "platformSlug": PLATFORM_SLUG,
        "region": region,
        "physicalVariant": region_slug,
        "edition": "Reedición AES+ 2026",
        "listingStatus": "listed",
        "coverUrl": f"/catalog-covers/{PLATFORM_SLUG}/{region_slug}-{game['slug']}.png",
        "pcId": None,
        "pcPath": None,
        "pcRegion": None,
        "pcCondition": None,
        "matchConfidence": "OFFICIAL_LAUNCH",
        "marketMin": 80.0,
        "marketMax": 80.0,
        "recommendedPrice": 80.0,
        "estimatedPriceLoose": None,
        "estimatedPriceGameManual": None,
        "estimatedPriceComplete": None,
        "estimatedPriceSealed": 80.0,
        "estimatedPriceNewRetail": 80.0,
        "priceDataSources": "PLAION REPLAI · PVP de lanzamiento",
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": "PLAION REPLAI · PVP de lanzamiento",
        "updatedAt": "2026-09-02",
        "hasEsPrice": True,
        "seedSource": "official-neogeo-aes-plus-launch",
        "regionEvidence": [
            "Carátula oficial de lanzamiento de PLAION REPLAI",
            "Catálogo inicial anunciado para NEOGEO AES+",
        ],
        "regionVerified": True,
        "priceRegionVerified": True,
        "regionalPackaging": [
            {
                "region": region,
                "ratingSystem": "CERO" if region == "Japonesa" else None,
                "frontCoverLanguages": ["ja"] if region == "Japonesa" else ["en"],
                "backCoverLanguages": None,
            }
        ],
        "regionalPackagingSource": "PLAION REPLAI",
        "regionalPackagingUpdatedAt": "2026-09-02",
    }


def details_entry(game: dict, region: str) -> dict:
    region_text = "internacional" if region == "Internacional" else "japonesa"
    description = (
        f"{game['description']} Esta ficha corresponde a la reedición física {region_text} "
        "para NEOGEO AES+ de 2026."
    )
    title = game["title"]
    developer_name, developer_slug = game["developer"]
    series = entity(*game["series"]) if game["series"] else None
    return {
        "year": 2026,
        "releaseDate": "12 Noviembre, 2026",
        "reference": None,
        "players": 2,
        "support": "Cartucho",
        "developer": entity(developer_name, developer_slug),
        "publisher": entity("PLAION REPLAI", "plaion-replai"),
        "genres": [entity(name, slug) for name, slug in game["genres"]],
        "series": series,
        "museumPath": None,
        "pcProductId": None,
        "ean": None,
        "sources": {
            "official": {
                "url": OFFICIAL_URL if region == "Internacional" else OFFICIAL_JP_URL,
                "label": "PLAION REPLAI",
                "fetchedAt": FETCHED_AT,
            }
        },
        "fieldSources": {
            "developer": "official",
            "publisher": "official",
            "genres": "official",
            "series": "official",
            "year": "official",
            "releaseDate": "official",
            "players": "official",
            "support": "official",
        },
        "fetchedAt": FETCHED_AT,
        "mergedAt": FETCHED_AT,
        "description": description,
        "descriptionMeta": {
            "generatedAt": FETCHED_AT,
            "method": "template",
            "model": None,
            "referenceUsed": True,
            "referenceUrl": ARTICLE_URL,
        },
        "seoMeta": {
            "seoTitle": f"{title} para NEOGEO AES+ ({region})",
            "seoDescription": description[:157].rstrip() + "...",
            "coverAlt": f"Carátula de {title}, reedición {region_text} para NEOGEO AES+",
            "jsonLdDescription": description,
            "highlights": [
                "Reedición física en cartucho",
                "Lanzamiento: 12 de noviembre de 2026",
                f"Edición {region_text}",
            ],
            "generatedAt": FETCHED_AT,
            "method": "template",
            "model": None,
        },
    }


def save_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def canonical_slug(registry: dict, slug: str) -> str:
    return registry.get("slugToCanonical", {}).get(slug, slug)


def bump_index(
    index: dict,
    registry: dict,
    raw_entity: dict | None,
    game_id: str,
    *,
    role: str | None = None,
) -> None:
    if not raw_entity:
        return
    raw_slug = raw_entity["slug"]
    slug = canonical_slug(registry, raw_slug)
    registry_entity = registry.get("entities", {}).get(slug, {})
    entry = index.setdefault(
        slug,
        {
            "name": registry_entity.get("name") or raw_entity["name"],
            "slug": slug,
            "museumPath": raw_entity.get("museumPath") or "",
            "gameIds": [],
            "byPlatform": {},
            **({"asDeveloper": [], "asPublisher": []} if role else {}),
            "gameCount": 0,
        },
    )
    if game_id in entry["gameIds"]:
        return
    entry["gameIds"].append(game_id)
    entry["byPlatform"][PLATFORM_SLUG] = entry["byPlatform"].get(PLATFORM_SLUG, 0) + 1
    entry["gameCount"] = len(entry["gameIds"])
    if role == "developer":
        entry.setdefault("asDeveloper", []).append(game_id)
    elif role == "publisher":
        entry.setdefault("asPublisher", []).append(game_id)


def update_indexes(catalog_entries: list[dict], details: dict) -> tuple[int, int]:
    companies = json.loads((INDEX_DIR / "companies.json").read_text(encoding="utf-8"))
    genres = json.loads((INDEX_DIR / "genres.json").read_text(encoding="utf-8"))
    series = json.loads((INDEX_DIR / "series.json").read_text(encoding="utf-8"))
    company_registry = json.loads(
        (INDEX_DIR / "company-entities.json").read_text(encoding="utf-8")
    )
    genre_registry = json.loads(
        (INDEX_DIR / "genre-entities.json").read_text(encoding="utf-8")
    )

    if "plaion-replai" not in company_registry.get("entities", {}):
        company_registry.setdefault("entities", {})["plaion-replai"] = {
            "slug": "plaion-replai",
            "name": "PLAION REPLAI",
            "mergeMethod": "slug",
            "aliasSlugs": [],
            "aliasNames": [],
            "wikidataIds": [],
            "museumPaths": [],
        }
        company_registry["stats"]["entities"] = len(company_registry["entities"])
        company_registry["generatedAt"] = FETCHED_AT

    empty_registry = {"slugToCanonical": {}, "entities": {}}
    for game in catalog_entries:
        detail = details[game["id"]]
        bump_index(
            companies,
            company_registry,
            detail["developer"],
            game["id"],
            role="developer",
        )
        bump_index(
            companies,
            company_registry,
            detail["publisher"],
            game["id"],
            role="publisher",
        )
        for genre in detail["genres"]:
            bump_index(genres, genre_registry, genre, game["id"])
        bump_index(series, empty_registry, detail.get("series"), game["id"])

    save_json(INDEX_DIR / "companies.json", companies)
    save_json(INDEX_DIR / "genres.json", genres)
    save_json(INDEX_DIR / "series.json", series)
    save_json(INDEX_DIR / "company-entities.json", company_registry)
    return len(companies), len(genres)


def main() -> None:
    platforms = json.loads(PLATFORMS_FILE.read_text(encoding="utf-8"))
    platform = {
        "slug": PLATFORM_SLUG,
        "name": "NEOGEO AES+",
        "shortName": "AES+",
        "manufacturer": "snk",
        "status": "open",
        "estimatedCatalogSize": 20,
        "sortOrder": 16.5,
        "active": True,
        "newsEnabled": True,
        "description": (
            "Catálogo abierto de reediciones físicas oficiales para NEOGEO AES+, "
            "separadas en versiones Internacional y Japonesa."
        ),
    }
    platforms = [item for item in platforms if item.get("slug") != PLATFORM_SLUG]
    insert_at = next(
        (index + 1 for index, item in enumerate(platforms) if item.get("slug") == "neogeo"),
        len(platforms),
    )
    platforms.insert(insert_at, platform)

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    details = json.loads(DETAILS_FILE.read_text(encoding="utf-8"))
    target_ids = {
        f"{PLATFORM_SLUG}-{region_slug}-{game['slug']}"
        for game in GAMES
        for region_slug in ("international", "japanese")
    }
    catalog = [item for item in catalog if item.get("id") not in target_ids]
    seeded_entries = []
    for game in GAMES:
        for region in ("Internacional", "Japonesa"):
            entry = catalog_entry(game, region)
            catalog.append(entry)
            seeded_entries.append(entry)
            details[entry["id"]] = details_entry(game, region)

    index_companies, index_genres = update_indexes(seeded_entries, details)

    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    listed = [item for item in catalog if item.get("listingStatus") == "listed"]
    excluded = [item for item in catalog if item.get("listingStatus") == "excluded"]
    meta["catalogListed"] = len(listed)
    meta["catalogExcluded"] = len(excluded)
    meta["catalogTotal"] = len(catalog)
    meta.setdefault("listedByPlatform", {})[PLATFORM_SLUG] = len(target_ids)
    meta["gamesWithDetails"] = sum(
        1
        for item in listed
        if item["id"] in details
        and any(
            details[item["id"]].get(key) not in (None, "", [])
            for key in (
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
        )
    )
    meta["indexCompanies"] = index_companies
    meta["indexGenres"] = index_genres
    meta["lastNeoGeoAesPlusSeedAt"] = FETCHED_AT

    save_json(PLATFORMS_FILE, platforms)
    save_json(CATALOG_FILE, catalog)
    save_json(DETAILS_FILE, details)
    save_json(META_FILE, meta)
    print(f"NEOGEO AES+: {len(target_ids)} fichas publicadas en dos regiones")


if __name__ == "__main__":
    main()
