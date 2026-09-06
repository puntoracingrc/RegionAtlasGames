"""Clasificación de estado (suelto / completo / precintado) con visión."""

from __future__ import annotations
from collectors.ai_usage import record_usage

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from collectors.ai_balance import check_billing_error

from collectors.common import load_json, now_iso, save_json
from collectors.cache_policy import attach_policy_version, cache_policy_matches
from collectors.condition_buckets import DISPLAY_BUCKETS

ROOT = Path(__file__).resolve().parents[2]
from collectors.storage_paths import ingest_dir

VISION_CACHE_DIR = ingest_dir() / "cache" / "condition-vision"

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
MIN_CONFIDENCE = 0.80
MAX_IMAGES = max(1, min(8, int(os.environ.get("VISION_MAX_IMAGES", "8"))))


def vision_available() -> bool:
    from collectors.price_ai_policy import price_collectors_use_ai

    return price_collectors_use_ai()


def _cache_file(cache_key: str) -> Path:
    digest = hashlib.sha1(cache_key.encode("utf-8")).hexdigest()
    return VISION_CACHE_DIR / f"{digest}.json"


def read_vision_cache(cache_key: str) -> dict[str, Any] | None:
    path = _cache_file(cache_key)
    if not path.exists():
        return None
    cached = load_json(path, {})
    return cached if cache_policy_matches(cached) else None


def write_vision_cache(cache_key: str, payload: dict[str, Any]) -> None:
    path = _cache_file(cache_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, attach_policy_version(payload))


def _openai_vision(messages: list[dict[str, Any]]) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada")

    base = os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    model = os.environ.get("OPENAI_VISION_MODEL") or os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
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
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    record_usage(payload, model=model, operation="condition_vision")
    return str(payload["choices"][0]["message"]["content"])


def classify_condition_from_images(
    image_urls: list[str],
    *,
    title: str,
    platform_slug: str,
    source: str,
    cache_key: str,
    manual_expected: bool | None = None,
    original_contents_expected: list[str] | None = None,
    use_cache: bool = True,
) -> tuple[str | None, float, str | None]:
    urls = [u for u in image_urls if u][:MAX_IMAGES]
    if not urls:
        return None, 0.0, "no_images"

    if use_cache:
        cached = read_vision_cache(cache_key)
        if cached and "bucket" in cached:
            bucket = cached.get("bucket")
            conf = float(cached.get("confidence") or 0)
            if bucket is None or conf < MIN_CONFIDENCE:
                return None, conf, str(cached.get("reason") or "low_confidence")
            if bucket in DISPLAY_BUCKETS:
                return bucket, conf, str(cached.get("reason") or "")

    if not vision_available():
        return None, 0.0, "no_api_key"

    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Plataforma: {platform_slug}\n"
                f"Fuente: {source}\n"
                f"Título anuncio: {title}\n\n"
                f"¿La edición incluía manual de fábrica?: "
                f"{'sí' if manual_expected is True else 'no' if manual_expected is False else 'desconocido'}\n\n"
                f"Contenido original ya conocido para esta edición: "
                f"{', '.join(original_contents_expected or []) or 'por confirmar'}\n\n"
                "Clasifica el ESTADO FÍSICO de la copia en venta mirando la(s) foto(s).\n"
                "Responde JSON: "
                '{"bucket":"loose|game_manual|complete|sealed|null","confidence":0-1,"reason":"..."}\n\n'
                "Reglas:\n"
                "- loose: solo cartucho/disco/medio suelto, sin caja retail completa\n"
                "- game_manual: juego/cartucho/disco con manual visible, pero sin caja retail\n"
                "- complete: copia abierta con todo lo que esa edición incluía de fábrica\n"
                "- si se conoce una lista de contenido original, complete exige conservar todos esos elementos\n"
                "- si manual_expected=true, una copia sin manual NO es complete; devuelve null\n"
                "- si manual_expected=false, caja + juego puede ser complete sin manual\n"
                "- sealed: precintado de fábrica, film plástico intacto, sin abrir\n"
                "- null: no se puede determinar\n"
                "No confundas múltiples juegos en un lote si solo se vende uno."
            ),
        }
    ]
    for url in urls:
        user_content.append({"type": "image_url", "image_url": {"url": url, "detail": "high"}})

    try:
        raw = _openai_vision(
            [
                {
                    "role": "system",
                    "content": "Experto en videojuegos retro. Clasifica estado físico solo desde fotos.",
                },
                {"role": "user", "content": user_content},
            ]
        )
        parsed = json.loads(raw)
    except urllib.error.HTTPError as exc:
        check_billing_error(exc)
        return None, 0.0, "vision_error"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError):
        return None, 0.0, "vision_error"

    bucket_raw = parsed.get("bucket")
    bucket = str(bucket_raw).strip().lower() if bucket_raw not in (None, "null", "") else None
    if bucket not in DISPLAY_BUCKETS:
        bucket = None
    confidence = float(parsed.get("confidence") or 0)
    reason = str(parsed.get("reason") or "").strip()

    write_vision_cache(
        cache_key,
        {
            "bucket": bucket,
            "confidence": confidence,
            "reason": reason,
            "imageUrls": urls,
            "title": title,
            "platformSlug": platform_slug,
            "source": source,
            "originalContentsExpected": original_contents_expected,
            "resolvedAt": now_iso(),
            "model": os.environ.get("OPENAI_VISION_MODEL")
            or os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        },
    )

    if bucket is None or confidence < MIN_CONFIDENCE:
        return None, confidence, reason or "low_confidence"
    return bucket, confidence, reason


__all__ = [
    "MIN_CONFIDENCE",
    "classify_condition_from_images",
    "vision_available",
]
