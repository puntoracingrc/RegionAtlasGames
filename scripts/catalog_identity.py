"""Identidad estable de una edición física del catálogo."""

from __future__ import annotations

import html
import re
import unicodedata
from urllib.parse import unquote


def decode_repeated(value: str | None) -> str:
    current = str(value or "")
    for _ in range(5):
        decoded = html.unescape(unquote(current))
        if decoded == current:
            break
        current = decoded
    return current


def slugify(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", decode_repeated(value))
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-") or "juego"


def catalog_identity_key(
    *,
    platform_slug: str | None,
    region: str | None,
    edition: str | None,
    physical_variant: str | None,
    title: str | None,
) -> str:
    return "::".join(
        (
            slugify(platform_slug or "platform"),
            slugify(region or "region"),
            slugify(edition or "standard"),
            slugify(physical_variant or "default"),
            slugify(title or "game"),
        )
    )


def game_identity_key(game: dict) -> str:
    return catalog_identity_key(
        platform_slug=game.get("platformSlug"),
        region=game.get("region"),
        edition=game.get("edition"),
        physical_variant=game.get("physicalVariant"),
        title=game.get("title"),
    )
