"""Memoria visual por ficha basada solo en decisiones ya aceptadas."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from collectors.common import ROOT, load_json
from collectors.collector_intelligence import collector_game_learning

DEFAULT_QUEUE_FILE = ROOT / "data" / "admin" / "price-review-queue.json"


def _queue_file() -> Path:
    configured = os.environ.get("PRICE_REVIEW_QUEUE_FILE", "").strip()
    return Path(configured) if configured else DEFAULT_QUEUE_FILE


def _accepted_examples(catalog_id: str) -> list[dict[str, Any]]:
    queue = load_json(_queue_file(), {})
    items = queue.get("items") if isinstance(queue, dict) else []
    if not isinstance(items, list):
        return []
    accepted: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict) or item.get("status") != "accepted":
            continue
        decision = item.get("decision") if isinstance(item.get("decision"), dict) else {}
        decided_catalog_id = str(decision.get("catalogId") or item.get("catalogId") or item.get("candidateCatalogId") or "")
        if decided_catalog_id != catalog_id:
            continue
        evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
        image_urls = [
            str(url)
            for url in [evidence.get("imageUrl"), *(evidence.get("imageUrls") or [])]
            if url
        ]
        image_urls = list(dict.fromkeys(image_urls))[:4]
        if not image_urls:
            continue
        accepted.append(
            {
                "region": str(decision.get("region") or item.get("detectedRegion") or item.get("targetRegion") or ""),
                "regionEvidence": [str(value) for value in (evidence.get("regionEvidence") or []) if value],
                "note": str(decision.get("note") or "")[:500],
                "imageUrls": image_urls,
                "decidedAt": str(item.get("decidedAt") or item.get("updatedAt") or ""),
            }
        )
    return sorted(accepted, key=lambda item: item["decidedAt"], reverse=True)[:3]


def game_region_profile(catalog_id: str | None) -> dict[str, Any] | None:
    clean_id = str(catalog_id or "").strip()
    if not clean_id:
        return None
    learned = collector_game_learning(clean_id)
    shared_examples = learned.get("approvedExamples")
    examples = (
        [item for item in shared_examples if isinstance(item, dict)][:3]
        if isinstance(shared_examples, list)
        else []
    )
    if not examples:
        examples = _accepted_examples(clean_id)
    if not examples:
        return None
    profile = {"catalogId": clean_id, "approvedExamples": examples}
    profile["fingerprint"] = hashlib.sha1(
        json.dumps(profile, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return profile


__all__ = ["game_region_profile"]
