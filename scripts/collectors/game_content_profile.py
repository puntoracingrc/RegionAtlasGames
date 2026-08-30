"""Contenido original esperado por edición, aprendido solo de decisiones aceptadas."""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from collectors.common import ROOT

DEFAULT_QUEUE_FILE = ROOT / "data" / "admin" / "price-review-queue.json"

MANUAL_PRESENT_RE = re.compile(
    r"\b(con manual|manual incluido|incluye manual|with manual|manual included)\b",
    re.I,
)
MANUAL_MISSING_RE = re.compile(
    r"\b(sin manual|no manual|falta(?:\s+el)? manual|solo falta manual|manual ausente)\b",
    re.I,
)
ORIGINAL_CONTENT_KEYS = (
    "manual",
    "map",
    "poster",
    "stickers",
    "soundtrack",
    "artbook",
    "cards",
    "steelbook",
    "bonus_disc",
    "figure",
)
ORIGINAL_CONTENT_PRESENT_RE: dict[str, re.Pattern[str]] = {
    "manual": MANUAL_PRESENT_RE,
    "map": re.compile(r"\b(con mapa|incluye mapa|mapa incluido|map included|with map)\b", re.I),
    "poster": re.compile(r"\b(con p[oó]ster|incluye p[oó]ster|p[oó]ster incluido|with poster|poster included)\b", re.I),
    "stickers": re.compile(r"\b(con pegatinas|incluye pegatinas|pegatinas incluidas|with stickers|stickers included)\b", re.I),
    "soundtrack": re.compile(r"\b(con banda sonora|incluye banda sonora|banda sonora incluida|soundtrack included|with soundtrack)\b", re.I),
    "artbook": re.compile(r"\b(con libro de arte|incluye libro de arte|libro de arte incluido|with artbook|artbook included)\b", re.I),
    "cards": re.compile(r"\b(con tarjetas|incluye tarjetas|tarjetas incluidas|con postales|incluye postales|with cards|cards included)\b", re.I),
    "steelbook": re.compile(r"\b(con steelbook|incluye steelbook|steelbook incluido|with steelbook|steelbook included|caja met[aá]lica incluida)\b", re.I),
    "bonus_disc": re.compile(r"\b(con disco extra|incluye disco extra|disco extra incluido|bonus disc included|with bonus disc)\b", re.I),
    "figure": re.compile(r"\b(con figura|incluye figura|figura incluida|with figurine|figurine included|figure included)\b", re.I),
}
ORIGINAL_CONTENT_MISSING_RE: dict[str, re.Pattern[str]] = {
    "manual": MANUAL_MISSING_RE,
    "map": re.compile(r"\b(sin mapa|falta(?:\s+el)? mapa|no map|map missing)\b", re.I),
    "poster": re.compile(r"\b(sin p[oó]ster|falta(?:\s+el)? p[oó]ster|no poster|poster missing)\b", re.I),
    "stickers": re.compile(r"\b(sin pegatinas|faltan(?:\s+las)? pegatinas|no stickers|stickers missing)\b", re.I),
    "soundtrack": re.compile(r"\b(sin banda sonora|falta(?:\s+la)? banda sonora|no soundtrack|soundtrack missing)\b", re.I),
    "artbook": re.compile(r"\b(sin libro de arte|falta(?:\s+el)? libro de arte|no artbook|artbook missing)\b", re.I),
    "cards": re.compile(r"\b(sin tarjetas|faltan(?:\s+las)? tarjetas|sin postales|faltan(?:\s+las)? postales|no cards|cards missing)\b", re.I),
    "steelbook": re.compile(r"\b(sin steelbook|falta(?:\s+el)? steelbook|no steelbook|steelbook missing|sin caja met[aá]lica)\b", re.I),
    "bonus_disc": re.compile(r"\b(sin disco extra|falta(?:\s+el)? disco extra|no bonus disc|bonus disc missing)\b", re.I),
    "figure": re.compile(r"\b(sin figura|falta(?:\s+la)? figura|no figurine|figurine missing|figure missing)\b", re.I),
}
OPEN_COMPLETE_RE = re.compile(
    r"\b(desprecintad[oa]|abiert[oa]|open box|opened|como nuev[oa]|nuevo pero abierto)\b",
    re.I,
)
MODERN_PHYSICAL_PLATFORMS = frozenset(
    {
        "ps4",
        "ps5",
        "switch",
        "switch2",
        "xboxone",
        "xboxseries",
        "xboxseriesx",
    }
)
LEGACY_MANUAL_REQUIRED_PLATFORMS = frozenset(
    {
        "nes",
        "snes",
        "n64",
        "gameboy",
        "gamecube",
        "wii",
        "ds",
        "mastersystem",
        "megadrive",
        "sega32x",
        "megacd",
        "saturn",
        "dreamcast",
        "gamegear",
        "neogeo",
        "neogeocd",
        "neogeopocket",
        "ps1",
        "ps2",
        "psp",
        "gba",
        "xbox",
    }
)
MIN_ACCEPTED_OPEN_EXAMPLES = 3


def manual_presence_declared(text: str) -> bool:
    return bool(MANUAL_PRESENT_RE.search(text or ""))


def manual_missing_declared(text: str) -> bool:
    return bool(MANUAL_MISSING_RE.search(text or ""))


def normalize_original_contents(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple, set)):
        return []
    found = {str(item).strip().lower() for item in value}
    return [key for key in ORIGINAL_CONTENT_KEYS if key in found]


def declared_original_contents(text: str) -> list[str]:
    value = text or ""
    return [
        key
        for key in ORIGINAL_CONTENT_KEYS
        if ORIGINAL_CONTENT_PRESENT_RE[key].search(value)
        or ORIGINAL_CONTENT_MISSING_RE[key].search(value)
    ]


def missing_original_contents(text: str, expected: Any) -> list[str]:
    value = text or ""
    return [
        key
        for key in normalize_original_contents(expected)
        if ORIGINAL_CONTENT_MISSING_RE[key].search(value)
    ]


def _queue_file() -> Path:
    configured = os.environ.get("PRICE_REVIEW_QUEUE_FILE", "").strip()
    return Path(configured) if configured else DEFAULT_QUEUE_FILE


def _manual_bool(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _accepted_catalog_id(item: dict[str, Any]) -> str:
    decision = item.get("decision") if isinstance(item.get("decision"), dict) else {}
    return str(
        decision.get("catalogId")
        or item.get("catalogId")
        or item.get("candidateCatalogId")
        or ""
    ).strip()


def _item_text(item: dict[str, Any]) -> str:
    decision = item.get("decision") if isinstance(item.get("decision"), dict) else {}
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    return " ".join(
        str(value or "")
        for value in (
            item.get("listingTitle"),
            evidence.get("description"),
            evidence.get("conditionRaw"),
            decision.get("note"),
        )
    )


@lru_cache(maxsize=50_000)
def _learned_manual_expectation(
    catalog_id: str,
    platform_slug: str,
    queue_path: str,
    queue_mtime_ns: int,
) -> tuple[bool | None, str, int]:
    del queue_mtime_ns
    path = Path(queue_path)
    if not path.exists():
        return None, "unknown", 0
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, "unknown", 0

    accepted = [
        item
        for item in (payload.get("items") or [])
        if isinstance(item, dict)
        and item.get("status") == "accepted"
        and _accepted_catalog_id(item) == catalog_id
    ]
    accepted.sort(
        key=lambda item: str(item.get("decidedAt") or item.get("updatedAt") or ""),
        reverse=True,
    )

    for item in accepted:
        decision = item.get("decision") if isinstance(item.get("decision"), dict) else {}
        evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
        explicit = _manual_bool(decision.get("manualExpected"))
        if explicit is None:
            explicit = _manual_bool(evidence.get("manualExpected"))
        if explicit is None and isinstance(decision.get("originalContents"), list):
            explicit = "manual" in normalize_original_contents(decision.get("originalContents"))
        if explicit is not None:
            return explicit, "accepted_admin_decision", 1

    # "Sin manual" o "con manual" demuestra que esa edición sí contemplaba manual.
    for item in accepted:
        text = _item_text(item)
        if manual_presence_declared(text) or manual_missing_declared(text):
            return True, "accepted_manual_evidence", 1

    # La ausencia de la palabra manual no prueba nada por sí sola. Solo se aprende
    # un "no traía manual" tras varias revisiones humanas de copias abiertas.
    open_complete_examples = 0
    if platform_slug in MODERN_PHYSICAL_PLATFORMS:
        for item in accepted:
            decision = item.get("decision") if isinstance(item.get("decision"), dict) else {}
            condition = str(decision.get("condition") or item.get("condition") or "").strip()
            text = _item_text(item)
            if condition != "complete" or not OPEN_COMPLETE_RE.search(text):
                continue
            if manual_presence_declared(text) or manual_missing_declared(text):
                continue
            evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
            image_urls = [
                str(url)
                for url in [evidence.get("imageUrl"), *(evidence.get("imageUrls") or [])]
                if url
            ]
            if len(set(image_urls)) < 2:
                continue
            open_complete_examples += 1
        if open_complete_examples >= MIN_ACCEPTED_OPEN_EXAMPLES:
            return False, "accepted_open_complete_consensus", open_complete_examples

    return None, "unknown", open_complete_examples


@lru_cache(maxsize=50_000)
def _learned_original_contents(
    catalog_id: str,
    queue_path: str,
    queue_mtime_ns: int,
) -> tuple[tuple[str, ...] | None, str, int]:
    del queue_mtime_ns
    path = Path(queue_path)
    if not path.exists():
        return None, "unknown", 0
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, "unknown", 0

    accepted = [
        item
        for item in (payload.get("items") or [])
        if isinstance(item, dict)
        and item.get("status") == "accepted"
        and _accepted_catalog_id(item) == catalog_id
    ]
    accepted.sort(
        key=lambda item: str(item.get("decidedAt") or item.get("updatedAt") or ""),
        reverse=True,
    )

    for item in accepted:
        decision = item.get("decision") if isinstance(item.get("decision"), dict) else {}
        if isinstance(decision.get("originalContents"), list):
            return (
                tuple(normalize_original_contents(decision.get("originalContents"))),
                "accepted_admin_decision",
                1,
            )

    learned: set[str] = set()
    supporting_items = 0
    for item in accepted:
        declared = declared_original_contents(_item_text(item))
        if not declared:
            continue
        learned.update(declared)
        supporting_items += 1
    if learned:
        ordered = tuple(key for key in ORIGINAL_CONTENT_KEYS if key in learned)
        return ordered, "accepted_content_evidence", supporting_items
    return None, "unknown", 0


def game_content_profile(game: dict[str, Any] | None) -> dict[str, Any]:
    game = game or {}
    catalog_id = str(game.get("id") or game.get("catalogId") or "").strip()
    platform_slug = str(game.get("platformSlug") or "").strip().lower()
    explicit_manual = _manual_bool(game.get("manualExpected"))
    explicit_contents = (
        normalize_original_contents(game.get("originalContents"))
        if isinstance(game.get("originalContents"), list)
        else None
    )

    queue = _queue_file()
    try:
        mtime_ns = queue.stat().st_mtime_ns
    except OSError:
        mtime_ns = 0
    learned, source, examples = _learned_manual_expectation(
        catalog_id,
        platform_slug,
        str(queue),
        mtime_ns,
    )
    learned_contents, content_source, content_examples = _learned_original_contents(
        catalog_id,
        str(queue),
        mtime_ns,
    )

    if explicit_contents is not None:
        expected_contents: list[str] | None = explicit_contents
        content_source = str(game.get("originalContentsSource") or "catalog_verified")
        if explicit_manual is None:
            explicit_manual = "manual" in explicit_contents
    else:
        expected_contents = list(learned_contents) if learned_contents is not None else None

    if explicit_manual is not None:
        learned = explicit_manual
        source = "catalog_verified"
    if learned is None and platform_slug in LEGACY_MANUAL_REQUIRED_PLATFORMS:
        learned = True
        source = "platform_generation_default"
    if learned is True:
        if expected_contents is None:
            expected_contents = ["manual"]
            content_source = source
        elif "manual" not in expected_contents:
            expected_contents = ["manual", *expected_contents]
    return {
        "catalogId": catalog_id,
        "manualExpected": learned,
        "manualExpectationSource": source,
        "originalContentsExpected": expected_contents,
        "originalContentsSource": content_source,
        "acceptedExamples": max(examples, content_examples),
    }


__all__ = [
    "LEGACY_MANUAL_REQUIRED_PLATFORMS",
    "MODERN_PHYSICAL_PLATFORMS",
    "ORIGINAL_CONTENT_KEYS",
    "declared_original_contents",
    "game_content_profile",
    "manual_missing_declared",
    "manual_presence_declared",
    "missing_original_contents",
    "normalize_original_contents",
]
