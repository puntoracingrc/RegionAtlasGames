"""Matching catálogo ↔ anuncios Wallapop ES."""

from __future__ import annotations

import re
from typing import Any

from collectors.catalog_match import is_manual_only_listing, product_title
from collectors.condition_buckets import DISPLAY_BUCKETS, infer_condition_bucket
from collectors.jgo_match import infer_condition
from collectors.listing_images import attach_image_urls
from collectors.reference_match import listing_reference_valid_for_catalog
from collectors.wallapop_listing_ai import ListingAiResult
from collectors.region_inference import (
    detect_listing_region,
    infer_listing_evidence,
    regions_match,
)
from region_evidence_rules import check_listing_evidence_meets_rules

NON_GAME_RE = re.compile(
    r"\b("
    r"consola|console|adaptador|adapter|cable|mando|controller|"
    r"pistola|cat[aá]logo|vhs|poster|mapa|"
    r"figura|funko|amiibo|merchandising|"
    r"solamente la caja|solo la caja|solo caja|sin juego|caja vac[ií]a|"
    r"lote \d+|lot \d+"
    r")\b",
    re.I,
)


def is_wallapop_game_listing(title: str, *, description: str = "") -> bool:
    text = f"{title} {description}".strip()
    if len(title.strip()) < 4:
        return False
    if is_manual_only_listing(text, title=title):
        return False
    return not NON_GAME_RE.search(text)


def is_wallapop_game_product(product: dict[str, Any]) -> bool:
    return is_wallapop_game_listing(
        product_title(product),
        description=str(product.get("description") or ""),
    )


def infer_wallapop_region_product(product: dict[str, Any]) -> str | None:
    title = product_title(product)
    desc = str(product.get("description") or "")
    return detect_listing_region(f"{title} {desc}")


def product_to_ingest_row(
    product: dict[str, Any],
    catalog_id: str,
    catalog_region: str,
    platform_slug: str,
    *,
    ref_to_ids: dict[str, list[str]] | None = None,
    matched_reference: str | None = None,
    match_method: str = "title",
    match_score: float | None = None,
    match_margin: float | None = None,
    match_alternatives: list[dict[str, Any]] | None = None,
    ai_confidence: float | None = None,
    listing_ai: Any | None = None,
) -> dict[str, Any] | None:
    title = product_title(product)
    description = str(product.get("description") or "").strip()
    full_text = f"{title} {description}".strip()
    price = product.get("priceEur")
    if price is None or float(price) <= 0:
        return None

    ok_ref, matched_ref = listing_reference_valid_for_catalog(
        full_text,
        catalog_id,
        catalog_region,
        ref_to_ids=ref_to_ids,
    )
    if matched_ref and not matched_reference:
        matched_reference = matched_ref

    listing_region, evidence, ai_conf = infer_listing_evidence(
        full_text,
        catalog_region,
        matched_reference=matched_reference,
    )
    detected = detect_listing_region(full_text)
    if detected:
        listing_region = detected
        if not regions_match(catalog_region, detected):
            evidence = ["listing_title_region"]
            if detected in ("Japón", "Japan"):
                evidence.append("cover_japan")
            elif detected == "USA":
                evidence.append("cover_usa")
            ai_conf = min(float(ai_conf or 0), 0.72)

    if product.get("imageUrl") and "photo_region_mark" not in evidence:
        evidence = [*evidence, "photo_region_mark"]
        if regions_match(catalog_region, listing_region):
            ai_conf = max(float(ai_conf or 0), 0.86)

    ai_result: ListingAiResult | None = None
    if listing_ai is not None:
        ai_result = listing_ai if isinstance(listing_ai, ListingAiResult) else ListingAiResult.from_dict(listing_ai)
        if ai_result.listing_region:
            listing_region = ai_result.listing_region
            if ai_result.region_matches_catalog is True:
                evidence = [*evidence, "listing_ai_region"]
                ai_conf = max(float(ai_conf or 0), float(ai_result.confidence))
            elif ai_result.region_matches_catalog is False and not regions_match(
                catalog_region, listing_region
            ):
                evidence = [*evidence, "listing_ai_region_mismatch"]
        if ai_result.confidence:
            ai_confidence = ai_result.confidence

    rules_ok, rules_reason = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_conf
    )
    region_matches = regions_match(catalog_region, listing_region)
    region_verified = ok_ref and region_matches and rules_ok

    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": "wallapop",
        "listingType": str(product.get("listingType") or "active"),
        "priceEur": round(float(price), 2),
        "listingRegion": listing_region,
        "regionVerified": region_verified,
        "regionEvidence": evidence,
        "aiConfidence": ai_conf,
        "productUrl": str(product.get("productUrl") or ""),
        "title": title,
        "matchMethod": match_method,
        "catalogRegion": catalog_region,
    }
    if not region_verified:
        row["regionReviewNeeded"] = True
        notes: list[str] = []
        if not ok_ref:
            notes.append("referencia_no_coincide")
        if listing_region and not region_matches:
            notes.append(f"region_detectada_{listing_region}")
        elif not listing_region:
            notes.append("region_no_detectada")
        if not rules_ok and rules_reason:
            notes.append(str(rules_reason))
        if notes:
            row["regionReviewNotes"] = notes
    external_id = str(product.get("externalId") or "").strip()
    if external_id:
        row["externalId"] = external_id
    if matched_reference:
        row["matchedReference"] = matched_reference
    if match_score is not None:
        row["matchScore"] = round(float(match_score), 3)
    if match_margin is not None:
        row["matchMargin"] = round(float(match_margin), 3)
    if match_alternatives:
        row["matchAlternatives"] = match_alternatives
    if ai_confidence is not None:
        row["aiConfidence"] = round(float(ai_confidence), 3)
    if product.get("listedAt"):
        row["listedAt"] = product["listedAt"]
    raw_cond = infer_condition(full_text)
    bucket = infer_condition_bucket(full_text, condition_raw=raw_cond)
    if ai_result and not bucket and ai_result.condition in DISPLAY_BUCKETS:
        bucket = ai_result.condition
    if bucket:
        row["condition"] = bucket
    if ai_result and match_method == "search":
        row["matchMethod"] = "search+ai"
    attach_image_urls(row, product, "wallapop")
    return row


__all__ = [
    "infer_wallapop_region_product",
    "is_wallapop_game_listing",
    "is_wallapop_game_product",
    "product_to_ingest_row",
]
