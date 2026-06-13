"""Región y estado desde fotos de anuncio (carátula / contraportada)."""

from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import json

from collectors.condition_buckets import DISPLAY_BUCKETS
from collectors.region_inference import regions_match

ROOT = Path(__file__).resolve().parents[2]
VISION_CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "region-cover-vision"


def _load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
MIN_CONFIDENCE = float(os.environ.get("REGION_VISION_MIN_CONFIDENCE", "0.82"))
MAX_IMAGES = max(1, min(3, int(os.environ.get("REGION_VISION_MAX_IMAGES", "2"))))

REGION_ALIASES = {
    "pal europa": "PAL Europa",
    "pal europe": "PAL Europa",
    "pal españa": "PAL España",
    "pal spain": "PAL España",
    "españa": "PAL España",
    "spain": "PAL España",
    "usa": "USA",
    "ntsc-u": "USA",
    "us": "USA",
    "japón": "Japón",
    "japon": "Japón",
    "japan": "Japón",
    "jp": "Japón",
}

EVIDENCE_FOR_REGION: dict[str, list[str]] = {
    "PAL Europa": ["cover_pal_eu", "photo_region_mark"],
    "PAL España": ["cover_spain", "photo_region_mark"],
    "España": ["cover_spain", "photo_region_mark"],
    "USA": ["cover_usa"],
    "Japón": ["cover_japan"],
}


@dataclass
class RegionCoverVisionResult:
    listing_region: str | None
    region_matches_catalog: bool
    evidence: list[str]
    confidence: float
    condition: str | None
    reason: str
    is_target_game: bool


def region_cover_vision_available() -> bool:
    if os.environ.get("REGION_VISION_DISABLED", "").strip().lower() in ("1", "true", "yes"):
        return False
    from collectors.common import load_local_env

    load_local_env()
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())


def _cache_file(cache_key: str) -> Path:
    digest = hashlib.sha1(cache_key.encode("utf-8")).hexdigest()
    return VISION_CACHE_DIR / f"{digest}.json"


def _map_region(raw: str) -> str | None:
    key = re.sub(r"\s+", " ", raw.strip().lower())
    if not key or key in ("unknown", "null", "none"):
        return None
    return REGION_ALIASES.get(key) or (raw.strip() if raw.strip() else None)


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


def classify_region_from_cover(
    image_urls: list[str],
    *,
    title: str,
    game_title: str,
    platform_slug: str,
    catalog_region: str,
    source: str,
    external_id: str | None = None,
    cache_key: str | None = None,
    use_cache: bool = True,
) -> RegionCoverVisionResult | None:
    """Lee carátula/contraportada y devuelve región + evidencias para las reglas ES."""
    urls = [u for u in image_urls if u][:MAX_IMAGES]
    if not urls:
        return None

    key = cache_key or "|".join(
        [
            source,
            external_id or "",
            catalog_region,
            platform_slug,
            game_title,
            *urls,
        ]
    )

    if use_cache:
        cached_path = _cache_file(key)
        if cached_path.exists():
            cached = _load_json(cached_path, {})
            return RegionCoverVisionResult(
                listing_region=cached.get("listingRegion"),
                region_matches_catalog=cached.get("regionMatchesCatalog") is True,
                evidence=[str(e) for e in (cached.get("evidence") or [])],
                confidence=float(cached.get("confidence") or 0),
                condition=cached.get("condition"),
                reason=str(cached.get("reason") or ""),
                is_target_game=cached.get("isTargetGame") is True,
            )

    if not region_cover_vision_available():
        return None

    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Plataforma catálogo: {platform_slug}\n"
                f"Juego objetivo catálogo: «{game_title}»\n"
                f"Edición catálogo (región): {catalog_region}\n"
                f"Título anuncio: {title}\n"
                f"Fuente: {source}\n\n"
                "Mira la(s) foto(s) del anuncio (carátula, caja, contraportada con PEGI/ESRB/código regional).\n"
                "Responde JSON:\n"
                '{"isTargetGame":bool,"listingRegion":"PAL Europa|PAL España|USA|Japón|unknown",'
                '"regionMatchesCatalog":bool,'
                '"evidence":["cover_japan"|"cover_usa"|"cover_pal_eu"|"cover_spain"|"photo_region_mark"],'
                '"condition":"loose|complete|sealed|null","confidence":0-1,"reason":"..."}\n\n'
                "Reglas:\n"
                "- isTargetGame=true solo si la foto muestra ese juego en esa plataforma.\n"
                "- listingRegion según textos visibles (katakana/kanji→Japón, ESRB NTSC→USA, PEGI multilingüe→PAL Europa, textos ES→PAL España).\n"
                "- regionMatchesCatalog=true si la edición visible encaja con la región del catálogo.\n"
                "- evidence: códigos que justifiquen la región vista (mínimo uno válido).\n"
                "- condition: estado físico visible si se puede; si no, null."
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
                    "content": "Experto en ediciones regionales de videojuegos retro. Solo JSON.",
                },
                {"role": "user", "content": user_content},
            ]
        )
        parsed = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError):
        return None

    listing_region = _map_region(str(parsed.get("listingRegion") or ""))
    region_matches = parsed.get("regionMatchesCatalog") is True
    confidence = float(parsed.get("confidence") or 0)
    reason = str(parsed.get("reason") or "").strip()
    is_target = parsed.get("isTargetGame") is True

    evidence_raw = parsed.get("evidence") or []
    evidence = [str(e).strip() for e in evidence_raw if e]
    if listing_region and not evidence:
        evidence = list(EVIDENCE_FOR_REGION.get(listing_region, ["photo_region_mark"]))

    cond_raw = parsed.get("condition")
    condition = str(cond_raw).strip().lower() if cond_raw not in (None, "null", "") else None
    if condition not in DISPLAY_BUCKETS:
        condition = None

    result = RegionCoverVisionResult(
        listing_region=listing_region,
        region_matches_catalog=region_matches,
        evidence=evidence,
        confidence=confidence,
        condition=condition,
        reason=reason,
        is_target_game=is_target,
    )

    _save_json(
        _cache_file(key),
        {
            "listingRegion": listing_region,
            "regionMatchesCatalog": region_matches,
            "evidence": evidence,
            "confidence": confidence,
            "condition": condition,
            "reason": reason,
            "isTargetGame": is_target,
            "imageUrls": urls,
            "title": title,
            "gameTitle": game_title,
            "catalogRegion": catalog_region,
            "platformSlug": platform_slug,
            "source": source,
            "externalId": external_id,
            "resolvedAt": _now_iso(),
        },
    )
    return result


def apply_region_cover_vision(
    *,
    platform_slug: str,
    catalog_region: str,
    game_title: str,
    listing_title: str,
    listing_region: str,
    evidence: list[str],
    ai_conf: float,
    ok_ref: bool,
    image_urls: list[str],
    source: str,
    external_id: str | None = None,
) -> tuple[str, list[str], float, bool, str | None]:
    """
    Si el anuncio ya está verificado por texto/reglas, no hace nada.
    Si faltan pruebas y hay fotos + API, pasa visión de carátula antes de decidir.
    Devuelve (listing_region, evidence, ai_conf, region_verified, condition_bucket).
    """
    from region_evidence_rules import check_listing_evidence_meets_rules

    if not ok_ref:
        return listing_region, evidence, ai_conf, False, None

    rules_ok, _ = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_conf
    )
    region_matches = regions_match(catalog_region, listing_region)
    if rules_ok and region_matches:
        return listing_region, evidence, ai_conf, True, None

    if not image_urls or not region_cover_vision_available():
        verified = rules_ok and region_matches
        return listing_region, evidence, ai_conf, verified, None

    vision = classify_region_from_cover(
        image_urls,
        title=listing_title,
        game_title=game_title,
        platform_slug=platform_slug,
        catalog_region=catalog_region,
        source=source,
        external_id=external_id,
    )
    if not vision or not vision.is_target_game or vision.confidence < MIN_CONFIDENCE:
        verified = rules_ok and region_matches
        return listing_region, evidence, ai_conf, verified, None

    if vision.listing_region:
        listing_region = vision.listing_region

    merged = list(dict.fromkeys([*evidence, *vision.evidence, "cover_vision"]))
    ai_conf = max(float(ai_conf or 0), vision.confidence)

    if vision.region_matches_catalog and regions_match(catalog_region, listing_region):
        rules_ok, _ = check_listing_evidence_meets_rules(
            platform_slug, catalog_region, merged, ai_conf
        )
        if rules_ok:
            return listing_region, merged, ai_conf, True, vision.condition

    verified = False
    return listing_region, merged, ai_conf, verified, vision.condition


__all__ = [
    "MIN_CONFIDENCE",
    "RegionCoverVisionResult",
    "apply_region_cover_vision",
    "classify_region_from_cover",
    "region_cover_vision_available",
]
