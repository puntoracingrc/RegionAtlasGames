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
        "xboxseriesx",
    }
)
MIN_ACCEPTED_OPEN_EXAMPLES = 3


def manual_presence_declared(text: str) -> bool:
    return bool(MANUAL_PRESENT_RE.search(text or ""))


def manual_missing_declared(text: str) -> bool:
    return bool(MANUAL_MISSING_RE.search(text or ""))


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


def game_content_profile(game: dict[str, Any] | None) -> dict[str, Any]:
    game = game or {}
    catalog_id = str(game.get("id") or game.get("catalogId") or "").strip()
    platform_slug = str(game.get("platformSlug") or "").strip().lower()
    explicit = _manual_bool(game.get("manualExpected"))
    if explicit is not None:
        return {
            "catalogId": catalog_id,
            "manualExpected": explicit,
            "manualExpectationSource": "catalog_verified",
            "acceptedExamples": 0,
        }

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
    return {
        "catalogId": catalog_id,
        "manualExpected": learned,
        "manualExpectationSource": source,
        "acceptedExamples": examples,
    }


__all__ = [
    "MODERN_PHYSICAL_PLATFORMS",
    "game_content_profile",
    "manual_missing_declared",
    "manual_presence_declared",
]
