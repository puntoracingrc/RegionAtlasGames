#!/usr/bin/env python3
"""Importa Excel → catálogo maestro cerrado + colección de usuario."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
EXCEL = Path("/Users/macbookpro14/Downloads/CATALOGO_COMPLETO_PAL_ESPAÑA.xlsx")
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CATALOG_OUT = ROOT / "data" / "catalog.json"
COLLECTION_OUT = ROOT / "data" / "collection.json"
META_OUT = ROOT / "data" / "meta.json"

EXCEL_TO_SLUG = {
    "PS1": "ps1",
    "PS2": "ps2",
    "PS3": "ps3",
    "PS4": "ps4",
    "PS5": "ps5",
    "NES": "nes",
    "SNES": "snes",
    "N64": "n64",
    "GAME BOY": "gameboy",
    "GAMECUBE": "gamecube",
    "WII": "wii",
    "DS": "ds",
    "3DS": "3ds",
    "MEGA DRIVE": "megadrive",
    "32X": "sega32x",
    "SEGA 32X": "sega32x",
    "MEGA CD": "megacd",
    "MASTER SYSTEM": "mastersystem",
    "SATURN": "saturn",
    "DREAMCAST": "dreamcast",
    "GAME GEAR": "gamegear",
    "NEO GEO": "neogeo",
    "NEO GEO CD": "neogeocd",
    "NEO GEO POCKET": "neogeopocket",
    "NEO GEO POCKET COLOR": "neogeopocket",
}


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text))
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "juego"


def clean(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, str):
        v = value.strip()
        return v if v and v.lower() != "nan" else None
    return value


def num(value):
    v = clean(value)
    if v is None:
        return None
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def platform_slug(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().upper()
    return EXCEL_TO_SLUG.get(key, slugify(raw))


def catalog_key(platform: str, title: str) -> str:
    return f"{platform}-{slugify(title)}"


def market_fields(row) -> dict:
    rec = num(row.get("Precio Venta Recomendado (€)"))
    return {
        # min/máx solo los calcula sync_es_prices.py con anuncios verificados
        "marketMin": None,
        "marketMax": None,
        "recommendedPrice": rec,
        "pcRefPrice": num(row.get("Ref. PriceCharting EU (€)")),
        "deltaEsVsPc": num(row.get("Δ ES vs PC (%)")),
        "priceSource": clean(row.get("Fuente Precio")),
        "updatedAt": clean(row.get("Fecha Actualización")),
        "hasEsPrice": clean(row.get("Fuente Precio")) == "Wallapop/eBay ES",
    }


def main() -> None:
    platforms = json.loads(PLATFORMS_FILE.read_text(encoding="utf-8"))
    retro_slugs = {p["slug"] for p in platforms}
    df = pd.read_excel(EXCEL, sheet_name="TODO")

    catalog: dict[str, dict] = {}
    if CATALOG_OUT.exists():
        for game in json.loads(CATALOG_OUT.read_text(encoding="utf-8")):
            catalog[game["id"]] = game

    collection: list[dict] = []
    coll_slugs: dict[str, int] = {}

    for _, row in df.iterrows():
        title = clean(row.get("Título"))
        if not title or title.lower() == "título":
            continue

        plat = platform_slug(clean(row.get("Plataforma")))
        if not plat:
            continue

        in_retro = plat in retro_slugs
        cat_id = catalog_key(plat, title) if in_retro else None

        if in_retro and cat_id not in catalog:
            catalog[cat_id] = {
                "id": cat_id,
                "slug": slugify(title),
                "title": title,
                "titlePc": clean(row.get("Título PriceCharting")),
                "platformSlug": plat,
                "region": clean(row.get("Región")) or "PAL España",
                "edition": "standard",
                "listingStatus": "listed",
                "coverUrl": clean(row.get("URL Portada")),
                "pcId": num(row.get("ID PriceCharting")),
                "pcRegion": clean(row.get("Región PC")),
                "pcCondition": clean(row.get("Estado PriceCharting")),
                "matchConfidence": clean(row.get("Confianza Match")),
                **market_fields(row),
            }
        if in_retro and cat_id in catalog:
            existing = catalog[cat_id]
            incoming = market_fields(row)
            for key, val in incoming.items():
                if val is not None and (key != "hasEsPrice" or incoming["hasEsPrice"]):
                    existing[key] = val
            if clean(row.get("URL Portada")):
                existing["coverUrl"] = clean(row.get("URL Portada"))
            if clean(row.get("Título PriceCharting")):
                existing["titlePc"] = clean(row.get("Título PriceCharting"))
            if num(row.get("ID PriceCharting")):
                existing["pcId"] = num(row.get("ID PriceCharting"))
            existing["matchConfidence"] = clean(row.get("Confianza Match")) or existing.get("matchConfidence")
            existing["listingStatus"] = "listed"

        base = slugify(title)
        count = coll_slugs.get(base, 0)
        coll_slugs[base] = count + 1
        item_id = base if count == 0 else f"{base}-{count + 1}"

        qty = int(num(row.get("Cantidad")) or 1)
        rec = num(row.get("Precio Venta Recomendado (€)"))

        collection.append(
            {
                "id": item_id,
                "catalogId": cat_id,
                "inRetroCatalog": in_retro,
                "title": title,
                "platformSlug": plat,
                "region": clean(row.get("Región")) or "PAL España",
                "sealed": str(clean(row.get("Precintado")) or "").upper() == "SI",
                "quantity": qty,
                "quantityPc": num(row.get("Cantidad PC verificada")),
                "buyPrice": num(row.get("Precio Compra (€)")),
                "previousSalePrice": num(row.get("Precio Venta Anterior (€)")),
                "totalValue": round(rec * qty, 2) if rec else None,
                "notes": clean(row.get("Notas")),
                **market_fields(row),
            }
        )

    catalog_list = sorted(catalog.values(), key=lambda g: (g["platformSlug"], g["title"].lower()))

    listed_by_platform: dict[str, int] = {}
    for game in catalog_list:
        listed_by_platform[game["platformSlug"]] = listed_by_platform.get(game["platformSlug"], 0) + 1

    with_es = [c for c in collection if c["hasEsPrice"]]
    retro_collection = [c for c in collection if c["inRetroCatalog"]]

    meta = {
        "importedAt": pd.Timestamp.now().isoformat(),
        "source": str(EXCEL),
        "catalogScope": "retro-pal-es-closed",
        "platformCount": len(platforms),
        "catalogListed": len(catalog_list),
        "catalogEstimatedTotal": sum(p["estimatedCatalogSize"] for p in platforms),
        "listedByPlatform": listed_by_platform,
        "collection": {
            "totalItems": len(collection),
            "retroItems": len(retro_collection),
            "outOfScopeItems": len(collection) - len(retro_collection),
            "totalUnits": sum(c["quantity"] for c in collection),
            "withEsPrice": len(with_es),
            "pendingEsPrice": len(collection) - len(with_es),
            "totalRecommendedValue": round(sum(c["totalValue"] or 0 for c in with_es), 2),
            "totalBuyValue": round(
                sum((c["buyPrice"] or 0) * c["quantity"] for c in collection), 2
            ),
        },
    }

    CATALOG_OUT.write_text(
        json.dumps(catalog_list, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    COLLECTION_OUT.write_text(
        json.dumps(collection, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    META_OUT.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Catálogo maestro: {len(catalog_list)} juegos -> {CATALOG_OUT}")
    print(f"Colección demo: {len(collection)} ítems -> {COLLECTION_OUT}")
    print(f"Fuera de catálogo retro: {meta['collection']['outOfScopeItems']}")


if __name__ == "__main__":
    main()
