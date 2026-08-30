"""Memoria común aprobada y políticas específicas para cada recolector."""

from __future__ import annotations

import html
import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LEARNING_FILE = ROOT / "data" / "admin" / "collector-learning.json"
COLLECTOR_LEARNING_SCHEMA_VERSION = 1
COLLECTOR_INTELLIGENCE_POLICY = "collector-intelligence-v1"

SOURCE_ALIASES = {
    "ebay": "ebay-es",
    "vinted": "vinted-es",
    "tcns": "todoconsolas",
    "kaoto": "kaotostore",
    "jgo": "japangameonline",
}

SOURCE_POLICIES: dict[str, dict[str, Any]] = {
    "wallapop": {
        "queryMode": "exact_title_platform_then_fallback",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 2,
        "imageLimit": 12,
        "strictRegion": True,
    },
    "ebay-es": {
        "queryMode": "broad_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": True,
    },
    "vinted-es": {
        "queryMode": "catalog_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": True,
    },
    "todocoleccion": {
        "queryMode": "catalog_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": True,
    },
    "todoconsolas": {
        "queryMode": "retail_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": True,
    },
    "cex": {
        "queryMode": "retail_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": False,
    },
    "japangameonline": {
        "queryMode": "japan_retail_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": True,
    },
    "kaotostore": {
        "queryMode": "retail_title_then_same_source_hint",
        "reuseLearnedQueries": True,
        "maxLearnedQueries": 1,
        "imageLimit": 3,
        "strictRegion": True,
    },
}

DEFAULT_SOURCE_POLICY: dict[str, Any] = {
    "queryMode": "catalog_title",
    "reuseLearnedQueries": True,
    "maxLearnedQueries": 1,
    "imageLimit": 3,
    "strictRegion": False,
}

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


def normalize_collector_source(source: Any) -> str:
    clean = str(source or "").strip().lower()
    return SOURCE_ALIASES.get(clean, clean)


def collector_source_policy(source: Any) -> dict[str, Any]:
    normalized = normalize_collector_source(source)
    return {**DEFAULT_SOURCE_POLICY, **SOURCE_POLICIES.get(normalized, {})}


def _learning_file() -> Path:
    configured = os.environ.get("PRICE_COLLECTOR_LEARNING_FILE", "").strip()
    return Path(configured) if configured else DEFAULT_LEARNING_FILE


@lru_cache(maxsize=16)
def _load_learning_file(path_text: str, mtime_ns: int) -> dict[str, Any]:
    del mtime_ns
    path = Path(path_text)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    if int(payload.get("schemaVersion") or 0) != COLLECTOR_LEARNING_SCHEMA_VERSION:
        return {}
    if payload.get("policyVersion") != COLLECTOR_INTELLIGENCE_POLICY:
        return {}
    return payload


def collector_learning_payload() -> dict[str, Any]:
    path = _learning_file()
    try:
        mtime_ns = path.stat().st_mtime_ns
    except OSError:
        mtime_ns = 0
    return _load_learning_file(str(path), mtime_ns)


def collector_game_learning(catalog_id: Any) -> dict[str, Any]:
    clean_id = str(catalog_id or "").strip()
    if not clean_id:
        return {}
    games = collector_learning_payload().get("games")
    if not isinstance(games, dict):
        return {}
    record = games.get(clean_id)
    return record if isinstance(record, dict) else {}


def learned_source_queries(catalog_id: Any, source: Any) -> list[str]:
    policy = collector_source_policy(source)
    if not policy.get("reuseLearnedQueries"):
        return []
    normalized_source = normalize_collector_source(source)
    successful = collector_game_learning(catalog_id).get("successfulQueries")
    if not isinstance(successful, dict):
        return []
    rows = successful.get(normalized_source)
    if not isinstance(rows, list):
        return []
    queries: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        query = _clean_text(row.get("query"), 180)
        if query and query.lower() not in {value.lower() for value in queries}:
            queries.append(query)
    return queries[: int(policy.get("maxLearnedQueries") or 0)]


def collector_game_context(game: dict[str, Any] | None, source: Any) -> dict[str, Any]:
    from collectors.game_content_profile import game_content_profile

    game = game or {}
    content = game_content_profile(game)
    packaging = game.get("regionalPackaging")
    return {
        "catalogId": str(game.get("id") or game.get("catalogId") or "").strip(),
        "manualExpected": content.get("manualExpected"),
        "manualExpectationSource": content.get("manualExpectationSource"),
        "originalContentsExpected": content.get("originalContentsExpected"),
        "originalContentsSource": content.get("originalContentsSource"),
        "regionalPackagingExpected": (
            [row for row in packaging if isinstance(row, dict)]
            if isinstance(packaging, list)
            else None
        ),
        "sourcePolicy": collector_source_policy(source),
    }


def apply_collector_game_context(
    row: dict[str, Any],
    game: dict[str, Any] | None,
    source: Any,
) -> dict[str, Any]:
    context = collector_game_context(game, source)
    for key in (
        "catalogId",
        "manualExpected",
        "manualExpectationSource",
        "originalContentsExpected",
        "originalContentsSource",
        "regionalPackagingExpected",
    ):
        value = context.get(key)
        if value is not None and key not in row:
            row[key] = value
    return row


def _clean_text(value: Any, max_length: int = 500) -> str:
    text = str(value or "").strip()
    for _ in range(5):
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
    return re.sub(r"\s+", " ", text).strip()[:max_length].strip()


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _catalog_id(value: Any) -> str:
    return str(value or "").strip()[:240]


def _string_list(value: Any, *, limit: int = 20, max_length: int = 120) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        clean = _clean_text(item, max_length)
        if clean and clean not in result:
            result.append(clean)
    return result[:limit]


def _image_urls(evidence: dict[str, Any]) -> list[str]:
    values = [evidence.get("imageUrl")]
    if isinstance(evidence.get("imageUrls"), list):
        values.extend(evidence["imageUrls"])
    result: list[str] = []
    for value in values:
        clean = _clean_text(value, 2_000)
        if clean.lower().startswith("https://") and clean not in result:
            result.append(clean)
    return result[:4]


def _original_contents(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    found = {str(item).strip().lower() for item in value}
    return [key for key in ORIGINAL_CONTENT_KEYS if key in found]


def build_collector_learning_snapshot(
    queue: dict[str, Any] | None,
    *,
    updated_at: str,
) -> dict[str, Any]:
    games: dict[str, dict[str, Any]] = {}
    for raw_item in (queue or {}).get("items") or []:
        item = _record(raw_item)
        decision = _record(item.get("decision"))
        if item.get("status") != "accepted" or decision.get("action") != "accept":
            continue
        catalog_id = _catalog_id(
            decision.get("catalogId") or item.get("catalogId") or item.get("candidateCatalogId"),
        )
        source = normalize_collector_source(item.get("source"))
        if not catalog_id or not source:
            continue
        evidence = _record(item.get("evidence"))
        decided_at = _clean_text(item.get("decidedAt") or item.get("updatedAt"), 80) or updated_at
        game = games.setdefault(
            catalog_id,
            {
                "catalogId": catalog_id,
                "approvedExamples": [],
                "successfulQueries": {},
                "_contentDecidedAt": "",
            },
        )

        images = _image_urls(evidence)
        region = _clean_text(
            decision.get("region") or item.get("detectedRegion") or item.get("targetRegion"),
            120,
        ) or None
        condition = _clean_text(decision.get("condition") or item.get("condition"), 80) or None
        region_evidence = _string_list(evidence.get("regionEvidence"), limit=16)
        note = _clean_text(decision.get("note"), 500) or None
        if images or region or condition or region_evidence or note:
            game["approvedExamples"].append(
                {
                    "source": source,
                    "region": region,
                    "condition": condition,
                    "regionEvidence": region_evidence,
                    "note": note,
                    "imageUrls": images,
                    "searchQuery": _clean_text(evidence.get("searchQuery"), 180) or None,
                    "decidedAt": decided_at,
                }
            )

        contents = _original_contents(decision.get("originalContents"))
        evidence_manual = evidence.get("manualExpected")
        manual = evidence_manual if isinstance(evidence_manual, bool) else None
        if decided_at >= str(game.get("_contentDecidedAt") or "") and (
            contents is not None or manual is not None
        ):
            game["_contentDecidedAt"] = decided_at
            if contents is not None:
                game["originalContentsExpected"] = contents
                game["manualExpected"] = "manual" in contents
            else:
                game["manualExpected"] = manual

        query = _clean_text(evidence.get("searchQuery"), 180)
        if query:
            source_queries = game["successfulQueries"].setdefault(source, {})
            query_key = query.lower()
            previous = source_queries.get(query_key) or {}
            source_queries[query_key] = {
                "query": query,
                "acceptedCount": int(previous.get("acceptedCount") or 0) + 1,
                "lastAcceptedAt": max(str(previous.get("lastAcceptedAt") or ""), decided_at),
            }

    serialized: dict[str, Any] = {}
    for catalog_id in sorted(games):
        game = games[catalog_id]
        game.pop("_contentDecidedAt", None)
        game["approvedExamples"] = sorted(
            game["approvedExamples"],
            key=lambda row: str(row.get("decidedAt") or ""),
            reverse=True,
        )[:3]
        successful: dict[str, list[dict[str, Any]]] = {}
        for source, query_map in sorted(game["successfulQueries"].items()):
            ordered_queries = sorted(
                query_map.values(),
                key=lambda row: str(row.get("query") or ""),
            )
            successful[source] = sorted(
                ordered_queries,
                key=lambda row: (
                    int(row.get("acceptedCount") or 0),
                    str(row.get("lastAcceptedAt") or ""),
                ),
                reverse=True,
            )[:5]
        game["successfulQueries"] = successful
        serialized[catalog_id] = game

    return {
        "schemaVersion": COLLECTOR_LEARNING_SCHEMA_VERSION,
        "policyVersion": COLLECTOR_INTELLIGENCE_POLICY,
        "updatedAt": updated_at,
        "games": serialized,
    }


def write_collector_learning_snapshot(
    queue: dict[str, Any],
    output_file: Path,
    *,
    updated_at: str,
) -> dict[str, Any]:
    snapshot = build_collector_learning_snapshot(queue, updated_at=updated_at)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return snapshot


__all__ = [
    "COLLECTOR_INTELLIGENCE_POLICY",
    "COLLECTOR_LEARNING_SCHEMA_VERSION",
    "DEFAULT_LEARNING_FILE",
    "apply_collector_game_context",
    "build_collector_learning_snapshot",
    "collector_game_context",
    "collector_game_learning",
    "collector_learning_payload",
    "collector_source_policy",
    "learned_source_queries",
    "normalize_collector_source",
    "write_collector_learning_snapshot",
]
