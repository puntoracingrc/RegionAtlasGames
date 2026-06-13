"""Disambiguación catálogo ↔ producto con LLM (casos ambiguos, todas las fuentes)."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

from collectors.catalog_match import AI_MIN_CONFIDENCE, CatalogMatchResult, product_title
from collectors.common import load_json, now_iso, save_json

ROOT = Path(__file__).resolve().parents[2]
MATCH_CACHE_ROOT = ROOT / "data" / "price-ingest" / "cache" / "catalog-matches"

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"


def _cache_file(source: str, platform_slug: str, cache_key: str) -> Path:
    safe_source = re.sub(r"[^\w.-]+", "_", source.strip()) or "source"
    safe_key = re.sub(r"[^\w.-]+", "_", cache_key.strip()) or "unknown"
    return MATCH_CACHE_ROOT / safe_source / platform_slug / f"{safe_key}.json"


def read_match_cache(source: str, platform_slug: str, cache_key: str) -> dict[str, Any] | None:
    path = _cache_file(source, platform_slug, cache_key)
    if not path.exists():
        return None
    return load_json(path, {})


def write_match_cache(source: str, platform_slug: str, cache_key: str, payload: dict[str, Any]) -> None:
    path = _cache_file(source, platform_slug, cache_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, payload)


def ai_available() -> bool:
    from collectors.common import load_local_env

    load_local_env()
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())


def product_cache_key(product: dict[str, Any], source: str) -> str:
    for key in ("externalId", "boxId", "itemId", "id"):
        val = str(product.get(key) or "").strip()
        if val:
            return f"{source}:{val}"
    url = str(product.get("productUrl") or product.get("url") or product.get("permalink") or "").strip()
    if url:
        return f"{source}:{url}"
    return ""


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
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return str(payload["choices"][0]["message"]["content"])


def _build_prompt(
    *,
    source: str,
    platform_slug: str,
    title: str,
    listing_region: str | None,
    alternatives: list[dict[str, Any]],
) -> list[dict[str, str]]:
    candidate_lines = []
    for idx, alt in enumerate(alternatives, start=1):
        candidate_lines.append(
            f'{idx}. id={alt["catalogId"]} | region={alt.get("region", "")} | '
            f'title="{alt.get("title", "")}" | score={alt.get("score", "")}'
        )
    system = (
        "Eres un experto en videojuegos retro. Elige la ficha de catálogo que corresponde "
        "exactamente al producto listado (mismo juego y edición; no confundas secuelas ni spin-offs). "
        "Responde solo JSON: catalogId (string o null), sameGame (boolean), "
        "confidence (0-1), reason (string breve en español)."
    )
    user = (
        f"Fuente: {source}\n"
        f"Plataforma: {platform_slug}\n"
        f"Título producto: {title}\n"
        f"Región inferida: {listing_region or 'desconocida'}\n\n"
        f"Candidatos catálogo:\n" + "\n".join(candidate_lines) + "\n\n"
        "Si ningún candidato es el mismo juego, devuelve catalogId=null y sameGame=false."
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def resolve_ambiguous_match(
    product: dict[str, Any],
    result: CatalogMatchResult,
    *,
    source: str,
    platform_slug: str,
    listing_region: str | None = None,
    infer_listing_region: Callable[[dict[str, Any]], str | None] | None = None,
    use_cache: bool = True,
) -> CatalogMatchResult | None:
    if not result.ambiguous or not result.alternatives:
        return None

    cache_key = product_cache_key(product, source)
    if use_cache and cache_key:
        cached = read_match_cache(source, platform_slug, cache_key)
        if cached is not None:
            return _result_from_cache(result, cached)

    if not ai_available():
        return None

    region = listing_region
    if region is None and infer_listing_region:
        region = infer_listing_region(product)

    try:
        raw = _openai_chat(
            _build_prompt(
                source=source,
                platform_slug=platform_slug,
                title=product_title(product),
                listing_region=region,
                alternatives=result.alternatives,
            )
        )
        parsed = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError):
        return None

    catalog_id = parsed.get("catalogId")
    same_game = parsed.get("sameGame") is True
    confidence = float(parsed.get("confidence") or 0)
    reason = str(parsed.get("reason") or "").strip()

    if cache_key:
        write_match_cache(
            source,
            platform_slug,
            cache_key,
            {
                "cacheKey": cache_key,
                "catalogId": catalog_id if same_game else None,
                "sameGame": same_game,
                "confidence": confidence,
                "reason": reason,
                "resolvedAt": now_iso(),
                "model": os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
            },
        )

    if not same_game or not catalog_id or confidence < AI_MIN_CONFIDENCE:
        return None

    chosen = next((alt for alt in result.alternatives if alt.get("catalogId") == catalog_id), None)
    if not chosen:
        return None

    return CatalogMatchResult(
        game={"id": catalog_id, "title": chosen.get("title"), "region": chosen.get("region")},
        match_method="ai",
        match_score=result.match_score,
        margin=result.margin,
        alternatives=result.alternatives,
        ai_confidence=confidence,
    )


def _result_from_cache(pending: CatalogMatchResult, cached: dict[str, Any]) -> CatalogMatchResult | None:
    if cached.get("sameGame") is not True:
        return None
    catalog_id = str(cached.get("catalogId") or "").strip()
    confidence = float(cached.get("confidence") or 0)
    if not catalog_id or confidence < AI_MIN_CONFIDENCE:
        return None
    chosen = next((alt for alt in pending.alternatives if alt.get("catalogId") == catalog_id), None)
    return CatalogMatchResult(
        game={
            "id": catalog_id,
            "title": chosen.get("title") if chosen else "",
            "region": chosen.get("region") if chosen else "",
        },
        match_method="ai",
        match_score=pending.match_score,
        margin=pending.margin,
        alternatives=pending.alternatives,
        ai_confidence=confidence,
    )


def hydrate_cached_game(
    partial: CatalogMatchResult,
    games_by_id: dict[str, dict[str, Any]],
) -> CatalogMatchResult | None:
    if not partial.game:
        return None
    catalog_id = str(partial.game.get("id") or "")
    game = games_by_id.get(catalog_id)
    if not game:
        return None
    return CatalogMatchResult(
        game=game,
        match_method=partial.match_method,
        match_score=partial.match_score,
        margin=partial.margin,
        alternatives=partial.alternatives,
        ai_confidence=partial.ai_confidence,
    )


__all__ = [
    "ai_available",
    "hydrate_cached_game",
    "product_cache_key",
    "resolve_ambiguous_match",
]
