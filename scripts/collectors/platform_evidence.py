"""Validación conservadora de plataforma para productos de tiendas retro."""

from __future__ import annotations

import re
import unicodedata
from typing import Any


PLATFORM_RULES: dict[str, dict[str, tuple[str, ...]]] = {
    "neogeopocket": {
        "accept": (
            "neo geo pocket",
            "neogeo pocket",
            "neo geo pocket color",
            "neogeo pocket color",
            "ngpc",
            "ngp",
        ),
        "reject": (
            "neo geo aes",
            "neogeo aes",
            " aes ",
            "neo geo mvs",
            "neogeo mvs",
            " mvs ",
            "neo geo cd",
            "neogeo cd",
        ),
    },
}


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    collapsed = re.sub(r"\s+", " ", normalized).strip()
    return f" {collapsed} "


def product_platform_text(product: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in (
        "title",
        "name",
        "handle",
        "productUrl",
        "variantTitle",
        "description",
        "short_description",
        "body_html",
        "sku",
    ):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value)
    categories = product.get("categories")
    if isinstance(categories, list):
        for category in categories:
            if not isinstance(category, dict):
                continue
            for key in ("slug", "name"):
                value = category.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value)
    return _normalize_text(" ".join(parts))


def product_platform_is_compatible(product: dict[str, Any], platform_slug: str) -> bool:
    rules = PLATFORM_RULES.get(platform_slug)
    if not rules:
        return True

    text = product_platform_text(product)
    reject_markers = rules.get("reject", ())
    if any(marker in text for marker in reject_markers):
        return False

    accept_markers = rules.get("accept", ())
    if any(marker in text for marker in accept_markers):
        return True

    if platform_slug == "neogeopocket" and " neo geo " in text:
        return False

    return True
