"""Cola persistente de anuncios/precios dudosos para /admin/precios."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from collectors.common import ROOT, load_json, now_iso, save_json
from collectors.tcns_policy import POLICY_VERSION

QUEUE_FILE = ROOT / "data" / "admin" / "price-review-queue.json"
MAX_REVIEW_QUEUE_ITEMS = 5_000
REVIEW_KEYS = (
    "listings",
    "regionalCandidates",
    "cex",
    "jgo",
    "chollo",
    "kaoto",
    "tcns",
    "tc",
)


def _item_id(row: dict[str, Any], source: str, platform_slug: str) -> str:
    raw = "|".join(
        [
            source,
            platform_slug,
            str(row.get("candidateCatalogId") or row.get("catalogId") or ""),
            str(row.get("productUrl") or row.get("listingUrl") or ""),
            str(row.get("title") or ""),
            str(row.get("priceEur") or row.get("retailPriceEur") or ""),
        ]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def _reason(row: dict[str, Any]) -> str | None:
    if (
        str(row.get("source") or "").strip().lower() == "todoconsolas"
        and row.get("autoApproved") is True
        and row.get("acceptancePolicy") == POLICY_VERSION
    ):
        return None
    notes = [str(item) for item in (row.get("regionReviewNotes") or []) if str(item).strip()]
    if row.get("regionReviewNeeded"):
        return str(row.get("regionReviewReason") or "").strip() or "; ".join(notes) or "region_no_confirmada"
    if row.get("regionVerified") is not True:
        return "sin_prueba_region"
    alternatives = row.get("matchAlternatives") or []
    if isinstance(alternatives, list) and len(alternatives) > 1:
        return "match_ambiguo"
    if str(row.get("condition") or "unknown") == "unknown":
        return "estado_desconocido"
    return None


def _source_for_key(row: dict[str, Any], fallback: str) -> str:
    return str(row.get("source") or fallback).strip().lower() or fallback


def _triage_bucket(row: dict[str, Any], source: str, reason: str) -> str:
    if source != "todoconsolas":
        return "manual_match"
    explicit = str(row.get("triageBucket") or "").strip()
    if explicit in {
        "manual_match",
        "catalog_gap",
        "regional_variant",
        "price_anomaly",
        "missing_region",
    }:
        return explicit
    if reason in {"price_out_of_range", "price_change_requires_review"}:
        return "price_anomaly"
    if reason == "catalog_region_not_exact":
        return "regional_variant"
    if reason == "listing_region_missing":
        return "missing_region"
    alternatives = row.get("matchAlternatives") or []
    candidate = str(row.get("candidateCatalogId") or row.get("catalogId") or "").strip()
    if not candidate and not alternatives:
        return "catalog_gap"
    return "manual_match"


def _row_to_item(row: dict[str, Any], source: str, platform_slug: str, ingest: dict[str, Any]) -> dict[str, Any] | None:
    reason = str(row.get("triageReason") or "").strip() or _reason(row)
    if not reason:
        return None
    catalog_id = str(row.get("catalogId") or "").strip()
    candidate_catalog_id = str(
        row.get("triageCatalogId") or row.get("candidateCatalogId") or catalog_id
    ).strip()
    title = str(row.get("title") or "").strip()
    price = row.get("priceEur") if row.get("priceEur") is not None else row.get("retailPriceEur")
    if not title or price is None:
        return None
    return {
        "id": _item_id(row, source, platform_slug),
        "status": "pending",
        "source": source,
        "platformSlug": platform_slug,
        "targetRegion": row.get("searchedCatalogRegion") or ingest.get("region") or row.get("catalogRegion"),
        "detectedRegion": row.get("listingRegion"),
        "catalogId": catalog_id or None,
        "candidateCatalogId": candidate_catalog_id or None,
        "listingTitle": title,
        "priceEur": price,
        "condition": row.get("condition") or "unknown",
        "reason": reason,
        "triageBucket": _triage_bucket(row, source, reason),
        "triageReason": reason,
        "triageCatalogId": candidate_catalog_id or None,
        "triageMatchMethod": row.get("triageMatchMethod") or row.get("matchMethod"),
        "triageMatchedReference": row.get("triageMatchedReference") or row.get("matchedReference"),
        "evidence": {
            "url": row.get("productUrl") or row.get("listingUrl"),
            "imageUrl": row.get("imageUrl"),
            "imageUrls": row.get("imageUrls"),
            "catalogTitle": row.get("catalogTitle"),
            "catalogCoverUrl": row.get("catalogCoverUrl"),
            "regionEvidence": row.get("regionEvidence") or [],
            "matchMethod": row.get("triageMatchMethod") or row.get("matchMethod"),
            "matchScore": row.get("matchScore"),
            "matchMargin": row.get("matchMargin"),
            "matchAlternatives": row.get("matchAlternatives") or [],
            "aiConfidence": row.get("aiConfidence"),
            "reviewNotes": row.get("regionReviewNotes") or [],
            "conditionRaw": row.get("conditionRaw"),
            "searchedCatalogId": row.get("searchedCatalogId"),
            "originCountry": row.get("originCountry"),
            "originRegionHint": row.get("originRegionHint"),
            "routingReason": row.get("regionalRoutingReason") or row.get("regionReviewReason"),
            "matchedReference": row.get("triageMatchedReference") or row.get("matchedReference"),
        },
        "jobId": ingest.get("jobId"),
        "collectedAt": row.get("collectedAt") or ingest.get("collectedAt") or now_iso(),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }


def load_price_review_queue() -> dict[str, Any]:
    data = load_json(QUEUE_FILE, {})
    if not isinstance(data, dict):
        data = {}
    return {
        "schemaVersion": 1,
        "updatedAt": data.get("updatedAt") or now_iso(),
        "items": data.get("items") if isinstance(data.get("items"), list) else [],
        "decisions": data.get("decisions") if isinstance(data.get("decisions"), list) else [],
    }


def merge_price_review_queue_documents(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    existing_items = {
        str(item.get("id")): item
        for item in (existing.get("items") or [])
        if isinstance(item, dict) and item.get("id")
    }
    for item in incoming.get("items") or []:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        item_id = str(item["id"])
        previous = existing_items.get(item_id)
        if previous and previous.get("status") in {"accepted", "rejected"}:
            continue
        existing_items[item_id] = {
            **(previous or {}),
            **item,
            "createdAt": (previous or {}).get("createdAt") or item.get("createdAt") or now_iso(),
        }

    decisions: list[dict[str, Any]] = []
    seen_decisions: set[str] = set()
    for decision in [*(existing.get("decisions") or []), *(incoming.get("decisions") or [])]:
        if not isinstance(decision, dict):
            continue
        key = json.dumps(decision, ensure_ascii=False, sort_keys=True, default=str)
        if key in seen_decisions:
            continue
        seen_decisions.add(key)
        decisions.append(decision)
    return {
        "schemaVersion": 1,
        "updatedAt": now_iso(),
        "items": sorted(
            existing_items.values(),
            key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""),
            reverse=True,
        )[:MAX_REVIEW_QUEUE_ITEMS],
        "decisions": decisions,
    }


def record_price_review_candidates(ingest: dict[str, Any], platform_slug: str) -> dict[str, int]:
    queue = load_price_review_queue()
    existing = {str(item.get("id")): item for item in queue["items"] if isinstance(item, dict) and item.get("id")}
    decided = {
        str(item.get("id"))
        for item in queue["items"]
        if isinstance(item, dict) and item.get("status") in {"accepted", "rejected"}
    }
    added = 0
    updated = 0

    for key in REVIEW_KEYS:
        rows = ingest.get(key) or []
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            source = _source_for_key(row, key)
            item = _row_to_item(row, source, platform_slug, ingest)
            if not item:
                resolved_id = _item_id(row, source, platform_slug)
                previous = existing.get(resolved_id)
                if previous and previous.get("status") == "pending":
                    existing[resolved_id] = {
                        **previous,
                        "status": "accepted",
                        "decision": "auto_resolved",
                        "decisionReason": row.get("reviewReason") or "resolved_by_import",
                        "updatedAt": now_iso(),
                    }
                    updated += 1
                continue
            if item["id"] in decided:
                continue
            previous = existing.get(item["id"])
            if previous:
                existing[item["id"]] = {**previous, **item, "createdAt": previous.get("createdAt") or item["createdAt"]}
                updated += 1
            else:
                existing[item["id"]] = item
                added += 1

    queue["items"] = sorted(
        existing.values(),
        key=lambda item: str(item.get("updatedAt") or ""),
        reverse=True,
    )[:MAX_REVIEW_QUEUE_ITEMS]
    queue["updatedAt"] = now_iso()
    save_json(QUEUE_FILE, queue)
    return {"added": added, "updated": updated, "pending": sum(1 for item in queue["items"] if item.get("status") == "pending")}


__all__ = [
    "QUEUE_FILE",
    "MAX_REVIEW_QUEUE_ITEMS",
    "load_price_review_queue",
    "merge_price_review_queue_documents",
    "record_price_review_candidates",
]
