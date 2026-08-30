"""Identidad de edición física para no mezclar variantes del mismo juego."""

from __future__ import annotations

import html
import re
import unicodedata
from typing import Any


def _normalize(text: str) -> str:
    value = html.unescape(text or "")
    value = unicodedata.normalize("NFKD", value.lower())
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


EDITION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "collector",
        re.compile(
            r"\b(?:(?:collector(?:\s+s)?|collectors)\s+(?:(?:limited|deluxe|special)\s+)?(?:edition|edicion|ed)|(?:edicion\s+)?coleccionista)\b"
        ),
    ),
    ("limited", re.compile(r"\b(?:limited\s+(?:edition|ed)|edicion\s+limitada)\b")),
    ("deluxe", re.compile(r"\b(?:deluxe\s+(?:edition|ed)|edicion\s+deluxe)\b")),
    ("special", re.compile(r"\b(?:special\s+(?:edition|ed)|edicion\s+especial)\b")),
    ("ultimate", re.compile(r"\b(?:ultimate\s+(?:edition|ed)|edicion\s+ultimate)\b")),
    ("gold", re.compile(r"\bgold\s+(?:edition|ed)\b")),
    ("complete-edition", re.compile(r"\bcomplete\s+(?:edition|ed)\b")),
    ("day-one", re.compile(r"\b(?:day\s+one|dia\s+uno)\s+(?:edition|ed)\b")),
    ("launch", re.compile(r"\blaunch\s+(?:edition|ed)\b")),
    ("signature", re.compile(r"\bsignature\s+(?:edition|ed)\b")),
    ("premium-box", re.compile(r"\bpremium\s+box\b")),
    ("steelbook", re.compile(r"\bsteelbook\b")),
)

EDITION_FIELD_ALIASES = {
    "collector": "collector",
    "collectors": "collector",
    "collectors edition": "collector",
    "collector s edition": "collector",
    "coleccionista": "collector",
    "limited": "limited",
    "deluxe": "deluxe",
    "special": "special",
    "ultimate": "ultimate",
    "gold": "gold",
    "complete": "complete-edition",
    "day one": "day-one",
    "launch": "launch",
    "signature": "signature",
    "premium box": "premium-box",
    "steelbook": "steelbook",
}


def physical_edition_markers(text: str, *, edition: str | None = None) -> frozenset[str]:
    normalized = _normalize(text)
    markers = {label for label, pattern in EDITION_PATTERNS if pattern.search(normalized)}
    edition_value = _normalize(edition or "")
    if edition_value and edition_value != "standard":
        alias = EDITION_FIELD_ALIASES.get(edition_value)
        if alias:
            markers.add(alias)
    return frozenset(markers)


def physical_edition_base_title(text: str) -> str:
    normalized = _normalize(text)
    for _, pattern in EDITION_PATTERNS:
        normalized = pattern.sub(" ", normalized)
    normalized = re.sub(r"\bstandard\s+(?:edition|edicion)\b", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def catalog_physical_edition(game: dict[str, Any]) -> frozenset[str]:
    text = " ".join(
        str(value or "")
        for value in (game.get("title"), game.get("titlePc"), game.get("slug"))
    )
    return physical_edition_markers(text, edition=str(game.get("edition") or ""))


def listing_physical_edition(product: dict[str, Any] | str) -> frozenset[str]:
    if isinstance(product, str):
        text = product
    else:
        text = " ".join(
            str(product.get(key) or "")
            for key in ("title", "name", "boxName", "description", "characteristics")
        )
    return physical_edition_markers(text)


def physical_editions_match(product: dict[str, Any] | str, game: dict[str, Any]) -> bool:
    """Una edición especial solo casa con la misma edición especial.

    La ausencia de marcador significa edición estándar. Es deliberadamente
    estricto: una duda pasa a revisión en vez de contaminar el precio de otra
    variante física.
    """

    return listing_physical_edition(product) == catalog_physical_edition(game)


def physical_edition_label(markers: frozenset[str]) -> str:
    if not markers:
        return "standard"
    return "+".join(sorted(markers))


__all__ = [
    "catalog_physical_edition",
    "listing_physical_edition",
    "physical_edition_label",
    "physical_edition_base_title",
    "physical_edition_markers",
    "physical_editions_match",
]
