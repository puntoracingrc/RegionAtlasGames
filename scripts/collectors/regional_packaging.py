"""Señales visuales verificadas para distinguir variantes regionales."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

LANGUAGE_LABELS = {
    "de": "alemán",
    "en": "inglés",
    "es": "español",
    "fr": "francés",
    "it": "italiano",
    "ja": "japonés",
    "ko": "coreano",
    "nl": "neerlandés",
    "pt": "portugués",
    "zh": "chino",
}

RATING_SYSTEMS = {"PEGI", "ESRB", "CERO", "USK", "ACB", "BBFC", "ELSPA"}
IMAGE_ROLES = {"front", "back", "spine", "disc", "cartridge", "manual", "seal", "other"}


def _languages(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        code = str(item or "").strip().lower()
        if 2 <= len(code) <= 3 and code.isalpha() and code not in result:
            result.append(code)
    return result


def normalize_regional_packaging(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    variants: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        region = str(item.get("region") or "").strip()
        if not region or region.lower() in seen:
            continue
        raw_rating = str(item.get("ratingSystem") or "").strip().upper()
        rating_system = raw_rating if raw_rating in RATING_SYSTEMS else None
        front = _languages(item.get("frontCoverLanguages"))
        back = _languages(item.get("backCoverLanguages"))
        if not rating_system and not front and not back:
            continue
        variants.append(
            {
                "region": region,
                "ratingSystem": rating_system,
                "frontCoverLanguages": front,
                "backCoverLanguages": back,
            }
        )
        seen.add(region.lower())
    return variants


def _language_list(value: list[str]) -> str:
    labels = [LANGUAGE_LABELS.get(code, code.upper()) for code in value]
    if len(labels) <= 1:
        return labels[0] if labels else "sin confirmar"
    if len(labels) == 2:
        return f"{labels[0]} y {labels[1]}"
    return f"{', '.join(labels[:-1])} y {labels[-1]}"


def regional_packaging_prompt(value: Any) -> str:
    variants = normalize_regional_packaging(value)
    if not variants:
        return ""
    lines = ["Señales regionales ya verificadas para esta ficha:"]
    for variant in variants:
        rating_system = variant["ratingSystem"]
        front = variant["frontCoverLanguages"]
        back = variant["backCoverLanguages"]
        parts: list[str] = []
        if rating_system:
            parts.append(f"clasificación {rating_system} en la portada")
        if front and front == back:
            parts.append(f"portada y contraportada en {_language_list(front)}")
        else:
            if front:
                parts.append(f"portada en {_language_list(front)}")
            if back:
                parts.append(f"contraportada en {_language_list(back)}")
        detail = "; ".join(parts)
        lines.append(f"- {variant['region']}: {detail}.")
    lines.append(
        "PEGI solo confirma Europa: dentro de esa familia decide la variante nacional por la contraportada."
    )
    lines.append("ESRB identifica USA, CERO Japón y USK Alemania.")
    lines.append("Compara estas señales con las fotos actuales; no las atribuyas a otra edición física.")
    return "\n".join(lines)


def _clean_list(value: Any, *, limit: int, max_length: int) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        clean = re.sub(r"\s+", " ", str(item or "")).strip()[:max_length]
        if clean and clean not in result:
            result.append(clean)
    return result[:limit]


def normalize_visual_observations(value: Any, *, image_limit: int = 8) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    observations: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        try:
            image_index = int(item.get("imageIndex") or index + 1)
        except (TypeError, ValueError):
            continue
        if image_index < 1 or image_index > image_limit:
            continue
        role = str(item.get("role") or "other").strip().lower()
        if role not in IMAGE_ROLES:
            role = "other"
        ratings = [
            rating
            for rating in (str(raw).strip().upper() for raw in (item.get("ratingSystems") or []))
            if rating in RATING_SYSTEMS
        ]
        languages = _languages(item.get("languages"))
        product_codes = [
            code.upper()
            for code in _clean_list(item.get("productCodes"), limit=8, max_length=48)
            if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._()/+-]{1,47}", code)
        ]
        barcodes = [
            digits
            for digits in (re.sub(r"\D", "", raw) for raw in _clean_list(item.get("barcodes"), limit=4, max_length=24))
            if 8 <= len(digits) <= 14
        ]
        observations.append(
            {
                "imageIndex": image_index,
                "role": role,
                "ratingSystems": list(dict.fromkeys(ratings))[:4],
                "languages": languages,
                "productCodes": list(dict.fromkeys(product_codes))[:8],
                "barcodes": list(dict.fromkeys(barcodes))[:4],
                "distributors": _clean_list(item.get("distributors"), limit=6, max_length=80),
                "editionMarkers": _clean_list(item.get("editionMarkers"), limit=6, max_length=80),
            }
        )
    return observations[:image_limit]


def _normalized_text(value: str) -> str:
    raw = unicodedata.normalize("NFKD", value)
    return "".join(char for char in raw if not unicodedata.combining(char)).lower()


def infer_region_from_visual_observations(
    value: Any,
) -> tuple[str | None, list[str]]:
    observations = normalize_visual_observations(value)
    ratings = {
        rating
        for observation in observations
        for rating in observation["ratingSystems"]
    }
    codes = " ".join(
        code for observation in observations for code in observation["productCodes"]
    ).upper()
    distributors = _normalized_text(
        " ".join(
            distributor
            for observation in observations
            for distributor in observation["distributors"]
        )
    )
    back_languages = {
        language
        for observation in observations
        if observation["role"] in {"back", "manual"}
        for language in observation["languages"]
    }
    evidence: list[str] = []

    if "ESRB" in ratings or re.search(r"\b(?:SLUS|SCUS|ULUS|BLUS|BCUS|USA)\b", codes):
        return "USA", ["cover_usa", "photo_region_mark", "sku_regional"]
    if "CERO" in ratings or re.search(r"\b(?:SLPS|SCPS|ULJS|BLJM|BCJS|JPN)\b", codes):
        return "Japón", ["cover_japan", "photo_region_mark", "sku_regional"]
    if "USK" in ratings or re.search(r"(?:[-/(]|\b)(?:NOE|GER)(?:[-/)]|\b)", codes):
        return "PAL Alemania", ["cover_pal_eu", "photo_region_mark", "sku_regional"]
    if re.search(r"(?:[-/(]|\b)ESP(?:[-/)]|\b)", codes) or any(
        marker in distributors for marker in ("espana", "spain", "iberica", "distribuido en espana")
    ):
        return "PAL España", ["cover_spain", "sku_regional", "distributor_regional"]
    if re.search(r"(?:[-/(]|\b)(?:FRA|FR)(?:[-/)]|\b)", codes):
        return "PAL Francia", ["cover_pal_eu", "sku_regional"]
    if re.search(r"(?:[-/(]|\b)(?:ITA|IT)(?:[-/)]|\b)", codes):
        return "PAL Italia", ["cover_pal_eu", "sku_regional"]
    if re.search(r"(?:[-/(]|\b)(?:UKV|UK)(?:[-/)]|\b)", codes):
        return "PAL UK/ENG", ["cover_pal_eu", "sku_regional"]

    if "PEGI" in ratings:
        evidence.extend(["cover_pal_eu", "photo_region_mark"])
        if "es" in back_languages:
            return "PAL España", [*evidence, "cover_spain", "back_cover_language"]
        if back_languages == {"fr"}:
            return "PAL Francia", [*evidence, "back_cover_language"]
        if back_languages == {"it"}:
            return "PAL Italia", [*evidence, "back_cover_language"]
        return "PAL Europa", evidence + (["back_cover_language"] if back_languages else [])

    return None, []


__all__ = [
    "infer_region_from_visual_observations",
    "normalize_regional_packaging",
    "normalize_visual_observations",
    "regional_packaging_prompt",
]
