"""Clasificación conservadora de revisiones TodoConsolas.

Solo considera automático un enlace demostrado por título canónico o GTIN,
siempre con plataforma y región exactas. El resto se separa en bandejas para
que el panel admin no presente cientos de casos distintos como una sola cola.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from collectors.catalog_match import CatalogMatchResult
from collectors.reference_match import extract_references_from_text
from collectors.region_inference import normalize_region
from collectors.tcns_match import canonical_tcns_title, infer_tcns_region_product
from collectors.tcns_policy import POLICY_VERSION, tcns_auto_match_decision

TRIAGE_BUCKETS = (
    "safe_exact",
    "manual_match",
    "catalog_gap",
    "regional_variant",
    "price_anomaly",
    "missing_region",
)


@dataclass(frozen=True)
class TcnsTriageIndex:
    games_by_id: dict[str, dict[str, Any]]
    title_to_ids: dict[tuple[str, str], tuple[str, ...]]
    reference_to_ids: dict[tuple[str, str], tuple[str, ...]]


@dataclass(frozen=True)
class TcnsTriageDecision:
    bucket: str
    policy_reason: str
    catalog_id: str | None = None
    match_method: str | None = None
    matched_reference: str | None = None
    match_score: float | None = None
    match_margin: float | None = None


def _append_index(index: dict[tuple[str, str], list[str]], key: tuple[str, str], catalog_id: str) -> None:
    if not key[0] or not key[1]:
        return
    values = index.setdefault(key, [])
    if catalog_id not in values:
        values.append(catalog_id)


def build_tcns_triage_index(
    catalog_games: list[dict[str, Any]],
    details_by_id: dict[str, dict[str, Any]],
) -> TcnsTriageIndex:
    games_by_id: dict[str, dict[str, Any]] = {}
    title_index: dict[tuple[str, str], list[str]] = {}
    reference_index: dict[tuple[str, str], list[str]] = {}

    for game in catalog_games:
        if game.get("listingStatus") == "excluded":
            continue
        catalog_id = str(game.get("id") or "").strip()
        platform_slug = str(game.get("platformSlug") or "").strip()
        if not catalog_id or not platform_slug:
            continue
        games_by_id[catalog_id] = game
        title = canonical_tcns_title(str(game.get("title") or ""), platform_slug)
        _append_index(title_index, (platform_slug, title), catalog_id)

        details = details_by_id.get(catalog_id) or {}
        reference_text = " ".join(
            str(details.get(key) or "") for key in ("reference", "ean")
        )
        for reference in extract_references_from_text(reference_text):
            _append_index(reference_index, (platform_slug, reference), catalog_id)

    return TcnsTriageIndex(
        games_by_id=games_by_id,
        title_to_ids={key: tuple(values) for key, values in title_index.items()},
        reference_to_ids={key: tuple(values) for key, values in reference_index.items()},
    )


def _exact_region_ids(
    ids: set[str],
    listing_region: str | None,
    games_by_id: dict[str, dict[str, Any]],
) -> set[str]:
    normalized = normalize_region(listing_region or "")
    if not normalized:
        return set()
    return {
        catalog_id
        for catalog_id in ids
        if normalize_region(str((games_by_id.get(catalog_id) or {}).get("region") or "")) == normalized
    }


def _product_references(product: dict[str, Any]) -> set[str]:
    text = " ".join(
        str(product.get(key) or "")
        for key in ("productUrl", "listingUrl", "ean", "reference")
    )
    return extract_references_from_text(text)


def _price_is_invalid(product: dict[str, Any]) -> bool:
    try:
        value = float(product.get("priceEur"))
    except (TypeError, ValueError):
        return True
    return value < 3 or value > 1000


def _unique_exact_candidate(
    title_ids: set[str],
    reference_ids: set[str],
) -> tuple[str | None, str | None]:
    if title_ids and reference_ids:
        intersection = title_ids & reference_ids
        if len(intersection) == 1:
            return next(iter(intersection)), "reference"
        if len(title_ids) == 1 and len(reference_ids) == 1 and title_ids != reference_ids:
            return None, None
        if len(reference_ids) == 1 and not title_ids.isdisjoint(reference_ids):
            return next(iter(reference_ids)), "reference"
        if len(title_ids) == 1 and not reference_ids.isdisjoint(title_ids):
            return next(iter(title_ids)), "title"
        return None, None
    if len(reference_ids) == 1:
        return next(iter(reference_ids)), "reference"
    if len(title_ids) == 1:
        return next(iter(title_ids)), "title"
    return None, None


def triage_tcns_product(
    product: dict[str, Any],
    platform_slug: str,
    index: TcnsTriageIndex,
) -> TcnsTriageDecision:
    listing_region = infer_tcns_region_product(product)
    if not listing_region:
        return TcnsTriageDecision("missing_region", "listing_region_missing")
    if _price_is_invalid(product):
        return TcnsTriageDecision("price_anomaly", "price_out_of_range")

    canonical_title = canonical_tcns_title(str(product.get("title") or ""), platform_slug)
    all_title_ids = set(index.title_to_ids.get((platform_slug, canonical_title), ()))
    references = _product_references(product)
    all_reference_ids = {
        catalog_id
        for reference in references
        for catalog_id in index.reference_to_ids.get((platform_slug, reference), ())
    }
    title_ids = _exact_region_ids(all_title_ids, listing_region, index.games_by_id)
    reference_ids = _exact_region_ids(all_reference_ids, listing_region, index.games_by_id)
    catalog_id, match_method = _unique_exact_candidate(title_ids, reference_ids)

    if catalog_id and match_method:
        game = index.games_by_id[catalog_id]
        matched_reference = None
        if match_method == "reference":
            matched_reference = next(
                (
                    reference
                    for reference in sorted(references)
                    if catalog_id in index.reference_to_ids.get((platform_slug, reference), ())
                ),
                None,
            )
        result = CatalogMatchResult(
            game=game,
            matched_reference=matched_reference,
            match_method=match_method,
            match_score=1.0,
            margin=1.0,
        )
        approved, policy_reason = tcns_auto_match_decision(product, result, platform_slug)
        if approved:
            return TcnsTriageDecision(
                "safe_exact",
                policy_reason,
                catalog_id=catalog_id,
                match_method=match_method,
                matched_reference=matched_reference,
                match_score=1.0,
                match_margin=1.0,
            )
        if policy_reason in {"price_out_of_range", "price_change_requires_review"}:
            bucket = "price_anomaly"
        elif policy_reason == "listing_region_missing":
            bucket = "missing_region"
        elif policy_reason == "catalog_region_not_exact":
            bucket = "regional_variant"
        else:
            bucket = "manual_match"
        return TcnsTriageDecision(bucket, policy_reason, catalog_id=catalog_id)

    if all_title_ids or all_reference_ids:
        exact_region_union = title_ids | reference_ids
        if not exact_region_union:
            return TcnsTriageDecision("regional_variant", "catalog_region_not_exact")
        return TcnsTriageDecision("manual_match", "catalog_match_not_unique")

    alternatives = product.get("matchAlternatives") or product.get("alternatives") or []
    candidate = str(product.get("candidateCatalogId") or product.get("catalogId") or "").strip()
    if candidate or (isinstance(alternatives, list) and alternatives):
        return TcnsTriageDecision("manual_match", "catalog_match_not_unique")
    return TcnsTriageDecision("catalog_gap", "catalog_not_found")


def approved_tcns_ingest_row(
    product: dict[str, Any],
    decision: TcnsTriageDecision,
    index: TcnsTriageIndex,
    collected_at: str,
) -> dict[str, Any]:
    if decision.bucket != "safe_exact" or not decision.catalog_id:
        raise ValueError("Solo una decisión exacta puede convertirse en precio aprobado")
    game = index.games_by_id[decision.catalog_id]
    listing_region = infer_tcns_region_product(product)
    row: dict[str, Any] = {
        "catalogId": decision.catalog_id,
        "source": "todoconsolas",
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "title": str(product.get("title") or ""),
        "priceEur": round(float(product["priceEur"]), 2),
        "retailPriceEur": round(float(product["priceEur"]), 2),
        "currency": "EUR",
        "productUrl": str(product.get("productUrl") or product.get("listingUrl") or ""),
        "externalId": str(product.get("externalId") or ""),
        "condition": "preowned",
        "conditionRaw": str(product.get("conditionRaw") or "Segunda mano"),
        "collectedAt": collected_at,
        "listingRegion": listing_region,
        "catalogRegion": str(game.get("region") or ""),
        "regionVerified": True,
        "regionEvidence": ["listing_title_region", "catalog_title_exact"],
        "matchMethod": decision.match_method,
        "matchScore": decision.match_score,
        "matchMargin": decision.match_margin,
        "autoApproved": True,
        "acceptancePolicy": POLICY_VERSION,
    }
    if decision.matched_reference:
        row["matchedReference"] = decision.matched_reference
        row["regionEvidence"] = ["listing_title_region", "catalog_reference_exact"]
    return row


def queue_item_as_product(item: dict[str, Any]) -> dict[str, Any]:
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    return {
        "title": item.get("listingTitle"),
        "priceEur": item.get("priceEur"),
        "conditionRaw": evidence.get("conditionRaw") or "Segunda mano",
        "productUrl": evidence.get("url"),
        "candidateCatalogId": item.get("candidateCatalogId"),
        "catalogId": item.get("catalogId"),
        "matchAlternatives": evidence.get("matchAlternatives") or [],
    }


__all__ = [
    "TRIAGE_BUCKETS",
    "TcnsTriageDecision",
    "TcnsTriageIndex",
    "approved_tcns_ingest_row",
    "build_tcns_triage_index",
    "queue_item_as_product",
    "triage_tcns_product",
]
