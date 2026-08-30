"""Matching catálogo ↔ anuncios Wallapop ES."""

from __future__ import annotations

import re
from typing import Any

from collectors.catalog_match import is_manual_only_listing, product_title
from collectors.condition_buckets import DISPLAY_BUCKETS, infer_condition_bucket
from collectors.game_content_profile import manual_missing_declared, missing_original_contents
from collectors.jgo_match import infer_condition
from collectors.listing_images import attach_image_urls
from collectors.listing_region_enrich import enrich_listing_region_from_cover
from collectors.physical_edition import physical_editions_match
from collectors.reference_match import listing_reference_valid_for_catalog
from collectors.regional_variant_routing import strict_regions_match
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

UNMATCHED_EXTRA_RE = re.compile(
    r"\b(art[ -]?book|libro de arte|steelbook|figura|figurine|banda sonora|soundtrack|p[oó]ster)\b",
    re.I,
)
EXTRA_EDITION_RE = re.compile(
    r"\b(collector|coleccionista|limited|limitada|special|especial|deluxe|art[ -]?book|steelbook)\b",
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


def listing_has_unmatched_extras(product: dict[str, Any], game: dict[str, Any]) -> bool:
    if not physical_editions_match(product, game):
        return True
    listing_text = " ".join(
        str(product.get(key) or "") for key in ("title", "description", "characteristics")
    )
    if not UNMATCHED_EXTRA_RE.search(listing_text):
        return False
    catalog_text = f"{game.get('title') or ''} {game.get('edition') or ''}"
    return not EXTRA_EDITION_RE.search(catalog_text)


def dedupe_wallapop_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Retira solo asociaciones repetidas del mismo anuncio exacto.

    El titulo, precio y las imagenes no participan en la clave: anuncios que se
    parecen siguen siendo observaciones independientes.
    """
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for index, row in enumerate(rows):
        external_id = str(row.get("externalId") or "").strip()
        product_url = str(row.get("productUrl") or "").strip()
        if external_id:
            key = ("external_id", external_id)
        elif product_url:
            key = ("product_url", product_url)
        else:
            key = ("row", str(index))
        groups.setdefault(key, []).append(row)

    def rank(row: dict[str, Any]) -> tuple[int, int, int, float, int]:
        evidence = set(str(value) for value in (row.get("regionEvidence") or []))
        strong = len(evidence & {"sku_regional", "cover_vision", "cover_spain", "cover_pal_eu", "cover_usa", "cover_japan"})
        return (
            int(row.get("regionVerified") is True),
            int(strict_regions_match(str(row.get("catalogRegion") or ""), str(row.get("listingRegion") or ""))),
            strong,
            float(row.get("matchScore") or 0),
            -len(row.get("regionReviewNotes") or []),
        )

    result: list[dict[str, Any]] = []
    removed = 0
    for candidates in groups.values():
        ordered = sorted(candidates, key=rank, reverse=True)
        winner = dict(ordered[0])
        catalog_choices = list(
            dict.fromkeys(str(row.get("catalogId") or "") for row in ordered if row.get("catalogId"))
        )
        if len(catalog_choices) > 1:
            winner["catalogMatchAlternatives"] = catalog_choices
            existing_alternatives = winner.get("matchAlternatives")
            alternatives = list(existing_alternatives) if isinstance(existing_alternatives, list) else []
            known_ids = {
                str(item.get("catalogId") or "")
                for item in alternatives
                if isinstance(item, dict)
            }
            for row in ordered:
                candidate_id = str(row.get("catalogId") or "")
                if not candidate_id or candidate_id in known_ids:
                    continue
                alternatives.append(
                    {
                        "catalogId": candidate_id,
                        "title": row.get("catalogTitle"),
                        "region": row.get("catalogRegion"),
                        "coverUrl": row.get("catalogCoverUrl"),
                        "score": row.get("matchScore"),
                    }
                )
                known_ids.add(candidate_id)
            winner["matchAlternatives"] = alternatives
            if not winner.get("regionVerified"):
                winner["catalogMatchAmbiguous"] = True
                winner["regionReviewNeeded"] = True
                notes = list(winner.get("regionReviewNotes") or [])
                if "catalog_match_not_unique" not in notes:
                    notes.append("catalog_match_not_unique")
                winner["regionReviewNotes"] = notes
        result.append(winner)
        removed += len(ordered) - 1
    return result, removed


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
    game_title: str | None = None,
    manual_expected: bool | None = None,
    manual_expectation_source: str | None = None,
    original_contents_expected: list[str] | None = None,
    original_contents_source: str | None = None,
    regional_packaging: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    title = product_title(product)
    description = str(product.get("description") or "").strip()
    characteristics = str(product.get("characteristics") or "").strip()
    full_text = f"{title} {description} {characteristics}".strip()
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
        evidence = ["listing_title_region", "seller_states_physical_region"]
        if regions_match(catalog_region, detected):
            ai_conf = max(float(ai_conf or 0), 0.92)
        else:
            ai_conf = min(float(ai_conf or 0), 0.72)
    elif "sku_regional" not in evidence:
        listing_region = catalog_region
        evidence = []
        ai_conf = 0.0

    ai_result: ListingAiResult | None = None
    ai_target_conflict = False
    if listing_ai is not None:
        ai_result = listing_ai if isinstance(listing_ai, ListingAiResult) else ListingAiResult.from_dict(listing_ai)
        if ai_result.listing_region:
            if detected and not strict_regions_match(detected, ai_result.listing_region):
                evidence = [*evidence, "listing_ai_region_conflict"]
            elif not detected:
                listing_region = ai_result.listing_region
                evidence = [*evidence, "listing_ai_region_hint"]
        if ai_result.confidence:
            ai_confidence = ai_result.confidence
        ai_target_conflict = bool(
            ai_result.is_target_game is False and ai_result.confidence >= 0.75
        )

    raw_cond = infer_condition(full_text)
    bucket = infer_condition_bucket(
        full_text,
        condition_raw=raw_cond,
        manual_expected=manual_expected,
        original_contents_expected=original_contents_expected,
    )
    missing_required_manual = (
        manual_expected is not False and manual_missing_declared(full_text)
    )
    missing_required_content = bool(
        missing_original_contents(full_text, original_contents_expected)
    )
    if (
        ai_result
        and not bucket
        and not missing_required_manual
        and not missing_required_content
        and ai_result.condition in DISPLAY_BUCKETS
    ):
        bucket = ai_result.condition

    image_scratch: dict[str, Any] = {}
    attach_image_urls(image_scratch, product, "wallapop", limit=12)
    external_id = str(product.get("externalId") or "").strip()
    force_region_vision = (
        "seller_states_region" in evidence
        and "sku_regional" not in evidence
        and not matched_reference
    ) or not strict_regions_match(catalog_region, listing_region)
    force_region_vision = force_region_vision or ai_target_conflict or any(
        value in evidence
        for value in ("listing_ai_region_hint", "listing_ai_region_conflict")
    )

    listing_region, evidence, ai_conf, region_verified, vision_condition, vision_notes = (
        enrich_listing_region_from_cover(
            platform_slug=platform_slug,
            catalog_region=catalog_region,
            game_title=game_title or title,
            listing_title=title,
            listing_region=listing_region,
            evidence=evidence,
            ai_conf=float(ai_conf or 0),
            ok_ref=ok_ref,
            source="wallapop",
            product=product,
            row=image_scratch,
            external_id=external_id or None,
            force_weak_evidence=force_region_vision,
            known_condition=bucket,
            require_condition=True,
            catalog_id=catalog_id,
            manual_expected=manual_expected,
            original_contents_expected=original_contents_expected,
            regional_packaging=regional_packaging,
        )
    )

    rules_ok, rules_reason = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_conf
    )
    region_matches = strict_regions_match(catalog_region, listing_region)
    vision_confirmed_target = "cover_vision" in evidence
    region_verified = bool(
        region_verified
        and region_matches
        and (not ai_target_conflict or vision_confirmed_target)
    )

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
    if manual_expected is not None:
        row["manualExpected"] = manual_expected
        row["manualExpectationSource"] = manual_expectation_source or "catalog"
    if original_contents_expected is not None:
        row["originalContentsExpected"] = original_contents_expected
        row["originalContentsSource"] = original_contents_source or "catalog"
    if regional_packaging:
        row["regionalPackagingExpected"] = regional_packaging
    if description:
        row["description"] = description[:3000]
    if characteristics:
        row["characteristics"] = characteristics[:500]
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
        notes.extend(vision_notes)
        if notes:
            row["regionReviewNotes"] = notes
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
        row["listingAiConfidence"] = round(float(ai_confidence), 3)
    if product.get("listedAt"):
        row["listedAt"] = product["listedAt"]
    if vision_condition in DISPLAY_BUCKETS:
        if bucket and bucket != vision_condition:
            row["conditionTextValue"] = bucket
            row["conditionConflictDetected"] = True
        bucket = vision_condition
        row["conditionResolvedBy"] = "cover_vision"
    if bucket:
        row["condition"] = bucket
    if ai_result and match_method == "search":
        row["matchMethod"] = "search+ai"
    if "cover_vision" in evidence and region_verified:
        base_method = str(row.get("matchMethod") or match_method)
        if "+cover-vision" not in base_method:
            row["matchMethod"] = f"{base_method}+cover-vision"
    if image_scratch.get("imageUrls"):
        row["imageUrls"] = image_scratch["imageUrls"]
        row["imageUrl"] = image_scratch.get("imageUrl")
    elif not row.get("imageUrl"):
        attach_image_urls(row, product, "wallapop", limit=12)
    return row


__all__ = [
    "dedupe_wallapop_rows",
    "infer_wallapop_region_product",
    "is_wallapop_game_listing",
    "is_wallapop_game_product",
    "listing_has_unmatched_extras",
    "product_to_ingest_row",
]
