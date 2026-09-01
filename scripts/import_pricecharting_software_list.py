#!/usr/bin/env python3
"""Importa una lista de software de PriceCharting sin mezclar sus precios USD con EUR.

La lista pegada aporta los títulos y precios de referencia. La página pública se
usa únicamente para resolver el ID, la ruta y la imagen de cada ficha. Las
portadas se descargan, se rasterizan de nuevo y se guardan con el slug interno:
no conservan EXIF, comentarios ni nombres procedentes del proveedor.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
USER_AGENT = "RegionAtlas-CatalogImport/1.0"
PAGE_SIZE = 150
CANVAS_SIZE = (1000, 1400)
MAX_IMAGE_BYTES = 24 * 1024 * 1024
MONEY_QUANT = Decimal("0.01")


# Duplicado técnico del mismo producto estándar. Se mantiene la ficha canónica.
SKIP_PC_IDS: dict[int, str] = {
    8741598: "duplicado técnico de Jets'n'Guns 2 (6330502)",
    12789731: "duplicado técnico de Aggelos II (14218825)",
    6074032: "duplicado técnico de Fight'N Rage (5551873)",
    14033382: "duplicado técnico de Civilization Revolution (47271)",
}

# La Day One usa la misma portada frontal que la edición estándar y la ficha de
# origen no aporta imagen. Se reutiliza la carátula estándar y se vuelve a
# rasterizar con el mismo proceso de limpieza que el resto.
COVER_SOURCE_FALLBACKS: dict[int, int] = {
    6574230: 4695520,
}

# Algunas fichas regionales no tienen imagen en PriceCharting. Solo se usan
# fuentes alternativas cuando la edición y la carátula se han comprobado.
COVER_SOURCE_OVERRIDES: dict[int, str] = {
    91300: (
        "https://www.voxgaming.fr/img/image.php?"
        "k=tqpUtkYFFJDQkYNr9p-wBhRUnqk9-M7wSVEsX32MVPuVrDnRDLNTVt7tCKdWrewP7eXgi7V0G59zTsSHOeDlE1wX-tYbbVrbHcwewP7Xzw"
    ),
}

# Equivalencias revisadas donde GAME España usa traducción o una grafía distinta.
PC_ID_ALIASES: dict[int, str] = {
    5037241: "ps3-skylanders-spyro-s-adventure-ps3-pack-de-inicio",
    6073318: "ps3-skylanders-super-chargers-ps3-pack-de-inicio",
    6073312: "ps3-skylanders-trap-team-ps3-pack-de-inicio",
    7308807: "ps5-3d-minigolf",
    11282053: "ps5-barbie-rutas-a-caballo",
    6021372: "ps5-bluey-el-videojuego",
    13064604: "ps5-darksiders-warmastered",
    11351670: "ps5-final-fantasy-vii-remake-intergrade-rebirth-twin-pack-physical-edition",
    13574642: "ps5-formation-z",
    13942855: "ps5-formation-z-deluxe-edition",
    8136925: "ps5-harry-potter-campeones-de-quidditch-deluxe-edition",
    6167018: "ps5-koa-and-the-five-pirates-of-mara-edicion-coleccionista",
    2263079: "ps5-marvel-s-spider-man-miles-morales",
    4933744: "ps5-monster-energy-supercross-the-official-videogame-4",
    7126705: "ps5-mr-run-jump-kombinera-adrenaline",
    8042518: "ps5-tape-director-s-edition",
    13530347: "ps5-the-adventures-of-elliot-the-millennium-tales",
    6859515: "ps5-tomb-raider-i-ii-iii-remastered",
    11046874: "ps5-tomb-raider-iv-vi-remastered-starring-lara-croft",
    12645726: "ps5-wizman-s-world-retry",
}

# Fichas técnicas importadas que duplican una ficha española ya usada por la
# colección. Al resolver el alias se conservan los IDs españoles y se retiran
# estas copias del catálogo público.
PC_ID_DISPLACED_DUPLICATES: dict[int, str] = {
    5037241: "ps3-skylanders-spyro%27s-adventure-starter-pack",
    6073318: "ps3-skylanders-superchargers-starter-pack",
    6073312: "ps3-skylanders-trap-team-starter-pack",
}

TITLE_ALIASES: dict[str, str] = {
    "Gabby's Dollhouse: Ready To Party": (
        "ps5-dreamworks-la-casa-de-munecas-de-gabby-listos-para-la-fiesta"
    ),
    "Ghost Of Tsushima: Director's Cut": "ps5-ghost-of-tsushima-directors-cut",
    "My Little Pony: A Zephyr Heights Mystery": (
        "ps5-my-little-pony-misterio-en-los-altos-de-cefiro"
    ),
    "MySims: Cozy Bundle": "ps5-mysims-coleccion-sofa-y-mantita",
    "Uncharted: Legacy of Thieves Collection": (
        "ps5-uncharted-coleccion-legado-de-los-ladrones"
    ),
}


@dataclass(frozen=True)
class SourceRow:
    title: str
    loose_usd: Decimal | None
    cib_usd: Decimal | None
    new_usd: Decimal | None


@dataclass(frozen=True)
class LiveRow:
    title: str
    pc_id: int
    pc_path: str
    cover_source_url: str | None


@dataclass(frozen=True)
class CoverTask:
    catalog_id: str
    title: str
    source_url: str
    destination: Path


def slugify(text: str) -> str:
    value = unicodedata.normalize("NFKD", str(text))
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "juego"


def normalize_title(text: str | None) -> str:
    value = html.unescape(str(text or "")).translate(
        str.maketrans(
            {
                "’": "",
                "‘": "",
                "´": "",
                "'": "",
                "`": "",
                "–": "-",
                "—": "-",
                "®": "",
                "™": "",
            }
        )
    )
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = value.replace("&", " and ")
    value = re.sub(r"\b(edicion|edition)\s+standard\b", " ", value)
    value = re.sub(r"\bstandard\s+(edicion|edition)\b", " ", value)
    value = re.sub(r"\bvol\.?\b", "volume", value)
    value = re.sub(r"\bcollectors\b", "collector", value)
    for roman, number in (
        ("viii", "8"),
        ("vii", "7"),
        ("vi", "6"),
        ("iv", "4"),
        ("iii", "3"),
        ("ii", "2"),
    ):
        value = re.sub(rf"\b{roman}\b", number, value)
    value = re.sub(r"\by\b", " and ", value)
    value = re.sub(r"\b(the|a|an)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def clean_source_title(text: str) -> str:
    return re.sub(r"\s+/\d+$", "", text.strip())


def parse_money(raw: str) -> Decimal | None:
    value = raw.strip().replace("$", "").replace(",", "")
    return Decimal(value) if value else None


def decimal_number(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))


def usd_to_eur(value: Decimal | None, usd_per_eur: Decimal) -> float | None:
    if value is None:
        return None
    if usd_per_eur <= 0:
        raise ValueError("La tasa USD por EUR debe ser mayor que cero")
    return decimal_number(value / usd_per_eur)


def parse_source_rows(path: Path) -> list[SourceRow]:
    rows: list[SourceRow] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.startswith("\t"):
            continue
        parts = line.split("\t")
        if len(parts) < 5:
            continue
        title = clean_source_title(parts[1])
        price_cells = parts[2:5]
        looks_like_row = title and all(not cell or cell.startswith("$") for cell in price_cells)
        if not looks_like_row:
            continue
        try:
            rows.append(
                SourceRow(
                    title=title,
                    loose_usd=parse_money(price_cells[0]),
                    cib_usd=parse_money(price_cells[1]),
                    new_usd=parse_money(price_cells[2]),
                )
            )
        except Exception as exc:  # noqa: BLE001 - contexto de la fila para el operador
            raise ValueError(f"Precio no válido en la línea {line_number}: {line}") from exc
    if not rows:
        raise ValueError(f"No se encontraron filas de software en {path}")
    return rows


def fetch_page(pc_console: str, cursor: int, release_date: str) -> str:
    url = f"https://www.pricecharting.com/console/{pc_console}"
    fields = {
        "sort": "highest-price",
        "when": "none",
        "release-date": release_date,
        "exclude-variants": "false",
        "exclude-hardware": "true",
    }
    if cursor:
        fields["cursor"] = str(cursor)
        request = urllib.request.Request(
            url,
            data=urllib.parse.urlencode(fields).encode("utf-8"),
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
    else:
        request = urllib.request.Request(
            f"{url}?{urllib.parse.urlencode(fields)}",
            headers={"User-Agent": USER_AGENT},
        )
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="ignore")


def parse_live_page(page_html: str) -> list[LiveRow]:
    rows: list[LiveRow] = []
    for match in re.finditer(r'<tr id="product-(\d+)"[\s\S]*?</tr>', page_html):
        block = match.group(0)
        title_match = re.search(
            r'<td class="title"[^>]*>[\s\S]*?<a href="([^"]+)">([\s\S]*?)</a>',
            block,
        )
        if not title_match:
            continue
        image_cell = re.search(r'<td class="image">([\s\S]*?)</td>', block)
        image_url: str | None = None
        if image_cell:
            image_match = re.search(
                r'<img[^>]+(?:data-src|src)="([^"]+)"', image_cell.group(1)
            )
            if image_match:
                image_url = html.unescape(image_match.group(1)).strip()
                if not image_url.startswith(("http://", "https://")):
                    image_url = None
                else:
                    image_url = re.sub(r"/\d+\.jpg(?:\?.*)?$", "/1600.jpg", image_url)
        title_html = re.sub(r"<[^>]+>", "", title_match.group(2))
        rows.append(
            LiveRow(
                title=html.unescape(title_html).strip(),
                pc_id=int(match.group(1)),
                pc_path=html.unescape(title_match.group(1)).strip(),
                cover_source_url=image_url,
            )
        )
    return rows


def crawl_live_rows(pc_console: str, release_date: str) -> list[LiveRow]:
    rows: list[LiveRow] = []
    for cursor in range(0, PAGE_SIZE * 120, PAGE_SIZE):
        page_html = fetch_page(pc_console, cursor, release_date)
        page_rows = parse_live_page(page_html)
        if not page_rows:
            break
        rows.extend(page_rows)
        print(f"  página {cursor // PAGE_SIZE + 1}: {len(page_rows)} ({len(rows)} total)")
        if len(page_rows) < PAGE_SIZE:
            break
        time.sleep(0.35)
    return rows


def load_live_rows(cache_path: Path | None, pc_console: str, release_date: str) -> list[LiveRow]:
    if cache_path and cache_path.is_file():
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
        return [
            LiveRow(
                title=str(row["title"]),
                pc_id=int(row["pcId"]),
                pc_path=str(row["pcPath"]),
                cover_source_url=(
                    str(row["coverSourceUrl"])
                    if str(row.get("coverSourceUrl") or "").startswith(("http://", "https://"))
                    else None
                ),
            )
            for row in raw
        ]
    rows = crawl_live_rows(pc_console, release_date)
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps(
                [
                    {
                        "title": row.title,
                        "pcId": row.pc_id,
                        "pcPath": row.pc_path,
                        "coverSourceUrl": row.cover_source_url,
                    }
                    for row in rows
                ],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    return rows


def apply_cover_fallbacks(rows: list[LiveRow]) -> list[LiveRow]:
    by_id = {row.pc_id: row for row in rows}
    resolved: list[LiveRow] = []
    for row in rows:
        fallback_id = COVER_SOURCE_FALLBACKS.get(row.pc_id)
        fallback = by_id.get(fallback_id) if fallback_id else None
        cover_url = (
            row.cover_source_url
            or COVER_SOURCE_OVERRIDES.get(row.pc_id)
            or (fallback.cover_source_url if fallback else None)
        )
        resolved.append(
            LiveRow(
                title=row.title,
                pc_id=row.pc_id,
                pc_path=row.pc_path,
                cover_source_url=cover_url,
            )
        )
    return resolved


def join_source_and_live(source_rows: list[SourceRow], live_rows: list[LiveRow]) -> list[tuple[SourceRow, LiveRow]]:
    exact: dict[str, deque[LiveRow]] = defaultdict(deque)
    normalized: dict[str, deque[LiveRow]] = defaultdict(deque)
    for row in live_rows:
        exact[row.title].append(row)
        normalized[normalize_title(row.title)].append(row)

    joined: list[tuple[SourceRow, LiveRow]] = []
    used_ids: set[int] = set()
    missing: list[str] = []
    for source in source_rows:
        live: LiveRow | None = None
        while exact[source.title] and exact[source.title][0].pc_id in used_ids:
            exact[source.title].popleft()
        if exact[source.title]:
            live = exact[source.title].popleft()
        else:
            key = normalize_title(source.title)
            candidates = [row for row in normalized[key] if row.pc_id not in used_ids]
            if len(candidates) == 1:
                live = candidates[0]
        if not live:
            missing.append(source.title)
            continue
        used_ids.add(live.pc_id)
        joined.append((source, live))
    if missing:
        preview = "\n".join(f"  - {title}" for title in missing[:20])
        raise ValueError(f"No se resolvieron {len(missing)} títulos contra la tabla pública:\n{preview}")
    return joined


def path_slug(pc_path: str) -> str:
    tail = urllib.parse.unquote(pc_path.rsplit("/", 1)[-1])
    return slugify(tail)


def allocate_slug(title: str, id_prefix: str, used_ids: set[str]) -> str:
    base = slugify(title)
    candidate = base
    suffix = 2
    while f"{id_prefix}-{candidate}" in used_ids:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def cover_filename(game: dict[str, Any], id_prefix: str, platform: str) -> str:
    prefix = ""
    if id_prefix != platform:
        prefix = f"{id_prefix.removeprefix(f'{platform}-')}-"
    return f"{prefix}{game['slug']}.jpg"


def infer_edition(title: str) -> str:
    words = set(normalize_title(title).split())
    return "collector" if "collector" in words else "standard"


def choose_existing(
    live: LiveRow,
    platform: str,
    region: str,
    catalog_by_id: dict[str, dict[str, Any]],
    by_pc_id: dict[int, dict[str, Any]],
    by_pc_path: dict[str, dict[str, Any]],
    by_title: dict[str, list[dict[str, Any]]],
    claimed_catalog_ids: set[str],
) -> tuple[dict[str, Any] | None, str]:
    alias_id = PC_ID_ALIASES.get(live.pc_id) or TITLE_ALIASES.get(live.title)
    alias = catalog_by_id.get(alias_id or "")
    if (
        alias
        and alias.get("platformSlug") == platform
        and alias.get("region") == region
        and str(alias["id"]) not in claimed_catalog_ids
    ):
        return alias, "reviewed_alias"

    pc_id_match = by_pc_id.get(live.pc_id)
    if pc_id_match and str(pc_id_match["id"]) not in claimed_catalog_ids:
        return pc_id_match, "pc_id"
    pc_path_match = by_pc_path.get(live.pc_path)
    if pc_path_match and str(pc_path_match["id"]) not in claimed_catalog_ids:
        return pc_path_match, "pc_path"

    candidates = [
        game
        for game in by_title.get(normalize_title(live.title), [])
        if str(game["id"]) not in claimed_catalog_ids
    ]
    if len(candidates) == 1:
        return candidates[0], "normalized_title"
    if len(candidates) > 1:
        expected_id = f"{platform}-{path_slug(live.pc_path)}"
        exact_slug = [game for game in candidates if game.get("id") == expected_id]
        if len(exact_slug) == 1:
            return exact_slug[0], "normalized_title_and_slug"
    return None, "new"


def make_game(
    source: SourceRow,
    live: LiveRow,
    platform: str,
    region: str,
    pc_region: str,
    slug: str,
    collected_at: str,
    *,
    id_prefix: str,
    seed_source: str,
    region_evidence: str,
    region_verified: bool,
    match_confidence: str,
    museum_region: str | None,
) -> dict[str, Any]:
    game = {
        "id": f"{id_prefix}-{slug}",
        "slug": slug,
        "title": source.title,
        "titlePc": live.title,
        "platformSlug": platform,
        "region": region,
        "physicalVariant": None,
        "edition": infer_edition(source.title),
        "listingStatus": "listed",
        "coverUrl": None,
        "pcPath": live.pc_path,
        "pcId": live.pc_id,
        "pcRegion": pc_region,
        "pcCondition": None,
        "matchConfidence": match_confidence,
        "marketMin": None,
        "marketMax": None,
        "recommendedPrice": None,
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": None,
        "updatedAt": collected_at[:10],
        "hasEsPrice": False,
        "priceRegionVerified": False,
        "seedSource": seed_source,
        "regionEvidence": [region_evidence],
        "regionVerified": region_verified,
    }
    if museum_region:
        game["museumRegion"] = museum_region
    return game


def apply_usd_condition_prices(
    game: dict[str, Any],
    source: SourceRow,
    *,
    usd_per_eur: Decimal,
    exchange_rate_date: str,
    collected_at: str,
) -> bool:
    raw_prices = {
        "priceChartingLooseUsd": decimal_number(source.loose_usd),
        "priceChartingCompleteUsd": decimal_number(source.cib_usd),
        "priceChartingSealedUsd": decimal_number(source.new_usd),
    }
    converted_prices = {
        "estimatedPriceLoose": usd_to_eur(source.loose_usd, usd_per_eur),
        "estimatedPriceComplete": usd_to_eur(source.cib_usd, usd_per_eur),
        "estimatedPriceSealed": usd_to_eur(source.new_usd, usd_per_eur),
    }
    metadata: dict[str, Any] = {
        "priceChartingCurrency": "USD",
        "priceChartingUsdPerEur": float(usd_per_eur),
        "priceChartingExchangeRateDate": exchange_rate_date,
        "priceChartingCollectedAt": collected_at,
    }
    changed = False
    for key, value in {**raw_prices, **metadata}.items():
        if game.get(key) != value:
            game[key] = value
            changed = True
    for key, value in converted_prices.items():
        if value is not None and game.get(key) != value:
            game[key] = value
            changed = True

    primary = (
        converted_prices["estimatedPriceComplete"]
        or converted_prices["estimatedPriceLoose"]
        or converted_prices["estimatedPriceSealed"]
    )
    if primary is not None:
        for key in ("recommendedPrice", "pcRefPrice"):
            if game.get(key) is None:
                game[key] = primary
                changed = True
        if game.get("priceSource") is None:
            game["priceSource"] = "PriceCharting USA, convertido a EUR con referencia BCE"
            changed = True
        sources = [
            value.strip()
            for value in str(game.get("priceDataSources") or "").split(",")
            if value.strip()
        ]
        if "PriceCharting USA" not in sources:
            sources.append("PriceCharting USA")
            game["priceDataSources"] = ", ".join(sources)
            changed = True
    return changed


def merge_catalog(
    catalog: list[dict[str, Any]],
    joined_rows: list[tuple[SourceRow, LiveRow]],
    *,
    platform: str,
    region: str,
    pc_region: str,
    collected_at: str,
    covers_root: Path | None,
    id_prefix: str | None = None,
    seed_source: str = "pricecharting-user-list",
    region_evidence: str = "pricecharting_catalog",
    region_verified: bool = False,
    match_confidence: str = "SEED_PC",
    museum_region: str | None = None,
    usd_per_eur: Decimal | None = None,
    exchange_rate_date: str | None = None,
    promote_matched_excluded: bool = False,
) -> tuple[list[dict[str, Any]], list[CoverTask], dict[str, Any]]:
    id_prefix = id_prefix or platform
    platform_games = [
        game
        for game in catalog
        if game.get("platformSlug") == platform and game.get("region") == region
    ]
    catalog_by_id = {str(game["id"]): game for game in catalog}
    by_pc_id = {
        int(game["pcId"]): game
        for game in platform_games
        if str(game.get("pcId") or "").isdigit()
    }
    by_pc_path = {
        str(game["pcPath"]): game for game in platform_games if game.get("pcPath")
    }
    by_title: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for game in platform_games:
        for value in (game.get("title"), game.get("titlePc")):
            if value:
                key = normalize_title(str(value))
                if game not in by_title[key]:
                    by_title[key].append(game)

    used_ids = set(catalog_by_id)
    cover_tasks: list[CoverTask] = []
    match_reasons: Counter[str] = Counter()
    added = 0
    updated = 0
    promoted = 0
    retired_duplicates = 0
    skipped: list[dict[str, Any]] = []
    missing_cover_sources: list[dict[str, str]] = []
    source_price_counts = Counter()
    claimed_catalog_ids: set[str] = set()

    for source, live in joined_rows:
        source_price_counts.update(
            {
                "loose": int(source.loose_usd is not None),
                "cib": int(source.cib_usd is not None),
                "new": int(source.new_usd is not None),
            }
        )
        if live.pc_id in SKIP_PC_IDS:
            skipped.append(
                {"pcId": live.pc_id, "title": source.title, "reason": SKIP_PC_IDS[live.pc_id]}
            )
            continue

        existing, reason = choose_existing(
            live,
            platform,
            region,
            catalog_by_id,
            by_pc_id,
            by_pc_path,
            by_title,
            claimed_catalog_ids,
        )
        match_reasons[reason] += 1
        if existing:
            changed = False
            displaced_id = PC_ID_DISPLACED_DUPLICATES.get(live.pc_id)
            displaced = catalog_by_id.get(displaced_id or "")
            if (
                reason == "reviewed_alias"
                and displaced
                and displaced is not existing
                and displaced.get("platformSlug") == platform
                and displaced.get("region") == region
            ):
                displaced_changed = displaced.get("listingStatus") != "excluded" or any(
                    displaced.get(key) is not None for key in ("pcId", "pcPath", "pcRegion")
                )
                displaced["listingStatus"] = "excluded"
                displaced["pcId"] = None
                displaced["pcPath"] = None
                displaced["pcRegion"] = None
                claimed_catalog_ids.add(str(displaced["id"]))
                if displaced_changed:
                    displaced["updatedAt"] = collected_at[:10]
                    retired_duplicates += 1
            if promote_matched_excluded and existing.get("listingStatus") == "excluded":
                existing["listingStatus"] = "listed"
                changed = True
                promoted += 1
            # La lista regional es la autoridad para la identidad del producto.
            for key, value in (
                ("pcId", live.pc_id),
                ("pcPath", live.pc_path),
                ("pcRegion", pc_region),
            ):
                if existing.get(key) != value:
                    existing[key] = value
                    changed = True
            if existing.get("titlePc") in (None, ""):
                existing["titlePc"] = live.title
                changed = True
            game = existing
        else:
            slug = allocate_slug(source.title, id_prefix, used_ids)
            game = make_game(
                source,
                live,
                platform,
                region,
                pc_region,
                slug,
                collected_at,
                id_prefix=id_prefix,
                seed_source=seed_source,
                region_evidence=region_evidence,
                region_verified=region_verified,
                match_confidence=match_confidence,
                museum_region=museum_region,
            )
            catalog.append(game)
            catalog_by_id[game["id"]] = game
            used_ids.add(game["id"])
            by_pc_id[live.pc_id] = game
            by_pc_path[live.pc_path] = game
            by_title[normalize_title(source.title)].append(game)
            added += 1
            changed = False
        claimed_catalog_ids.add(str(game["id"]))

        if usd_per_eur is not None:
            if not exchange_rate_date:
                raise ValueError("La importación de precios USD requiere fecha de cambio")
            changed = apply_usd_condition_prices(
                game,
                source,
                usd_per_eur=usd_per_eur,
                exchange_rate_date=exchange_rate_date,
                collected_at=collected_at,
            ) or changed
        if existing and changed:
            game["updatedAt"] = collected_at[:10]
            updated += 1

        if live.cover_source_url and covers_root:
            filename = cover_filename(game, id_prefix, platform)
            expected_cover_url = f"/covers/{platform}/{filename}"
        else:
            expected_cover_url = None
        managed_cover = not game.get("coverUrl") or game.get("seedSource") == seed_source
        if (
            live.cover_source_url
            and covers_root
            and managed_cover
            and game.get("coverUrl") != expected_cover_url
        ):
            cover_tasks.append(
                CoverTask(
                    catalog_id=str(game["id"]),
                    title=str(game["title"]),
                    source_url=live.cover_source_url,
                    destination=covers_root / platform / filename,
                )
            )
        elif not game.get("coverUrl") and not live.cover_source_url:
            missing_cover_sources.append(
                {
                    "catalogId": str(game["id"]),
                    "title": str(game["title"]),
                    "error": "la tabla de origen no aporta imagen",
                }
            )

    stats = {
        "sourceRows": len(joined_rows),
        "added": added,
        "updated": updated,
        "promoted": promoted,
        "retiredDuplicates": retired_duplicates,
        "skipped": skipped,
        "missingCoverSources": missing_cover_sources,
        "matchReasons": dict(sorted(match_reasons.items())),
        "sourcePriceRows": dict(source_price_counts),
        "priceMode": "usd_to_eur" if usd_per_eur is not None else "identity_only",
        "usdPerEur": float(usd_per_eur) if usd_per_eur is not None else None,
        "exchangeRateDate": exchange_rate_date,
    }
    return catalog, cover_tasks, stats


def cover_is_clean(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 512:
        return False
    raw = path.read_bytes()
    if b"pricecharting" in raw.lower():
        return False
    try:
        with Image.open(io.BytesIO(raw)) as image:
            return image.size == CANVAS_SIZE and not image.getexif()
    except Exception:
        return False


def save_clean_cover(raw: bytes, destination: Path) -> None:
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError(f"imagen de {len(raw)} bytes; supera el máximo")
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        oriented = ImageOps.exif_transpose(source).convert("RGB")
    oriented.thumbnail(CANVAS_SIZE, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", CANVAS_SIZE, (246, 246, 246))
    offset = ((CANVAS_SIZE[0] - oriented.width) // 2, (CANVAS_SIZE[1] - oriented.height) // 2)
    canvas.paste(oriented, offset)

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp.jpg")
    canvas.save(
        temporary,
        format="JPEG",
        quality=88,
        optimize=True,
        progressive=True,
    )
    raw_clean = temporary.read_bytes()
    if b"pricecharting" in raw_clean.lower():
        temporary.unlink(missing_ok=True)
        raise ValueError("la imagen limpia todavía contiene el nombre del proveedor")
    with Image.open(io.BytesIO(raw_clean)) as verification:
        if verification.getexif():
            temporary.unlink(missing_ok=True)
            raise ValueError("la imagen limpia todavía contiene EXIF")
    os.replace(temporary, destination)


def cover_url_candidates(url: str) -> list[str]:
    candidates = [url]
    for size in ("1200", "800", "600"):
        candidate = re.sub(r"/\d+\.jpg(?:\?.*)?$", f"/{size}.jpg", url)
        if candidate not in candidates:
            candidates.append(candidate)
    return candidates


def download_one_cover(task: CoverTask) -> tuple[str, str | None, bool]:
    if cover_is_clean(task.destination):
        return task.catalog_id, None, True
    errors: list[str] = []
    for url in cover_url_candidates(task.source_url):
        for attempt in range(2):
            request = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/*"},
            )
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    raw = response.read(MAX_IMAGE_BYTES + 1)
                save_clean_cover(raw, task.destination)
                return task.catalog_id, None, False
            except Exception as exc:  # noqa: BLE001 - se prueban tamaños alternativos
                errors.append(f"{type(exc).__name__}: {exc}")
                if attempt == 0:
                    time.sleep(0.3)
    return task.catalog_id, errors[-1] if errors else "sin imagen", False


def download_covers(
    catalog: list[dict[str, Any]], cover_tasks: list[CoverTask], workers: int
) -> dict[str, Any]:
    by_id = {str(game["id"]): game for game in catalog}
    downloaded = 0
    reused = 0
    failures: list[dict[str, str]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(download_one_cover, task): task for task in cover_tasks}
        for index, future in enumerate(as_completed(futures), start=1):
            task = futures[future]
            try:
                catalog_id, error, was_reused = future.result()
            except Exception as exc:  # noqa: BLE001 - un archivo no debe cancelar el lote
                catalog_id = task.catalog_id
                error = f"{type(exc).__name__}: {exc}"
                was_reused = False
            if error:
                failures.append({"catalogId": catalog_id, "title": task.title, "error": error})
            else:
                game = by_id[catalog_id]
                game["coverUrl"] = f"/covers/{game['platformSlug']}/{task.destination.name}"
                reused += int(was_reused)
                downloaded += int(not was_reused)
            if index % 100 == 0 or index == len(cover_tasks):
                print(
                    f"  portadas {index}/{len(cover_tasks)} "
                    f"({downloaded} nuevas, {reused} reutilizadas, {len(failures)} fallos)"
                )
    return {
        "requested": len(cover_tasks),
        "downloaded": downloaded,
        "reused": reused,
        "failures": failures,
    }


def update_meta(meta: dict[str, Any], catalog: list[dict[str, Any]], stats: dict[str, Any]) -> None:
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
    meta["coversLocal"] = sum(
        str(game.get("coverUrl") or "").startswith("/covers/") for game in listed
    )
    meta["lastPriceChartingCatalogImportAt"] = stats["collectedAt"]
    meta["lastPriceChartingCatalogImportPlatform"] = stats["platform"]
    meta["lastPriceChartingCatalogImportRegion"] = stats["region"]


def write_report(path: Path, stats: dict[str, Any]) -> None:
    covers = stats["covers"]
    available_covers = covers["downloaded"] + covers["reused"]
    platform_label = str(stats["platform"]).upper()
    lines = [
        f"# Importación {platform_label} {stats['region']} desde PriceCharting",
        "",
        f"Fecha: `{stats['collectedAt']}`",
        "",
        "## Resultado",
        "",
        f"- Filas de software aportadas: **{stats['sourceRows']}**.",
        f"- Fichas nuevas: **{stats['added']}**.",
        f"- Fichas existentes enlazadas/actualizadas: **{stats['matched']}** / **{stats['updated']}**.",
        f"- Fichas ocultas reactivadas: **{stats['promoted']}**.",
        f"- Duplicados previos consolidados: **{stats['retiredDuplicates']}**.",
        f"- Duplicados técnicos omitidos: **{len(stats['skipped'])}**.",
        f"- Total final de {platform_label} {stats['region']}: **{stats['finalPlatformRegionCount']}**.",
        f"- Portadas disponibles, limpias y verificadas: **{available_covers}**.",
        f"- Portadas sin resolver: **{len(covers['failures'])}**.",
        "",
        "Las portadas se guardan como JPEG de 1000 x 1400, sin EXIF ni comentarios, "
        "y con el slug interno del catálogo como nombre de archivo.",
        "",
        "## Coincidencias",
        "",
    ]
    if stats["priceMode"] == "usd_to_eur":
        lines[lines.index("## Coincidencias"):lines.index("## Coincidencias")] = [
            "Los importes originales se conservan en USD. Para mostrarlos y sumarlos en la web se "
            f"han convertido a EUR con la referencia documentada de **1 EUR = {stats['usdPerEur']:.4f} USD** "
            f"del **{stats['exchangeRateDate']}**. La asignación es Loose = Solo juego, CIB = Completo "
            "y New = Precintado.",
            "",
        ]
    else:
        lines[lines.index("## Coincidencias"):lines.index("## Coincidencias")] = [
            "Los importes del listado están expresados en USD. No se han copiado a los campos EUR "
            "del catálogo. Los precios españoles existentes no se han modificado.",
            "",
        ]
    for reason, count in sorted(stats["matchReasons"].items()):
        lines.append(f"- `{reason}`: {count}")
    if stats["skipped"]:
        lines.extend(["", "## Omitidos", ""])
        for item in stats["skipped"]:
            lines.append(f"- {item['title']} (`{item['pcId']}`): {item['reason']}.")
    if covers["failures"]:
        lines.extend(["", "## Portadas pendientes", ""])
        for item in covers["failures"][:100]:
            lines.append(f"- `{item['catalogId']}`: {item['error']}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa una lista regional de software")
    parser.add_argument("--input", type=Path, required=True, help="Texto pegado con título y precios")
    parser.add_argument("--platform", default="ps5")
    parser.add_argument("--region", default="PAL España")
    parser.add_argument("--pc-console", default="pal-playstation-5")
    parser.add_argument("--pc-region", default="PAL EU (referencia)")
    parser.add_argument("--id-prefix", help="Prefijo de ID; por defecto usa la plataforma")
    parser.add_argument("--seed-source", default="pricecharting-user-list")
    parser.add_argument("--region-evidence", default="pricecharting_catalog")
    parser.add_argument("--region-verified", action="store_true")
    parser.add_argument("--match-confidence", default="SEED_PC")
    parser.add_argument("--museum-region")
    parser.add_argument(
        "--promote-matched-excluded",
        action="store_true",
        help="Publica fichas excluidas cuando la lista aportada confirma la referencia exacta",
    )
    parser.add_argument(
        "--usd-per-eur",
        type=Decimal,
        help="Tasa de referencia: cuántos USD equivalen a 1 EUR",
    )
    parser.add_argument("--exchange-rate-date")
    parser.add_argument("--catalog", type=Path, default=CATALOG_FILE)
    parser.add_argument("--meta", type=Path, default=META_FILE)
    parser.add_argument("--live-cache", type=Path)
    parser.add_argument("--covers-root", type=Path)
    parser.add_argument("--download-covers", action="store_true")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--release-date", default=date.today().isoformat())
    parser.add_argument("--collected-at", default=datetime.now().astimezone().isoformat(timespec="seconds"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if (args.usd_per_eur is None) != (args.exchange_rate_date is None):
        parser.error("--usd-per-eur y --exchange-rate-date deben usarse juntos")

    source_rows = parse_source_rows(args.input)
    print(f"Lista: {len(source_rows)} filas")
    live_rows = load_live_rows(args.live_cache, args.pc_console, args.release_date)
    live_rows = apply_cover_fallbacks(live_rows)
    print(f"Tabla pública: {len(live_rows)} filas")
    joined = join_source_and_live(source_rows, live_rows)

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    catalog, cover_tasks, stats = merge_catalog(
        catalog,
        joined,
        platform=args.platform,
        region=args.region,
        pc_region=args.pc_region,
        collected_at=args.collected_at,
        covers_root=args.covers_root,
        id_prefix=args.id_prefix,
        seed_source=args.seed_source,
        region_evidence=args.region_evidence,
        region_verified=args.region_verified,
        match_confidence=args.match_confidence,
        museum_region=args.museum_region,
        usd_per_eur=args.usd_per_eur,
        exchange_rate_date=args.exchange_rate_date,
        promote_matched_excluded=args.promote_matched_excluded,
    )
    stats["platform"] = args.platform
    stats["region"] = args.region
    stats["collectedAt"] = args.collected_at
    stats["matched"] = stats["sourceRows"] - stats["added"] - len(stats["skipped"])

    if args.download_covers:
        if not args.covers_root:
            raise SystemExit("--download-covers requiere --covers-root")
        stats["covers"] = download_covers(catalog, cover_tasks, args.workers)
    else:
        stats["covers"] = {"requested": len(cover_tasks), "downloaded": 0, "reused": 0, "failures": []}
    stats["covers"]["failures"].extend(stats.pop("missingCoverSources"))

    stats["finalPlatformRegionCount"] = sum(
        game.get("platformSlug") == args.platform
        and game.get("region") == args.region
        and game.get("listingStatus") != "excluded"
        for game in catalog
    )

    if args.dry_run:
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return

    args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    meta = json.loads(args.meta.read_text(encoding="utf-8")) if args.meta.is_file() else {}
    update_meta(meta, catalog, stats)
    args.meta.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.report:
        write_report(args.report, stats)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
