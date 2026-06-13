"""Clasificación de estado (suelto / completo / precintado) con visión."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from collectors.common import load_json, now_iso, save_json
from collectors.condition_buckets import DISPLAY_BUCKETS

ROOT = Path(__file__).resolve().parents[2]
VISION_CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "condition-vision"

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
MIN_CONFIDENCE = 0.80
MAX_IMAGES = max(1, min(3, int(os.environ.get("VISION_MAX_IMAGES", "1"))))


def vision_available() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())


def _cache_file(cache_key: str) -> Path:
    digest = hashlib.sha1(cache_key.encode("utf-8")).hexdigest()
    return VISION_CACHE_DIR / f"{digest}.json"


def read_vision_cache(cache_key: str) -> dict[str, Any] | None:
    path = _cache_file(cache_key)
    if not path.exists():
        return None
    return load_json(path, {})


def write_vision_cache(cache_key: str, payload: dict[str, Any]) -> None:
    path = _cache_file(cache_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, payload)


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
    return str(payload["choices"][0]["message"]["content"])


def classify_condition_from_images(
    image_urls: list[str],
    *,
    title: str,
    platform_slug: str,
    source: str,
    cache_key: str,
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
                "Clasifica el ESTADO FÍSICO de la copia en venta mirando la(s) foto(s).\n"
                "Responde JSON: "
                '{"bucket":"loose|complete|sealed|null","confidence":0-1,"reason":"..."}\n\n'
                "Reglas:\n"
                "- loose: solo cartucho/disco/medio suelto, sin caja retail completa\n"
                "- complete: caja abierta con juego; puede faltar manual; caja + disco\n"
                "- sealed: precintado de fábrica, film plástico intacto, sin abrir\n"
                "- null: no se puede determinar\n"
                "No confundas múltiples juegos en un lote si solo se vende uno."
            ),
        }
    ]
    for url in urls:
        user_content.append({"type": "image_url", "image_url": {"url": url, "detail": "low"}})

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
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError):
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
