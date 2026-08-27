"""Cola revisable de imágenes eBay obtenidas durante la campaña de precios."""

from __future__ import annotations

import hashlib
from typing import Any


MAX_IMAGES_PER_GAME = 3


def empty_cover_queue() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "updatedAt": None,
        "totals": {"games": 0, "images": 0, "platforms": 0},
        "games": {},
    }


def _http_url(value: Any) -> str | None:
    text = str(value or "").strip()
    return text if text.startswith(("https://", "http://")) else None


def _candidate_id(catalog_id: str, external_id: str, image_url: str) -> str:
    raw = f"{catalog_id}:{external_id}:{image_url}".encode("utf-8")
    return f"ebay-{hashlib.sha256(raw).hexdigest()[:16]}"


def _candidate_from_listing(catalog_id: str, row: dict[str, Any], at: str) -> dict[str, Any] | None:
    image_url = _http_url(row.get("imageUrl"))
    if not image_url:
        image_urls = row.get("imageUrls") if isinstance(row.get("imageUrls"), list) else []
        image_url = next((_http_url(value) for value in image_urls if _http_url(value)), None)
    if not image_url:
        return None
    external_id = str(row.get("externalId") or "").strip()
    return {
        "id": _candidate_id(catalog_id, external_id, image_url),
        "source": "ebay_listing",
        "assetKind": "listing_photo",
        "persistence": "review_required",
        "imageUrl": image_url,
        "productUrl": _http_url(row.get("productUrl")),
        "listingTitle": str(row.get("title") or "").strip() or None,
        "externalId": external_id or None,
        "confidence": row.get("aiConfidence"),
        "regionEvidence": [str(value) for value in row.get("regionEvidence") or []],
        "originCountry": str(row.get("originCountry") or "").strip().upper() or None,
        "firstSeenAt": at,
        "lastSeenAt": at,
    }


def merge_cover_candidates(
    current: dict[str, Any] | None,
    catalog: list[dict[str, Any]],
    listings: list[dict[str, Any]],
    *,
    at: str,
) -> tuple[dict[str, Any], int]:
    """Añade fotos solo para fichas sin portada; nunca publica ni reemplaza carátulas."""
    queue = {**empty_cover_queue(), **(current or {})}
    games_state = queue.get("games") if isinstance(queue.get("games"), dict) else {}
    catalog_by_id = {str(game.get("id")): game for game in catalog}

    # Si una portada ya fue resuelta por otra fuente, su cola deja de ser necesaria.
    games_state = {
        catalog_id: value
        for catalog_id, value in games_state.items()
        if catalog_id in catalog_by_id and not str(catalog_by_id[catalog_id].get("coverUrl") or "").strip()
    }

    added = 0
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in listings:
        catalog_id = str(row.get("catalogId") or "").strip()
        game = catalog_by_id.get(catalog_id)
        if not game or str(game.get("coverUrl") or "").strip():
            continue
        candidate = _candidate_from_listing(catalog_id, row, at)
        if candidate:
            grouped.setdefault(catalog_id, []).append(candidate)

    for catalog_id, candidates in grouped.items():
        game = catalog_by_id[catalog_id]
        existing = games_state.get(catalog_id) if isinstance(games_state.get(catalog_id), dict) else {}
        existing_candidates = existing.get("candidates") if isinstance(existing.get("candidates"), list) else []
        by_id = {str(candidate.get("id")): candidate for candidate in existing_candidates if candidate.get("id")}
        for candidate in candidates:
            prior = by_id.get(candidate["id"])
            if prior:
                by_id[candidate["id"]] = {
                    **prior,
                    **candidate,
                    "firstSeenAt": prior.get("firstSeenAt") or candidate["firstSeenAt"],
                }
            else:
                by_id[candidate["id"]] = candidate
                added += 1
        ranked = sorted(
            by_id.values(),
            key=lambda candidate: (
                -(float(candidate.get("confidence") or 0)),
                str(candidate.get("firstSeenAt") or ""),
            ),
        )[:MAX_IMAGES_PER_GAME]
        games_state[catalog_id] = {
            "catalogId": catalog_id,
            "title": str(game.get("title") or catalog_id),
            "platformSlug": str(game.get("platformSlug") or ""),
            "region": str(game.get("region") or ""),
            "status": "pending_review",
            "firstSeenAt": existing.get("firstSeenAt") or at,
            "lastSeenAt": at,
            "candidates": ranked,
        }

    queue["games"] = dict(
        sorted(
            games_state.items(),
            key=lambda item: (
                str(item[1].get("platformSlug") or ""),
                str(item[1].get("title") or "").casefold(),
                item[0],
            ),
        )
    )
    queue["updatedAt"] = at
    queue["totals"] = {
        "games": len(games_state),
        "images": sum(len(value.get("candidates") or []) for value in games_state.values()),
        "platforms": len({str(value.get("platformSlug") or "") for value in games_state.values()}),
    }
    return queue, added


__all__ = ["empty_cover_queue", "merge_cover_candidates"]
