"""Resolución de región en el mismo paso del anuncio (texto → visión si falta prueba)."""

from __future__ import annotations

import os
from typing import Any

from collectors.condition_buckets import DISPLAY_BUCKETS
from collectors.listing_images import (
    attach_image_urls,
    extract_product_image_urls,
    row_image_urls,
)
from collectors.region_cover_vision import apply_region_cover_vision, region_cover_vision_available
from collectors.region_inference import regions_match
from region_evidence_rules import check_listing_evidence_meets_rules

# P2P: descartar fila si, tras visión, la región sigue sin verificar.
STRICT_LISTING_SOURCES = frozenset(
    {
        "todocoleccion",
        "ebay-es",
        "wallapop",
        "vinted-es",
    }
)


def region_needs_cover_vision(
    *,
    platform_slug: str,
    catalog_region: str,
    listing_region: str,
    evidence: list[str],
    ai_conf: float,
    ok_ref: bool,
) -> bool:
    """True solo si faltan pruebas de región y la visión podría resolverlo."""
    if not ok_ref:
        return False
    if os.environ.get("REGION_VISION_DISABLED", "").strip():
        return False
    if not region_cover_vision_available():
        return False
    rules_ok, _ = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_conf
    )
    return not (rules_ok and regions_match(catalog_region, listing_region))


def enrich_listing_region_from_cover(
    *,
    platform_slug: str,
    catalog_region: str,
    game_title: str,
    listing_title: str,
    listing_region: str,
    evidence: list[str],
    ai_conf: float,
    ok_ref: bool,
    source: str,
    product: dict[str, Any] | None = None,
    row: dict[str, Any] | None = None,
    external_id: str | None = None,
) -> tuple[str, list[str], float, bool, str | None, list[str]]:
    """
    Texto/reglas primero. Solo si faltan pruebas y hay fotos + API → visión en el mismo paso.
    Devuelve listing_region, evidence, ai_conf, region_verified, condition, notes.
    """
    notes: list[str] = []
    rules_ok, _ = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_conf
    )
    region_matches = regions_match(catalog_region, listing_region)
    if not region_needs_cover_vision(
        platform_slug=platform_slug,
        catalog_region=catalog_region,
        listing_region=listing_region,
        evidence=evidence,
        ai_conf=ai_conf,
        ok_ref=ok_ref,
    ):
        return listing_region, evidence, ai_conf, rules_ok and region_matches, None, notes

    image_urls: list[str] = []
    if row:
        image_urls = row_image_urls(row, fetch_missing=False)
    if not image_urls and product:
        image_urls = extract_product_image_urls(product, source)
    if not image_urls and product:
        page = str(product.get("productUrl") or product.get("url") or "").strip()
        if page:
            from collectors.listing_images import fetch_page_image_urls

            image_urls = fetch_page_image_urls(page)

    listing_region, evidence, ai_conf, verified, condition = apply_region_cover_vision(
        platform_slug=platform_slug,
        catalog_region=catalog_region,
        game_title=game_title,
        listing_title=listing_title,
        listing_region=listing_region,
        evidence=evidence,
        ai_conf=ai_conf,
        ok_ref=ok_ref,
        image_urls=image_urls,
        source=source,
        external_id=external_id,
    )

    if "cover_vision" in evidence and verified:
        notes.append("cover_vision_verified")
    elif "cover_vision" in evidence:
        notes.append("cover_vision_insufficient")

    return listing_region, evidence, ai_conf, verified, condition, notes


def apply_region_enrichment_to_row(
    row: dict[str, Any],
    product: dict[str, Any] | None,
    *,
    platform_slug: str,
    catalog_region: str,
    game_title: str,
    source: str,
    ok_ref: bool,
    strict: bool | None = None,
) -> dict[str, Any] | None:
    """Texto/reglas → visión solo si hay duda → entonces aceptar o descartar (P2P estricto)."""
    if os.environ.get("REGION_VISION_DISABLED", "").strip():
        use_strict = strict if strict is not None else source in STRICT_LISTING_SOURCES
        if use_strict and not row.get("regionVerified"):
            return None
        return row

    listing_title = str(row.get("title") or "")
    listing_region = str(row.get("listingRegion") or catalog_region)
    evidence = list(row.get("regionEvidence") or [])
    ai_conf = float(row.get("aiConfidence") or 0)
    external_id = str(row.get("externalId") or "").strip() or None
    prior_verified = bool(row.get("regionVerified"))
    use_strict = strict if strict is not None else source in STRICT_LISTING_SOURCES

    if not region_needs_cover_vision(
        platform_slug=platform_slug,
        catalog_region=catalog_region,
        listing_region=listing_region,
        evidence=evidence,
        ai_conf=ai_conf,
        ok_ref=ok_ref,
    ):
        return row

    image_scratch: dict[str, Any] = {}
    if row.get("imageUrls"):
        image_scratch["imageUrls"] = row["imageUrls"]
        if row.get("imageUrl"):
            image_scratch["imageUrl"] = row["imageUrl"]
    if product:
        attach_image_urls(image_scratch, product, source)

    listing_region, evidence, ai_conf, region_verified, vision_condition, vision_notes = (
        enrich_listing_region_from_cover(
            platform_slug=platform_slug,
            catalog_region=catalog_region,
            game_title=game_title,
            listing_title=listing_title,
            listing_region=listing_region,
            evidence=evidence,
            ai_conf=ai_conf,
            ok_ref=ok_ref,
            source=source,
            product=product,
            row=image_scratch if image_scratch else row,
            external_id=external_id,
        )
    )

    row["listingRegion"] = listing_region
    row["regionEvidence"] = evidence
    row["aiConfidence"] = ai_conf
    row["regionVerified"] = region_verified

    if vision_condition in DISPLAY_BUCKETS:
        row["condition"] = vision_condition

    if "cover_vision" in evidence and region_verified:
        base_method = str(row.get("matchMethod") or "title")
        if "+cover-vision" not in base_method:
            row["matchMethod"] = f"{base_method}+cover-vision"

    if image_scratch.get("imageUrls"):
        row["imageUrls"] = image_scratch["imageUrls"]
        row["imageUrl"] = image_scratch.get("imageUrl") or row.get("imageUrl")
    elif product and not row.get("imageUrl"):
        attach_image_urls(row, product, source)

    if not region_verified:
        row["regionReviewNeeded"] = True
        notes: list[str] = list(row.get("regionReviewNotes") or [])
        if not ok_ref:
            notes.append("referencia_no_coincide")
        if listing_region and not regions_match(catalog_region, listing_region):
            notes.append(f"region_detectada_{listing_region}")
        elif not listing_region:
            notes.append("region_no_detectada")
        rules_ok, rules_reason = check_listing_evidence_meets_rules(
            platform_slug, catalog_region, evidence, ai_conf
        )
        if not rules_ok and rules_reason:
            notes.append(str(rules_reason))
        notes.extend(vision_notes)
        if notes:
            row["regionReviewNotes"] = notes
    else:
        row.pop("regionReviewNeeded", None)
        row.pop("regionReviewNotes", None)

    if use_strict and not region_verified:
        return None
    if not use_strict and prior_verified and not region_verified and "cover_vision" not in evidence:
        row["regionVerified"] = True
        row.pop("regionReviewNeeded", None)
        row.pop("regionReviewNotes", None)
    return row


def listing_region_is_verified(
    *,
    platform_slug: str,
    catalog_region: str,
    listing_region: str,
    evidence: list[str],
    ai_conf: float,
    ok_ref: bool,
) -> bool:
    if not ok_ref or not regions_match(catalog_region, listing_region):
        return False
    rules_ok, _ = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_conf
    )
    return rules_ok


__all__ = [
    "STRICT_LISTING_SOURCES",
    "apply_region_enrichment_to_row",
    "enrich_listing_region_from_cover",
    "listing_region_is_verified",
    "region_cover_vision_available",
    "region_needs_cover_vision",
]
