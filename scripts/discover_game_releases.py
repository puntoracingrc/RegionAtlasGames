#!/usr/bin/env python3
"""Descubre lanzamientos físicos ya disponibles en GAME España.

Este flujo alimenta una bandeja de revisión de catálogo. No extrae ni publica
precios y nunca modifica el catálogo por sí solo.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collect_game_es import GameEsError, fetch_search_page  # noqa: E402
from collectors.catalog_match import rank_catalog_candidates  # noqa: E402
from collectors.common import now_iso, platform_catalog_games, save_json  # noqa: E402

SOURCE = "game-es-release-discovery"
REGION = "PAL España"
PLATFORM_RULES = {
    "ps5": {
        "family": "PS5",
        "navigationSegment": "/playstation-5/",
    },
    "switch2": {
        "family": "NSW2",
        "navigationSegment": "/nintendo-switch-2/",
    },
}
BUY_BUTTONS = {"comprar", "anadir", "añadir"}
GAME_PRODUCT_HOSTS = {"game.es", "www.game.es"}


class GameProductPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.append(href)

    def handle_data(self, data: str) -> None:
        cleaned = data.strip()
        if cleaned:
            self.text.append(cleaned)


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.lower())
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def canonical_title(value: str) -> str:
    return normalize_text(value)


def parse_game_release_date(value: object) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def product_seen_key(product: dict[str, Any]) -> str:
    sku = str(product.get("sourceSku") or product.get("SKU") or "").strip().lower()
    if sku:
        return f"sku:{sku}"
    url = str(product.get("productUrl") or "").strip().lower()
    if url:
        return f"url:{url}"
    return f"title:{canonical_title(str(product.get('title') or product.get('Name') or ''))}"


def product_title_key(product: dict[str, Any]) -> str:
    return f"title:{canonical_title(str(product.get('title') or product.get('Name') or ''))}"


def strip_preowned_suffix(value: str) -> str:
    return re.sub(r"\s*[-–—]\s*(seminuevo|reacondicionado)\s*$", "", value, flags=re.IGNORECASE).strip()


def load_seen_discoveries(recent_dir: Path, platform_slug: str) -> set[str]:
    if not recent_dir.exists():
        return set()
    seen: set[str] = set()
    for path in sorted(recent_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if payload.get("source") != SOURCE or payload.get("platformSlug") != platform_slug:
            continue
        for group in ("candidates", "existingProducts"):
            rows = payload.get(group)
            if not isinstance(rows, list):
                continue
            for row in rows:
                if isinstance(row, dict):
                    seen.add(product_seen_key(row))
                    seen.add(product_title_key(row))
    return seen


def best_available_new_offer(product: dict[str, Any]) -> dict[str, Any] | None:
    for offer in product.get("Offers") or []:
        if str(offer.get("BasketCode") or "").upper() != "NEW":
            continue
        if offer.get("IsNew") is not True:
            continue
        if normalize_text(str(offer.get("ButtonText") or "")) not in BUY_BUTTONS:
            continue
        if offer.get("PaintButton") is False:
            continue
        return offer
    return None


def best_available_preowned_offer(product: dict[str, Any]) -> dict[str, Any] | None:
    for offer in product.get("Offers") or []:
        if str(offer.get("BasketCode") or "").upper() != "PREOWNED":
            continue
        if offer.get("IsPreowned") is not True:
            continue
        if normalize_text(str(offer.get("ButtonText") or "")) not in BUY_BUTTONS:
            continue
        if offer.get("PaintButton") is False:
            continue
        return offer
    return None


def trusted_game_product_url(value: str, platform_slug: str, *, preowned: bool = False) -> str | None:
    try:
        url = urlparse(value)
    except ValueError:
        return None
    path = url.path.lower()
    rules = PLATFORM_RULES[platform_slug]
    if (
        url.scheme != "https"
        or (url.hostname or "").lower() not in GAME_PRODUCT_HOSTS
        or not path.startswith("/videojuegos/")
        or rules["navigationSegment"] not in f"{path}/"
        or (preowned and "seminuevo" not in path)
        or not path.rstrip("/").rsplit("/", 1)[-1].isdigit()
    ):
        return None
    return value


def fetch_game_product_page(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "RegionAtlasGames/1.0 (+catalog-discovery)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read(2_500_001).decode("utf-8", errors="ignore")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise GameEsError(f"No se pudo leer la ficha GAME: {type(exc).__name__}") from exc


def inspect_game_product_page(html: str) -> GameProductPageParser:
    parser = GameProductPageParser()
    parser.feed(html)
    return parser


def discover_preowned_source(product_url: str, platform_slug: str) -> tuple[dict[str, str] | None, str | None]:
    try:
        page = inspect_game_product_page(fetch_game_product_page(product_url))
    except GameEsError as exc:
        return None, str(exc)

    for href in page.links:
        absolute = urljoin("https://www.game.es/", href)
        trusted = trusted_game_product_url(absolute, platform_slug, preowned=True)
        if not trusted:
            continue
        try:
            preowned_page = inspect_game_product_page(fetch_game_product_page(trusted))
        except GameEsError as exc:
            return None, str(exc)
        visible_text = normalize_text(" ".join(preowned_page.text))
        if "seminuevo" not in visible_text or "anadir a la cesta" not in visible_text:
            continue
        sku = urlparse(trusted).path.rstrip("/").rsplit("/", 1)[-1]
        return {"sourceSku": sku, "productUrl": trusted}, None
    return None, None


def candidate_from_product(
    product: dict[str, Any],
    platform_slug: str,
    *,
    as_of: date,
    offer_type: str = "new",
) -> tuple[dict[str, Any] | None, str | None]:
    rules = PLATFORM_RULES[platform_slug]
    title = str(product.get("Name") or "").strip()
    if offer_type == "preowned":
        title = strip_preowned_suffix(title)
    navigation = str(product.get("Navigation") or "").strip()
    if not title:
        return None, "missing_title"
    if not navigation.startswith("videojuegos/"):
        return None, "not_a_game"
    if rules["navigationSegment"] not in f"/{navigation.lower()}/":
        return None, "wrong_platform"
    if str(product.get("Family") or "").upper() != rules["family"]:
        return None, "wrong_platform"
    release_date = parse_game_release_date(product.get("ReleaseDate"))
    if release_date is None:
        return None, "missing_release_date"
    if release_date > as_of:
        return None, "future_release"
    if product.get("IsAvailable") is not True:
        return None, "not_available"
    offer = best_available_new_offer(product) if offer_type == "new" else best_available_preowned_offer(product)
    if offer is None:
        return None, "not_for_sale"
    image_url = str(product.get("ImageUrl") or "").strip()
    if not image_url:
        return None, "missing_cover"

    product_url = f"https://www.game.es/{navigation.lstrip('/')}"
    genres = [str(value).strip() for value in (product.get("Genres") or []) if str(value).strip()]
    pegi_raw = product.get("Pegi")
    try:
        pegi = int(pegi_raw) if pegi_raw is not None else None
    except (TypeError, ValueError):
        pegi = None
    if pegi not in {3, 7, 12, 16, 18}:
        pegi = None
    candidate = {
        "title": title,
        "platformSlug": platform_slug,
        "region": REGION,
        "releaseDate": release_date.isoformat(),
        "year": release_date.year,
        "sourceSku": str(product.get("SKU") or "").strip(),
        "productUrl": product_url,
        "imageUrl": image_url,
        "publisher": str(product.get("Publisher") or "").strip() or None,
        "genres": genres,
        "pegi": pegi,
        "availability": "available",
        "availabilityModes": [offer_type],
        "regionEvidence": "game_es_retail_catalog",
    }
    if offer_type == "preowned":
        candidate["preownedSourceSku"] = candidate["sourceSku"]
        candidate["preownedProductUrl"] = candidate["productUrl"]
    return candidate, None


def exact_catalog_index(games: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = {}
    for game in games:
        for value in (game.get("title"), game.get("titlePc")):
            key = canonical_title(str(value or ""))
            if not key:
                continue
            bucket = index.setdefault(key, [])
            if not any(existing.get("id") == game.get("id") for existing in bucket):
                bucket.append(game)
    return index


def source_catalog_index(games: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for game in games:
        for field in ("gameEsSku", "gameEsPreownedSku"):
            sku = str(game.get(field) or "").strip().lower()
            if sku:
                index[f"sku:{sku}"] = game
        for field in ("gameEsProductUrl", "gameEsPreownedProductUrl"):
            product_url = str(game.get(field) or "").strip().lower()
            if product_url:
                index[f"url:{product_url}"] = game
    return index


def attach_preowned_source(candidate: dict[str, Any], source: dict[str, str]) -> None:
    candidate["preownedSourceSku"] = source["sourceSku"]
    candidate["preownedProductUrl"] = source["productUrl"]
    candidate["availabilityModes"] = sorted(set(candidate.get("availabilityModes") or []) | {"preowned"})


def compact_match(game: dict[str, Any], score: float = 1.0) -> dict[str, Any]:
    return {
        "catalogId": str(game.get("id") or ""),
        "title": str(game.get("title") or ""),
        "region": str(game.get("region") or ""),
        "score": round(score, 3),
    }


def classify_catalog_candidate(
    candidate: dict[str, Any],
    games: list[dict[str, Any]],
    exact_index: dict[str, list[dict[str, Any]]],
    source_index: dict[str, dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    source_match = source_index.get(product_seen_key(candidate))
    if source_match:
        return "existing", [compact_match(source_match)]
    exact = exact_index.get(canonical_title(candidate["title"]), [])
    if exact:
        return "existing", [compact_match(game) for game in exact[:3]]

    ranked = rank_catalog_candidates(
        {"title": candidate["title"]},
        games,
        candidate["platformSlug"],
        listing_region=candidate["region"],
        min_score=0.78,
    )
    plausible = [compact_match(item.game, item.raw_score) for item in ranked[:3] if item.raw_score >= 0.78]
    if plausible:
        return "possible_duplicate", plausible
    return "new", []


def collect_release_candidates(
    platform_slug: str,
    *,
    limit: int,
    max_pages: int,
    repeat_stop_count: int,
    delay: float,
    as_of: date,
    recent_dir: Path,
    include_preowned: bool = False,
) -> dict[str, Any]:
    games = platform_catalog_games(platform_slug, REGION)
    exact_index = exact_catalog_index(games)
    source_index = source_catalog_index(games)
    seen_previous = load_seen_discoveries(recent_dir, platform_slug)
    seen_run: set[str] = set()
    candidates: list[dict[str, Any]] = []
    existing_products: list[dict[str, Any]] = []
    rejected_samples: list[dict[str, str]] = []
    rejected_counts: dict[str, int] = {}
    consecutive_known = 0
    stop_reason = "safety_page_limit"
    pages_scanned = 0
    raw_products = 0
    total_results: int | None = None
    total_pages: int | None = None
    preowned_pages = 0
    preowned_raw_products = 0
    preowned_linked = 0
    preowned_only_candidates = 0
    preowned_failures = 0

    for page in range(max(1, max_pages)):
        payload = fetch_search_page(platform_slug, "new", page, order=0)
        pages_scanned += 1
        total_results = payload.get("TotalResults")
        total_pages = payload.get("TotalPages")
        rows = payload.get("Products") or []
        raw_products += len(rows)
        if not rows:
            stop_reason = "no_products"
            break

        for raw in rows:
            candidate, rejected_reason = candidate_from_product(raw, platform_slug, as_of=as_of)
            if candidate is None:
                reason = rejected_reason or "invalid"
                rejected_counts[reason] = rejected_counts.get(reason, 0) + 1
                if len(rejected_samples) < 12:
                    rejected_samples.append({
                        "title": str(raw.get("Name") or "Sin título")[:180],
                        "reason": reason,
                    })
                continue

            key = product_seen_key(candidate)
            title_key = product_title_key(candidate)
            if key in seen_run or title_key in seen_run:
                rejected_counts["duplicate_source"] = rejected_counts.get("duplicate_source", 0) + 1
                continue
            seen_run.add(key)
            seen_run.add(title_key)

            if key in seen_previous or title_key in seen_previous:
                consecutive_known += 1
                existing_products.append({**candidate, "catalogStatus": "seen_before", "matches": []})
            else:
                status, matches = classify_catalog_candidate(
                    candidate,
                    games,
                    exact_index,
                    source_index,
                )
                if status == "existing":
                    consecutive_known += 1
                    existing_products.append({**candidate, "catalogStatus": status, "matches": matches})
                else:
                    consecutive_known = 0
                    candidates.append({**candidate, "catalogStatus": status, "matches": matches})
                    if len(candidates) >= max(1, limit):
                        stop_reason = "candidate_limit"
                        break

            if repeat_stop_count > 0 and consecutive_known >= repeat_stop_count:
                stop_reason = "known_streak"
                break

        if stop_reason in {"candidate_limit", "known_streak"}:
            break
        if total_pages is not None and page >= int(total_pages):
            stop_reason = "last_page"
            break
        if page + 1 < max_pages:
            time.sleep(max(0.0, delay))

    if include_preowned:
        candidates_by_title = {canonical_title(row["title"]): row for row in candidates}
        existing_by_title = {canonical_title(row["title"]): row for row in existing_products}

        for candidate in [*candidates, *existing_products]:
            source, error = discover_preowned_source(candidate["productUrl"], platform_slug)
            if error:
                preowned_failures += 1
            elif source:
                attach_preowned_source(candidate, source)
                preowned_linked += 1
            time.sleep(min(max(0.0, delay), 0.25))

        for page in range(max(1, max_pages)):
            payload = fetch_search_page(platform_slug, "preowned", page, order=0)
            preowned_pages += 1
            rows = payload.get("Products") or []
            preowned_raw_products += len(rows)
            if not rows:
                break
            for raw in rows:
                preowned_candidate, reason = candidate_from_product(
                    raw,
                    platform_slug,
                    as_of=as_of,
                    offer_type="preowned",
                )
                if preowned_candidate is None:
                    key = f"preowned_{reason or 'invalid'}"
                    rejected_counts[key] = rejected_counts.get(key, 0) + 1
                    continue
                title_key = canonical_title(preowned_candidate["title"])
                current = candidates_by_title.get(title_key) or existing_by_title.get(title_key)
                if current:
                    attach_preowned_source(
                        current,
                        {
                            "sourceSku": preowned_candidate["preownedSourceSku"],
                            "productUrl": preowned_candidate["preownedProductUrl"],
                        },
                    )
                    continue
                status, matches = classify_catalog_candidate(
                    preowned_candidate,
                    games,
                    exact_index,
                    source_index,
                )
                if status == "existing":
                    existing_products.append({**preowned_candidate, "catalogStatus": status, "matches": matches})
                    existing_by_title[title_key] = existing_products[-1]
                elif len(candidates) < max(1, limit):
                    candidates.append({**preowned_candidate, "catalogStatus": status, "matches": matches})
                    candidates_by_title[title_key] = candidates[-1]
                    preowned_only_candidates += 1
            total_preowned_pages = payload.get("TotalPages")
            if total_preowned_pages is not None and page >= int(total_preowned_pages):
                break
            if page + 1 < max_pages:
                time.sleep(max(0.0, delay))

    return {
        "source": SOURCE,
        "mode": "released_catalog_candidates",
        "containsPrices": False,
        "platformSlug": platform_slug,
        "region": REGION,
        "collectedAt": now_iso(),
        "asOf": as_of.isoformat(),
        "candidates": candidates,
        "existingProducts": existing_products,
        "rejectedSamples": rejected_samples,
        "stats": {
            "pages": pages_scanned,
            "rawProducts": raw_products + preowned_raw_products,
            "newRawProducts": raw_products,
            "preownedRawProducts": preowned_raw_products,
            "preownedPages": preowned_pages,
            "preownedLinked": preowned_linked,
            "preownedOnlyCandidates": preowned_only_candidates,
            "preownedFailures": preowned_failures,
            "totalResults": total_results,
            "totalPages": total_pages,
            "catalogGames": len(games),
            "previouslySeen": len(seen_previous),
            "candidates": len(candidates),
            "possibleDuplicates": sum(1 for row in candidates if row["catalogStatus"] == "possible_duplicate"),
            "existing": sum(1 for row in existing_products if row["catalogStatus"] == "existing"),
            "seenBefore": sum(1 for row in existing_products if row["catalogStatus"] == "seen_before"),
            "rejected": sum(rejected_counts.values()),
            "rejectedByReason": rejected_counts,
            "repeatStopCount": repeat_stop_count,
            "consecutiveKnownAtStop": consecutive_known,
            "stopReason": stop_reason,
        },
    }


def run(args: argparse.Namespace) -> int:
    as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date() if args.as_of else date.today()
    print(f"=== GAME España · novedades de catálogo · {args.platform} · hasta {as_of.isoformat()} ===")
    result = collect_release_candidates(
        args.platform,
        limit=max(1, args.limit),
        max_pages=max(1, args.max_pages),
        repeat_stop_count=max(0, args.repeat_stop_count),
        delay=max(0.0, args.delay),
        as_of=as_of,
        recent_dir=args.recent_dir,
        include_preowned=not args.skip_preowned,
    )
    stats = result["stats"]
    print(
        f"  Páginas {stats['pages']} · raw {stats['rawProducts']} · "
        f"candidatos {stats['candidates']} · conocidos {stats['existing'] + stats['seenBefore']}"
    )
    print(f"  Parada: {stats['stopReason']} · descartes {stats['rejected']}")
    for candidate in result["candidates"][:10]:
        print(f"  {candidate['releaseDate']} · {candidate['title']} · {candidate['catalogStatus']}")
    if not args.dry_run:
        save_json(args.output, result)
        print(f"  Guardado: {args.output}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover released PS5/Switch 2 games from GAME España")
    parser.add_argument("--platform", required=True, choices=sorted(PLATFORM_RULES))
    parser.add_argument("--limit", type=int, default=80)
    parser.add_argument("--max-pages", type=int, default=4)
    parser.add_argument("--repeat-stop-count", type=int, default=3)
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--as-of", default="", help="Fecha YYYY-MM-DD para pruebas/reprocesado.")
    parser.add_argument("--recent-dir", type=Path, default=ROOT / "data" / "catalog-discovery" / "game-es")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "catalog-discovery" / "game-es.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-preowned", action="store_true", help="No inspeccionar modalidades seminuevas.")
    args = parser.parse_args()
    try:
        raise SystemExit(run(args))
    except GameEsError as exc:
        print(f"  ERROR: {exc}")
        raise SystemExit(0 if args.dry_run else 1) from exc


if __name__ == "__main__":
    main()
