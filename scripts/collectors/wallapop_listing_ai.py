"""Clasificación IA de anuncios Wallapop por juego de catálogo (merchandising, match, región)."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from collectors.catalog_ai_match import ai_available, product_cache_key
from collectors.catalog_match import product_title
from collectors.common import load_json, load_platforms, now_iso, save_json
from collectors.region_inference import regions_match

ROOT = Path(__file__).resolve().parents[2]
CACHE_ROOT = ROOT / "data" / "price-ingest" / "cache" / "wallapop-listing-ai"

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
MIN_CONFIDENCE = 0.75
DESCRIPTION_MAX = 200


def batch_size() -> int:
    raw = os.environ.get("WALLAPOP_LISTING_AI_BATCH_SIZE", "16").strip()
    try:
        return max(4, min(32, int(raw)))
    except ValueError:
        return 16


def batch_delay_s() -> float:
    raw = os.environ.get("WALLAPOP_LISTING_AI_DELAY", "0.05").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.05


def batch_workers() -> int:
    raw = os.environ.get("WALLAPOP_LISTING_AI_WORKERS", "2").strip()
    try:
        return max(1, min(4, int(raw)))
    except ValueError:
        return 2


BATCH_SIZE = batch_size()

AI_REGION_MAP = {
    "pal europa": "PAL Europa",
    "pal europe": "PAL Europa",
    "pal españa": "PAL España",
    "españa": "PAL España",
    "usa": "USA",
    "ntsc-u": "USA",
    "japón": "Japón",
    "japon": "Japón",
    "japan": "Japón",
    "unknown": None,
}


@dataclass
class ListingAiResult:
    is_video_game: bool
    is_target_game: bool
    listing_region: str | None
    region_matches_catalog: bool | None
    condition: str | None
    confidence: float
    reason: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ListingAiResult:
        cond = data.get("condition")
        if cond in (None, "null", ""):
            cond = None
        region_raw = str(data.get("listingRegion") or "").strip()
        listing_region = map_ai_listing_region(region_raw)
        rmc = data.get("regionMatchesCatalog")
        if rmc not in (True, False):
            rmc = None
        return cls(
            is_video_game=data.get("isVideoGame") is True,
            is_target_game=data.get("isTargetGame") is True,
            listing_region=listing_region,
            region_matches_catalog=rmc,
            condition=str(cond) if cond else None,
            confidence=float(data.get("confidence") or 0),
            reason=str(data.get("reason") or "").strip(),
        )

    def to_cache(self, *, title: str, price_eur: float, external_id: str) -> dict[str, Any]:
        return {
            "externalId": external_id,
            "title": title,
            "priceEur": round(float(price_eur), 2),
            "isVideoGame": self.is_video_game,
            "isTargetGame": self.is_target_game,
            "listingRegion": self.listing_region,
            "regionMatchesCatalog": self.region_matches_catalog,
            "condition": self.condition,
            "confidence": self.confidence,
            "reason": self.reason,
            "resolvedAt": now_iso(),
            "model": os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        }


def map_ai_listing_region(raw: str) -> str | None:
    key = re.sub(r"\s+", " ", raw.strip().lower())
    if not key or key == "unknown":
        return None
    return AI_REGION_MAP.get(key, raw.strip() or None)


def listing_snapshot(product: dict[str, Any]) -> tuple[str, float]:
    title = product_title(product)
    price = round(float(product.get("priceEur") or 0), 2)
    return title, price


def cache_is_fresh(cached: dict[str, Any], product: dict[str, Any]) -> bool:
    title, price = listing_snapshot(product)
    return (
        str(cached.get("title") or "") == title
        and round(float(cached.get("priceEur") or 0), 2) == price
    )


def _cache_path(platform_slug: str, catalog_id: str, cache_key: str) -> Path:
    safe_key = re.sub(r"[^\w.-]+", "_", cache_key.strip()) or "unknown"
    return CACHE_ROOT / platform_slug / catalog_id / f"{safe_key}.json"


def read_listing_ai_cache(
    product: dict[str, Any],
    *,
    platform_slug: str,
    catalog_id: str,
) -> ListingAiResult | None:
    cache_key = product_cache_key(product, "wallapop")
    if not cache_key:
        return None
    path = _cache_path(platform_slug, catalog_id, cache_key)
    if not path.exists():
        return None
    cached = load_json(path, {})
    if not cache_is_fresh(cached, product):
        return None
    return ListingAiResult.from_dict(cached)


def write_listing_ai_cache(
    product: dict[str, Any],
    result: ListingAiResult,
    *,
    platform_slug: str,
    catalog_id: str,
) -> None:
    cache_key = product_cache_key(product, "wallapop")
    if not cache_key:
        return
    title, price = listing_snapshot(product)
    external_id = str(product.get("externalId") or cache_key)
    payload = result.to_cache(title=title, price_eur=price, external_id=external_id)
    save_json(_cache_path(platform_slug, catalog_id, cache_key), payload)


def _openai_chat(messages: list[dict[str, str]]) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada")
    base = os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    body = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return str(payload["choices"][0]["message"]["content"])


def _build_system_prompt(game: dict[str, Any], platform_slug: str) -> str:
    platform = load_platforms().get(platform_slug) or {}
    platform_name = str(platform.get("shortName") or platform.get("name") or platform_slug)
    catalog_region = str(game.get("region") or "")
    title = str(game.get("title") or "")
    return (
        "Experto en videojuegos retro. Clasifica anuncios de Wallapop ES.\n"
        f"Objetivo catálogo: «{title}» ({catalog_region}) para {platform_name}.\n"
        "Responde JSON: "
        '{"results":[{"externalId":"...","isVideoGame":bool,"isTargetGame":bool,'
        '"listingRegion":"PAL Europa|PAL España|USA|Japón|unknown",'
        '"regionMatchesCatalog":bool,"condition":"loose|complete|sealed|null",'
        '"confidence":0-1,"reason":"..."}]}. '
        "isVideoGame=false para peluches, ropa, pósters, consolas, lotes, manuales sueltos, figuras, revistas. "
        f"isTargetGame=true solo si el anuncio vende ese juego concreto en {platform_name}, "
        "no secuelas ni spin-offs distintos. "
        f"regionMatchesCatalog=true si la edición encaja con {catalog_region}."
    )


def _classify_batch(
    batch: list[dict[str, Any]],
    game: dict[str, Any],
    platform_slug: str,
) -> dict[str, ListingAiResult]:
    lines = []
    for idx, product in enumerate(batch, start=1):
        title = product_title(product)
        desc = str(product.get("description") or "")[:DESCRIPTION_MAX]
        lines.append(
            f'{idx}. id={product.get("externalId")} | {product.get("priceEur")} EUR | '
            f'title="{title}" | desc="{desc}"'
        )

    system = _build_system_prompt(game, platform_slug)
    user = "Anuncios:\n" + "\n".join(lines)
    try:
        raw = _openai_chat([{"role": "system", "content": system}, {"role": "user", "content": user}])
        parsed = json.loads(raw)
        batch_results = parsed.get("results") or []
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError):
        batch_results = []

    by_id = {str(row.get("externalId") or ""): row for row in batch_results if isinstance(row, dict)}
    out: dict[str, ListingAiResult] = {}
    for product in batch:
        rid = str(product.get("externalId") or "")
        row = by_id.get(rid) or {
            "externalId": rid,
            "isVideoGame": False,
            "isTargetGame": False,
            "confidence": 0,
            "reason": "sin_respuesta_ia",
        }
        out[rid or product_cache_key(product, "wallapop") or ""] = ListingAiResult.from_dict(row)
    return out


def _regex_reject_result() -> ListingAiResult:
    return ListingAiResult(
        is_video_game=False,
        is_target_game=False,
        listing_region=None,
        region_matches_catalog=False,
        condition=None,
        confidence=1.0,
        reason="regex_non_game",
    )


def classify_products_for_game(
    products: list[dict[str, Any]],
    game: dict[str, Any],
    platform_slug: str,
    *,
    use_cache: bool = True,
    delay_s: float | None = None,
    use_regex_prefilter: bool = True,
) -> tuple[dict[str, ListingAiResult], dict[str, int]]:
    """Clasifica anuncios para un juego. Caché por plataforma+catalogId+externalId; invalida si cambia título o precio."""
    catalog_id = str(game["id"])
    size = batch_size()
    pause = batch_delay_s() if delay_s is None else delay_s
    workers = batch_workers()
    if use_regex_prefilter:
        from collectors.wallapop_match import is_wallapop_game_product as _is_game_product
    else:
        _is_game_product = None
    stats = {
        "ai_cache_hits": 0,
        "ai_batches": 0,
        "ai_listings": 0,
        "ai_regex_rejected": 0,
    }
    results: dict[str, ListingAiResult] = {}
    pending: list[dict[str, Any]] = []

    for product in products:
        stats["ai_listings"] += 1
        key = result_key(product)

        if _is_game_product and not _is_game_product(product):
            reject = _regex_reject_result()
            results[key] = reject
            stats["ai_regex_rejected"] += 1
            if use_cache:
                write_listing_ai_cache(product, reject, platform_slug=platform_slug, catalog_id=catalog_id)
            continue

        if use_cache:
            cached = read_listing_ai_cache(product, platform_slug=platform_slug, catalog_id=catalog_id)
            if cached:
                stats["ai_cache_hits"] += 1
                results[key] = cached
                continue
        pending.append(product)

    batches = [pending[i : i + size] for i in range(0, len(pending), size)]

    def run_batch(batch: list[dict[str, Any]]) -> dict[str, ListingAiResult]:
        return _classify_batch(batch, game, platform_slug)

    if workers > 1 and len(batches) > 1:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(run_batch, batch): batch for batch in batches}
            for future in as_completed(futures):
                batch = futures[future]
                stats["ai_batches"] += 1
                try:
                    batch_results = future.result()
                except Exception:  # noqa: BLE001
                    batch_results = {}
                _store_batch_results(
                    batch,
                    batch_results,
                    results=results,
                    platform_slug=platform_slug,
                    catalog_id=catalog_id,
                )
    else:
        for index, batch in enumerate(batches):
            batch_results = run_batch(batch)
            stats["ai_batches"] += 1
            _store_batch_results(
                batch,
                batch_results,
                results=results,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
            )
            if pause > 0 and index + 1 < len(batches):
                time.sleep(pause)

    return results, stats


def _store_batch_results(
    batch: list[dict[str, Any]],
    batch_results: dict[str, ListingAiResult],
    *,
    results: dict[str, ListingAiResult],
    platform_slug: str,
    catalog_id: str,
) -> None:
    for product in batch:
        key = result_key(product)
        result = batch_results.get(key) or ListingAiResult(
            is_video_game=False,
            is_target_game=False,
            listing_region=None,
            region_matches_catalog=None,
            condition=None,
            confidence=0.0,
            reason="sin_respuesta_ia",
        )
        results[key] = result
        write_listing_ai_cache(product, result, platform_slug=platform_slug, catalog_id=catalog_id)


def passes_listing_ai(
    result: ListingAiResult,
    *,
    catalog_region: str,
) -> bool:
    if not result.is_video_game or not result.is_target_game:
        return False
    if result.confidence < MIN_CONFIDENCE:
        return False
    if result.region_matches_catalog is False:
        return False
    if result.listing_region and not regions_match(catalog_region, result.listing_region):
        return False
    return True


def result_key(product: dict[str, Any]) -> str:
    return str(product.get("externalId") or product_cache_key(product, "wallapop") or "")


__all__ = [
    "BATCH_SIZE",
    "ListingAiResult",
    "MIN_CONFIDENCE",
    "ai_available",
    "batch_delay_s",
    "batch_size",
    "batch_workers",
    "classify_products_for_game",
    "map_ai_listing_region",
    "passes_listing_ai",
    "read_listing_ai_cache",
    "result_key",
]
