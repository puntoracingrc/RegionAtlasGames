"""Additive eBay inbox consumed by the existing Admin review queue."""

from collectors.common import load_json, now_iso, save_json
from collectors.price_review_queue import REVIEW_KEYS, _row_to_item


def publish_review_inbox(path, ingest, platform, batch_id):
    previous = load_json(path, {"items": [], "decisions": []})
    items = {item["id"]: item for item in previous.get("items", [])}
    for key in REVIEW_KEYS:
        for row in ingest.get(key) or []:
            if not str(row.get("source", "")).startswith("ebay"):
                continue
            item = _row_to_item(row, row["source"], platform, ingest)
            if not item:
                continue
            old = items.get(item["id"])
            if old and old.get("status") in {"accepted", "rejected"}:
                continue
            item["jobId"] = batch_id
            item["createdAt"] = (old or {}).get("createdAt") or item["createdAt"]
            items[item["id"]] = item
    # Do not use the generic 5,000-item truncation: unrelated pending evidence
    # must not be silently removed as the eBay campaign grows.
    save_json(path, {"schemaVersion": 1, "updatedAt": now_iso(),
                     "items": list(items.values()), "decisions": previous.get("decisions", [])})
    return len(items)
