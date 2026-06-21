"""Cola persistente de anuncios/precios dudosos para /admin/precios."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from collectors.common import ROOT, load_json, now_iso, save_json

QUEUE_FILE = ROOT / "data" / "admin" / "price-review-queue.json"
REVIEW_KEYS = ("listings", "cex", "jgo", "chollo", "kaoto", "tcns", "tc")


def _item_id(row: dict[str, Any], source: str, platform_slug: str) -> str:
    raw = "|".join(
        [
            source,
            platform_slug,
            str(row.get("catalogId") or ""),
            str(row.get("productUrl") or row.get("listingUrl") or ""),
            str(row.get("title") or ""),
            str(row.get("priceEur") or row.get("retailPriceEur") or ""),
        ]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def _reason(row: dict[str, Any]) -> str | None:
    notes = [str(item) for item in (row.get("regionReviewNotes") or []) if str(item).strip()]
    if row.get("regionReviewNeeded"):
        return "; ".join(notes) or "region_no_confirmada"
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


def _row_to_item(row: dict[str, Any], source: str, platform_slug: str, ingest: dict[str, Any]) -> dict[str, Any] | None:
    reason = _reason(row)
    if not reason:
        return None
    catalog_id = str(row.get("catalogId") or "").strip()
    title = str(row.get("title") or "").strip()
    price = row.get("priceEur") if row.get("priceEur") is not None else row.get("retailPriceEur")
    if not title or price is None:
        return None
    return {
        "id": _item_id(row, source, platform_slug),
        "status": "pending",
        "source": source,
        "platformSlug": platform_slug,
        "targetRegion": ingest.get("region") or row.get("catalogRegion"),
        "detectedRegion": row.get("listingRegion"),
        "catalogId": catalog_id or None,
        "candidateCatalogId": catalog_id or None,
        "listingTitle": title,
        "priceEur": price,
        "condition": row.get("condition") or "unknown",
        "reason": reason,
        "evidence": {
            "url": row.get("productUrl") or row.get("listingUrl"),
            "imageUrl": row.get("imageUrl"),
            "imageUrls": row.get("imageUrls"),
            "regionEvidence": row.get("regionEvidence") or [],
            "matchMethod": row.get("matchMethod"),
            "matchScore": row.get("matchScore"),
            "matchMargin": row.get("matchMargin"),
            "matchAlternatives": row.get("matchAlternatives") or [],
            "aiConfidence": row.get("aiConfidence"),
            "reviewNotes": row.get("regionReviewNotes") or [],
            "conditionRaw": row.get("conditionRaw"),
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

    queue["items"] = sorted(existing.values(), key=lambda item: str(item.get("updatedAt") or ""), reverse=True)[:1000]
    queue["updatedAt"] = now_iso()
    save_json(QUEUE_FILE, queue)
    return {"added": added, "updated": updated, "pending": sum(1 for item in queue["items"] if item.get("status") == "pending")}


__all__ = ["QUEUE_FILE", "load_price_review_queue", "record_price_review_candidates"]
