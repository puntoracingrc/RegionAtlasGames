"""Enrutado estricto de anuncios hacia variantes regionales del mismo juego."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from collectors.reference_match import (
    extract_references_from_text,
    reference_implies_region,
)
from collectors.region_inference import detect_listing_regions


@dataclass(frozen=True)
class RegionalRouteDecision:
    kind: str
    detected_region: str | None = None
    destination_catalog_id: str | None = None
    destination_region: str | None = None
    alternatives: tuple[str, ...] = ()
    matched_reference: str | None = None
    proof: str | None = None
    reason: str | None = None
    origin_region_hint: str | None = None


def _normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def canonical_region_key(region: str | None) -> str:
    """Clave regional deliberadamente estricta; PAL genérico no equivale a España."""
    normalized = _normalize(region)
    if not normalized:
        return ""
    if "multi" in normalized and "pal" in normalized:
        return "pal_multi"
    if normalized in {"pal espana", "espana", "spain", "pal es"}:
        return "pal_es"
    if normalized in {"pal uk eng", "pal uk", "uk", "england"}:
        return "pal_uk"
    if normalized in {"pal alemania", "pal germany", "germany", "alemania"}:
        return "pal_de"
    if normalized in {"pal francia", "pal france", "france", "francia"}:
        return "pal_fr"
    if normalized in {"pal italia", "pal italy", "italy", "italia"}:
        return "pal_it"
    if normalized in {"pal europa", "pal europe", "pal eu", "europe"}:
        return "pal_eu"
    if normalized in {"usa", "ntsc u", "ntsc usa", "united states"}:
        return "usa"
    if normalized in {"japon", "japan", "ntsc j", "jp"}:
        return "japan"
    if normalized in {"australia", "pal australia", "pal aus"}:
        return "australia"
    return f"other:{normalized}"


def strict_regions_match(left: str | None, right: str | None) -> bool:
    left_key = canonical_region_key(left)
    return bool(left_key and left_key == canonical_region_key(right))


def seller_origin_region_hint(origin_country: str | None) -> str | None:
    """Ubicación del vendedor: pista para revisar, nunca prueba de la edición."""
    country = str(origin_country or "").strip().upper()
    return {
        "ES": "PAL España",
        "JP": "Japón",
        "US": "USA",
        "GB": "PAL UK/ENG",
        "UK": "PAL UK/ENG",
        "DE": "PAL Alemania",
        "FR": "PAL Europa",
        "IT": "PAL Europa",
        "NL": "PAL Europa",
        "BE": "PAL Europa",
        "AT": "PAL Europa",
        "PT": "PAL Europa",
        "AU": "Australia",
    }.get(country)


def _edition_key(game: dict[str, Any]) -> str:
    edition = _normalize(game.get("edition"))
    return edition if edition and edition != "standard edition" else "standard"


def _physical_variant_key(game: dict[str, Any]) -> str:
    return _normalize(game.get("physicalVariant"))


def same_regional_edition_family(origin: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if origin.get("platformSlug") != candidate.get("platformSlug"):
        return False
    if _edition_key(origin) != _edition_key(candidate):
        return False
    if _physical_variant_key(origin) != _physical_variant_key(candidate):
        return False
    origin_slug = _normalize(origin.get("slug"))
    candidate_slug = _normalize(candidate.get("slug"))
    if origin_slug and origin_slug == candidate_slug:
        return True
    origin_titles = {
        value
        for value in (_normalize(origin.get("title")), _normalize(origin.get("titlePc")))
        if value
    }
    candidate_titles = {
        value
        for value in (_normalize(candidate.get("title")), _normalize(candidate.get("titlePc")))
        if value
    }
    return bool(origin_titles & candidate_titles)


def regional_variants_for(
    target: dict[str, Any],
    platform_games: list[dict[str, Any]],
    detected_region: str,
) -> list[dict[str, Any]]:
    key = canonical_region_key(detected_region)
    if not key:
        return []
    return [
        game
        for game in platform_games
        if game.get("id") != target.get("id")
        and game.get("listingStatus") != "excluded"
        and same_regional_edition_family(target, game)
        and canonical_region_key(str(game.get("region") or "")) == key
    ]


def _review(
    reason: str,
    *,
    detected_region: str | None = None,
    alternatives: list[dict[str, Any]] | tuple[str, ...] = (),
    matched_reference: str | None = None,
    origin_region_hint: str | None = None,
) -> RegionalRouteDecision:
    ids = tuple(
        str(item.get("id")) if isinstance(item, dict) else str(item)
        for item in alternatives
        if (item.get("id") if isinstance(item, dict) else item)
    )
    return RegionalRouteDecision(
        kind="review",
        detected_region=detected_region,
        alternatives=ids,
        matched_reference=matched_reference,
        reason=reason,
        origin_region_hint=origin_region_hint,
    )


def resolve_regional_route(
    *,
    target: dict[str, Any],
    listing_title: str,
    origin_country: str | None,
    platform_games: list[dict[str, Any]],
    ref_to_ids: dict[str, list[str]],
) -> RegionalRouteDecision:
    """Resuelve solo señales regionales explícitas; nunca deduce región del vendedor."""
    by_id = {str(game.get("id")): game for game in platform_games if game.get("id")}
    target_id = str(target.get("id") or "")
    target_region = str(target.get("region") or "")
    target_key = canonical_region_key(target_region)

    title_regions = detect_listing_regions(listing_title)
    title_keys = {canonical_region_key(region) for region in title_regions if canonical_region_key(region)}
    if len(title_keys) > 1:
        return _review("regional_signal_conflict")
    title_region = next(iter(title_regions), None) if len(title_keys) == 1 else None

    refs = sorted(extract_references_from_text(listing_title))
    owner_games: list[dict[str, Any]] = []
    known_owner_ids: set[str] = set()
    implied_regions: set[str] = set()
    for reference in refs:
        implied = reference_implies_region(reference)
        if implied:
            implied_regions.add(implied)
        for owner_id in ref_to_ids.get(reference, []):
            known_owner_ids.add(str(owner_id))
            owner = by_id.get(str(owner_id))
            if owner and same_regional_edition_family(target, owner):
                owner_games.append(owner)

    owner_ids = {str(game.get("id")) for game in owner_games}
    if known_owner_ids - owner_ids:
        return RegionalRouteDecision(
            kind="reject",
            matched_reference=refs[0] if len(refs) == 1 else None,
            reason="reference_other_game",
        )
    owner_regions = {
        str(game.get("region") or "")
        for game in owner_games
        if str(game.get("region") or "").strip()
    }
    reference_regions = owner_regions or implied_regions
    reference_keys = {
        canonical_region_key(region)
        for region in reference_regions
        if canonical_region_key(region)
    }
    if len(owner_ids) > 1 or len(reference_keys) > 1:
        return _review(
            "regional_variant_ambiguous",
            alternatives=owner_games,
            matched_reference=refs[0] if len(refs) == 1 else None,
        )

    reference_region = next(iter(reference_regions), None) if len(reference_keys) == 1 else None
    reference_key = next(iter(reference_keys), None)
    matched_reference = refs[0] if len(refs) == 1 and reference_region else None
    if title_region and reference_key and canonical_region_key(title_region) != reference_key:
        return _review(
            "regional_signal_conflict",
            alternatives=owner_games,
            matched_reference=matched_reference,
        )

    detected_region = reference_region or title_region
    detected_key = canonical_region_key(detected_region)
    if detected_key and detected_key == target_key:
        if owner_ids and target_id not in owner_ids:
            return _review(
                "regional_variant_ambiguous",
                detected_region=detected_region,
                alternatives=owner_games,
                matched_reference=matched_reference,
            )
        return RegionalRouteDecision(
            kind="target",
            detected_region=detected_region,
            matched_reference=matched_reference,
            proof="reference" if reference_region else "title",
        )

    if detected_region:
        if len(owner_ids) == 1:
            destination = owner_games[0]
            return RegionalRouteDecision(
                kind="route",
                detected_region=str(destination.get("region") or detected_region),
                destination_catalog_id=str(destination.get("id")),
                destination_region=str(destination.get("region") or detected_region),
                matched_reference=matched_reference,
                proof="reference",
                reason="regional_reference_owner",
            )
        variants = regional_variants_for(target, platform_games, detected_region)
        if len(variants) == 1:
            destination = variants[0]
            return RegionalRouteDecision(
                kind="route",
                detected_region=detected_region,
                destination_catalog_id=str(destination.get("id")),
                destination_region=str(destination.get("region") or detected_region),
                matched_reference=matched_reference,
                proof="reference" if reference_region else "title",
                reason="regional_reference" if reference_region else "regional_title",
            )
        return _review(
            "regional_variant_missing" if not variants else "regional_variant_ambiguous",
            detected_region=detected_region,
            alternatives=variants,
            matched_reference=matched_reference,
        )

    origin_hint = seller_origin_region_hint(origin_country)
    if origin_hint and canonical_region_key(origin_hint) != target_key:
        variants = regional_variants_for(target, platform_games, origin_hint)
        return _review(
            "seller_origin_hint_only",
            alternatives=variants,
            origin_region_hint=origin_hint,
        )

    return RegionalRouteDecision(kind="target")


__all__ = [
    "RegionalRouteDecision",
    "canonical_region_key",
    "regional_variants_for",
    "resolve_regional_route",
    "same_regional_edition_family",
    "seller_origin_region_hint",
    "strict_regions_match",
]
