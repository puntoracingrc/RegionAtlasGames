"""Señales visuales verificadas para distinguir variantes regionales."""

from __future__ import annotations

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
        front = _languages(item.get("frontCoverLanguages"))
        back = _languages(item.get("backCoverLanguages"))
        if not front and not back:
            continue
        variants.append(
            {
                "region": region,
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
        front = variant["frontCoverLanguages"]
        back = variant["backCoverLanguages"]
        if front and front == back:
            detail = f"portada y contraportada en {_language_list(front)}"
        else:
            parts: list[str] = []
            if front:
                parts.append(f"portada en {_language_list(front)}")
            if back:
                parts.append(f"contraportada en {_language_list(back)}")
            detail = "; ".join(parts)
        lines.append(f"- {variant['region']}: {detail}.")
    lines.append("Compara estas señales con las fotos actuales; no las atribuyas a otra edición física.")
    return "\n".join(lines)


__all__ = ["normalize_regional_packaging", "regional_packaging_prompt"]
