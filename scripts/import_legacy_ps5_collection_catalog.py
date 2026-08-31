#!/usr/bin/env python3
"""Recupera fichas PS5 del catálogo histórico de la colección.

La colección original conserva títulos, IDs y portadas que no entraron en la
apertura posterior del catálogo PS5. El script deduplica esas referencias,
descarga sus portadas y solo escribe el catálogo con ``--apply``.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
LEGACY_GAMES_FILE = ROOT / "data" / "games.json"
META_FILE = ROOT / "data" / "meta.json"
REPORT_FILE = ROOT / "data" / "catalog-seed-reports" / "legacy-collection-ps5-2026-08-31.json"
USER_AGENT = "RegionAtlas-LegacyPS5Catalog/1.0"

COVER_OVERRIDES = {
    "pneumata": "https://www.tradeinn.com/f/14101/141014054/playstation-ps5-pneumata.webp",
}

TITLE_OVERRIDES = {
    "atelier-yumia-la-alquimista-de-los-recuerdos-y": "Atelier Yumia: The Alchemist Of Memories & The Envisioned Land",
    "blasphemous-ii-limited-collector-s-edition": "Blasphemous II [Collector's Edition]",
    "conscript": "Conscript [Deluxe Edition]",
    "cristales": "Cris Tales",
    "daymare-1994-sandcatle": "Daymare: 1994 Sandcastle",
    "demon-slayer": "Demon Slayer -Kimetsu No Yaiba- Sweep The Board",
    "dollhouse": "Dollhouse: Behind The Broken Mirror",
    "evil-nun": "Evil Nun: The Broken Mask [Unholy Edition]",
    "greak": "Greak: Memories Of Azur",
    "gris": "Gris [Deluxe Edition]",
    "halloween-ash-vs-evil": "Halloween And Ash Vs Evil Dead RetroRealms Double Feature",
    "horro-tales-the-beggar": "Horror Tales: The Beggar",
    "insomnis": "Insomnis: Enhanced Edition",
    "maid-of-sker": "Maid of Sker [Limited Run]",
    "neon-blood": "Neon Blood: Limited Edition",
    "neva": "Neva [Deluxe Edition]",
    "outer-wilds-archeologist-edition": "Outer Wilds [Archaeologist Edition]",
    "persona-3-reload-edicion-coleccionista": "Persona 3 Reload [Collector's Edition]",
    "rachet-and-clank-una-dimension-aparte": "Ratchet & Clank: Rift Apart",
    "reynatis": "Reynatis: Deluxe Edition",
    "shin-megami-tensei-v-vengeance-launch-editio": "Shin Megami Tensei V Vengeance [Launch Edition]",
    "stories-from-sol": "Stories From Sol: The Gun-Dog",
    "synduality": "Synduality: Echo Of Ada",
    "the-bridge-curse-2": "The Bridge Curse 2: The Extrication",
    "the-gap": "The Gap: Limited Edition",
    "the-last-faith": "The Last Faith [The Nycrux Edition]",
    "the-last-of-us-parte-1": "The Last of Us Part I",
    "the-legend-of-heroes-daybreak-ii": "Legend Of Heroes: Trails Through Daybreak II [Deluxe Edition]",
}

VARIANT_WORDS = {
    "collector",
    "collectors",
    "coleccionista",
    "deluxe",
    "launch",
    "lenticular",
    "limited",
    "special",
    "steelbook",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(value, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def slugify(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "juego"


def words(value: object) -> set[str]:
    return set(slugify(value).split("-"))


def numeric_id(value: object) -> int | None:
    try:
        number = float(str(value))
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() and number > 0 else None


def candidate_title(row: dict[str, Any]) -> str:
    return str(row.get("titlePc") or row.get("title") or "").strip()


def representative_score(row: dict[str, Any], canonical_title: str) -> tuple[int, int, int]:
    source_words = words(row.get("title"))
    canonical_words = words(canonical_title)
    extra_variants = len((source_words & VARIANT_WORDS) - (canonical_words & VARIANT_WORDS))
    distance = len(source_words.symmetric_difference(canonical_words))
    missing_cover = 0 if str(row.get("coverUrl") or "").startswith("https://") else 1
    return extra_variants, distance, missing_cover


def legacy_candidates(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        platform = str(row.get("platformSlug") or row.get("platform") or "").lower()
        title = candidate_title(row)
        if platform != "ps5" or not title:
            continue
        grouped.setdefault(slugify(title), []).append(row)

    candidates: list[dict[str, Any]] = []
    for legacy_key, group in grouped.items():
        title = TITLE_OVERRIDES.get(legacy_key, candidate_title(group[0]))
        representative = min(group, key=lambda row: representative_score(row, title))
        cover_url = COVER_OVERRIDES.get(
            legacy_key,
            str(representative.get("coverUrl") or "").strip(),
        )
        if not cover_url.startswith("https://"):
            continue
        candidates.append(
            {
                "key": slugify(title),
                "legacyKey": legacy_key,
                "title": title,
                "representative": representative,
                "coverSourceUrl": cover_url,
                "sourceRows": len(group),
            }
        )
    return sorted(candidates, key=lambda item: item["title"].casefold())


def existing_indexes(catalog: list[dict[str, Any]]) -> tuple[set[str], set[int]]:
    titles: set[str] = set()
    pc_ids: set[int] = set()
    for game in catalog:
        if game.get("platformSlug") != "ps5" or game.get("listingStatus") == "excluded":
            continue
        titles.update(slugify(value) for value in (game.get("title"), game.get("titlePc")) if value)
        pc_id = numeric_id(game.get("pcId"))
        if pc_id is not None:
            pc_ids.add(pc_id)
    return titles, pc_ids


def new_candidates(catalog: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    titles, pc_ids = existing_indexes(catalog)
    result: list[dict[str, Any]] = []
    for candidate in candidates:
        pc_id = numeric_id(candidate["representative"].get("pcId"))
        if candidate["key"] in titles or (pc_id is not None and pc_id in pc_ids):
            continue
        result.append(candidate)
    return result


def download_cover(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="JPEG", quality=88, optimize=True)


def prepare_covers(candidates: list[dict[str, Any]], covers_root: Path) -> None:
    failures: list[str] = []
    for index, candidate in enumerate(candidates, start=1):
        destination = covers_root / "ps5" / f"{candidate['key']}.jpg"
        if destination.is_file() and destination.stat().st_size > 512:
            continue
        try:
            download_cover(candidate["coverSourceUrl"], destination)
        except Exception as exc:  # noqa: BLE001 - informe por portada
            failures.append(f"{candidate['title']}: {exc}")
        if index % 20 == 0 or index == len(candidates):
            print(f"  portadas {index}/{len(candidates)}")
    if failures:
        raise SystemExit("Fallaron portadas:\n" + "\n".join(failures[:20]))


def catalog_entry(candidate: dict[str, Any], collected_at: str) -> dict[str, Any]:
    row = candidate["representative"]
    title = candidate["title"]
    pc_id = numeric_id(row.get("pcId"))
    has_price = bool(row.get("hasEsPrice")) and row.get("recommendedPrice") is not None
    edition = "collector" if words(title) & {"collector", "collectors", "coleccionista"} else "standard"
    return {
        "id": f"ps5-{candidate['key']}",
        "slug": candidate["key"],
        "title": title,
        "titlePc": str(row.get("titlePc") or title),
        "platformSlug": "ps5",
        "region": "PAL España",
        "physicalVariant": None,
        "edition": edition,
        "listingStatus": "listed",
        "coverUrl": f"/covers/ps5/{candidate['key']}.jpg",
        "pcPath": None,
        "pcId": pc_id,
        "pcRegion": row.get("pcRegion"),
        "pcCondition": row.get("pcCondition"),
        "matchConfidence": "LEGACY_COLLECTION_EXACT",
        "marketMin": row.get("marketMin") if has_price else None,
        "marketMax": row.get("marketMax") if has_price else None,
        "recommendedPrice": row.get("recommendedPrice") if has_price else None,
        "pcRefPrice": row.get("pcRefPrice"),
        "deltaEsVsPc": row.get("deltaEsVsPc"),
        "priceSource": "provisional_collection_history" if has_price else None,
        "updatedAt": row.get("updatedAt") or collected_at[:10],
        "hasEsPrice": has_price,
        "priceRegionVerified": False,
        "seedSource": "legacy-collection-ps5",
        "regionEvidence": ["user_collection_pal_es_import"],
        "regionVerified": False,
    }


def update_meta(meta: dict[str, Any], catalog: list[dict[str, Any]], collected_at: str) -> None:
    listed = [game for game in catalog if game.get("listingStatus") != "excluded"]
    counts = Counter(str(game.get("platformSlug") or "") for game in listed)
    meta["catalogTotal"] = len(catalog)
    meta["catalogListed"] = len(listed)
    meta["catalogExcluded"] = len(catalog) - len(listed)
    meta["listedByPlatform"] = dict(sorted(counts.items()))
    meta["catalogWithCover"] = sum(bool(game.get("coverUrl")) for game in catalog)
    meta["catalogWithLocalCover"] = sum(
        str(game.get("coverUrl") or "").startswith("/covers/") for game in catalog
    )
    meta["coversListed"] = sum(bool(game.get("coverUrl")) for game in listed)
    meta["coversLocal"] = sum(
        str(game.get("coverUrl") or "").startswith("/covers/") for game in listed
    )
    meta["coversListedPct"] = round(meta["coversListed"] * 100 / max(1, len(listed)), 1)
    meta["lastLegacyCollectionCatalogImportAt"] = collected_at


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Escribir catálogo, metadatos e informe")
    parser.add_argument("--covers-root", type=Path, help="Preparar/verificar las portadas en esta carpeta")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE)
    legacy = load_json(LEGACY_GAMES_FILE)
    candidates = legacy_candidates(legacy)
    additions = new_candidates(catalog, candidates)

    print(f"Candidatas únicas con portada: {len(candidates)}")
    print(f"Ya existentes en catálogo: {len(candidates) - len(additions)}")
    print(f"Nuevas fichas PS5: {len(additions)}")

    if args.covers_root:
        prepare_covers(additions, args.covers_root.expanduser())
        print(f"Portadas preparadas en {args.covers_root.expanduser() / 'ps5'}")

    if not args.apply:
        print("Vista previa: usa --apply para escribir los datos.")
        return
    if not args.covers_root:
        raise SystemExit("--apply exige --covers-root para verificar las portadas antes de publicar.")
    missing = [
        candidate["title"]
        for candidate in additions
        if not (args.covers_root.expanduser() / "ps5" / f"{candidate['key']}.jpg").is_file()
    ]
    if missing:
        raise SystemExit(f"Faltan {len(missing)} portadas preparadas.")

    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    entries = [catalog_entry(candidate, collected_at) for candidate in additions]
    merged = catalog + entries
    meta = load_json(META_FILE)
    update_meta(meta, merged, collected_at)
    report = {
        "platformSlug": "ps5",
        "collectedAt": collected_at,
        "legacyRows": sum(
            str(row.get("platformSlug") or row.get("platform") or "").lower() == "ps5"
            for row in legacy
        ),
        "uniqueCandidates": len(candidates),
        "alreadyPresent": len(candidates) - len(additions),
        "added": len(entries),
        "withPricechartingId": sum(entry.get("pcId") is not None for entry in entries),
        "withCover": len(entries),
        "catalogPs5Listed": meta["listedByPlatform"].get("ps5", 0),
        "catalogTotal": len(merged),
        "catalogIds": [entry["id"] for entry in entries],
    }
    save_json(CATALOG_FILE, merged)
    save_json(META_FILE, meta)
    save_json(REPORT_FILE, report)
    print(f"Catálogo actualizado: +{len(entries)} fichas PS5")


if __name__ == "__main__":
    main()
