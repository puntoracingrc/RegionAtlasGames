"""Política regional de eBay: escaparate ES, entrega ES y origen por variante."""

from __future__ import annotations

import os
import re
import unicodedata
import urllib.parse
from dataclasses import dataclass


@dataclass(frozen=True)
class EbayRegionalPolicy:
    marketplace_id: str
    destination_country: str
    destination_postal_code: str
    item_location_country: str | None
    item_location_region: str | None
    origin_label: str
    import_costs_may_apply: bool
    region_restricted: bool


EU_COUNTRIES = {
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DE",
    "DK",
    "EE",
    "ES",
    "FI",
    "FR",
    "GR",
    "HU",
    "IE",
    "IT",
    "LT",
    "LU",
    "LV",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SE",
    "SI",
    "SK",
}

COUNTRY_MARKERS = (
    ("espana", "ES"),
    ("spain", "ES"),
    ("italia", "IT"),
    ("italy", "IT"),
    ("francia", "FR"),
    ("france", "FR"),
    ("reino unido", "GB"),
    ("uk", "GB"),
    ("eng", "GB"),
    ("alemania", "DE"),
    ("germany", "DE"),
)


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _postal_code(value: str | None = None) -> str:
    clean = re.sub(r"[^0-9A-Za-z -]", "", (value or os.environ.get("EBAY_CONTEXTUAL_ZIP", "")).strip())
    return clean or "28001"


def _is_multi_region(region: str) -> bool:
    if any(marker in region for marker in ("multi region", "multiregion", "multi pal", "pal europa", "pal europe")):
        return True
    countries = {country for marker, country in COUNTRY_MARKERS if marker in region}
    return len(countries) >= 2


def ebay_regional_policy(catalog_region: str, destination_postal_code: str | None = None) -> EbayRegionalPolicy:
    region = _normalize(catalog_region)
    base = {
        "marketplace_id": "EBAY_ES",
        "destination_country": "ES",
        "destination_postal_code": _postal_code(destination_postal_code),
    }

    # Una misma edición Multi-PAL puede venderse desde varios países. eBay solo
    # permite un filtro de ubicación; CONTINENTAL_EUROPE evita duplicar la ficha.
    if _is_multi_region(region) or region in {"europa", "europe"}:
        return EbayRegionalPolicy(
            **base,
            item_location_country=None,
            item_location_region="CONTINENTAL_EUROPE",
            origin_label="Europa multirregión",
            import_costs_may_apply=True,
            region_restricted=True,
        )

    mappings = (
        (("espana",), "ES", "España", False),
        (("reino unido", "uk", "eng"), "GB", "Reino Unido", True),
        (("estados unidos", "ntsc u", "usa"), "US", "Estados Unidos", True),
        (("japon", "japan", "ntsc j"), "JP", "Japón", True),
        (("alemania", "germany", "usk"), "DE", "Alemania", False),
        (("francia", "france"), "FR", "Francia", False),
        (("italia", "italy"), "IT", "Italia", False),
        (("australia",), "AU", "Australia", True),
    )
    for markers, country, label, imports in mappings:
        if any(marker in region for marker in markers):
            return EbayRegionalPolicy(
                **base,
                item_location_country=country,
                item_location_region=None,
                origin_label=label,
                import_costs_may_apply=imports,
                region_restricted=True,
            )

    if "pal" in region or "europa" in region or "europe" in region:
        return EbayRegionalPolicy(
            **base,
            item_location_country=None,
            item_location_region="EUROPEAN_UNION",
            origin_label="Unión Europea",
            import_costs_may_apply=False,
            region_restricted=True,
        )

    return EbayRegionalPolicy(
        **base,
        item_location_country=None,
        item_location_region=None,
        origin_label=catalog_region.strip() or "Origen sin clasificar",
        import_costs_may_apply=True,
        region_restricted=False,
    )


def import_costs_may_apply(policy: EbayRegionalPolicy, origin_country: str | None) -> bool:
    country = str(origin_country or "").strip().upper()
    if country:
        return country not in EU_COUNTRIES
    return policy.import_costs_may_apply


def browse_filters(policy: EbayRegionalPolicy) -> list[str]:
    filters = [
        "buyingOptions:{FIXED_PRICE}",
        f"deliveryCountry:{policy.destination_country}",
        f"deliveryPostalCode:{policy.destination_postal_code}",
    ]
    if policy.item_location_country:
        filters.append(f"itemLocationCountry:{policy.item_location_country}")
    if policy.item_location_region:
        filters.append(f"itemLocationRegion:{policy.item_location_region}")
    return filters


def end_user_context(policy: EbayRegionalPolicy) -> str:
    location = f"country={policy.destination_country},zip={policy.destination_postal_code}"
    return f"contextualLocation={urllib.parse.quote(location, safe='')}"


__all__ = [
    "EbayRegionalPolicy",
    "browse_filters",
    "ebay_regional_policy",
    "end_user_context",
    "import_costs_may_apply",
]
