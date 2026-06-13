"""Detección de región en títulos de anuncios y pruebas de evidencia."""

from __future__ import annotations

import re
from typing import Any

from collectors.reference_match import extract_references_from_text, reference_implies_region

LISTING_JAPAN_RE = re.compile(
    r"\b("
    r"ntsc\s*[- ]?j|japan|japanese|japon|japonés|japones|japón|jap\b|"
    r"import\s*jap|edicion\s*jap"
    r")\b",
    re.I,
)
LISTING_USA_RE = re.compile(
    r"\b(ntsc\s*[- ]?u|usa|u\.s\.|us version|american|ntsc-us)\b",
    re.I,
)
LISTING_PAL_ES_RE = re.compile(
    r"\b(pal[\s-]?esp|pal[\s-]?espa|españa|spanish|castellano|espanol|español)\b",
    re.I,
)
LISTING_PAL_EU_RE = re.compile(
    r"\b(pal[\s-]?eu|pal europa|pal-europa|pal europe|multilingue|multilingüe)\b",
    re.I,
)
LISTING_PAL_GENERIC_RE = re.compile(r"\bpal\b", re.I)
LISTING_UK_RE = re.compile(r"\b(uk|england|english version|pal uk)\b", re.I)
LISTING_GERMANY_RE = re.compile(r"\b(germany|german|alemania|alem[aá]n|deutsch)\b", re.I)
LISTING_AUSTRALIA_RE = re.compile(r"\b(australia|australian|austral)\b", re.I)

REGION_ALIASES: dict[str, set[str]] = {
    "pal españa": {"pal españa", "españa"},
    "españa": {"pal españa", "españa"},
    "japón": {"japón", "japan"},
    "japan": {"japón", "japan"},
    "pal europa": {"pal europa", "españa", "pal españa"},
    "pal uk/eng": {"pal uk/eng", "pal europa"},
    "pal alemania": {"pal alemania", "pal europa"},
}

REGION_QUERY_HINTS: dict[str, str] = {
    "PAL España": "PAL español",
    "España": "PAL español",
    "PAL Europa": "PAL europeo",
    "Japón": "NTSC-J japonés",
    "Japan": "NTSC-J japonés",
    "JAPAN": "NTSC-J japonés",
    "USA": "NTSC-U USA",
    "Australia": "PAL Australia",
    "PAL UK/ENG": "PAL UK",
    "PAL Alemania": "PAL alemán",
}
# Obsoleto para queries de búsqueda: región y consola se filtran post-fetch (build_search_query).


def normalize_region(region: str) -> str:
    return region.strip().lower()


def detect_listing_region(title: str) -> str | None:
    """Región explícita en el título del anuncio, si existe."""
    if LISTING_USA_RE.search(title):
        return "USA"
    if LISTING_PAL_ES_RE.search(title):
        return "PAL España"
    if LISTING_UK_RE.search(title):
        return "PAL UK/ENG"
    if LISTING_GERMANY_RE.search(title):
        return "PAL Alemania"
    if LISTING_AUSTRALIA_RE.search(title):
        return "Australia"
    if LISTING_PAL_EU_RE.search(title):
        return "PAL Europa"
    if LISTING_PAL_GENERIC_RE.search(title):
        return "PAL Europa"
    if LISTING_JAPAN_RE.search(title):
        return "Japón"
    return None


def regions_match(catalog_region: str, listing_region: str) -> bool:
    c = normalize_region(catalog_region)
    l = normalize_region(listing_region)
    if not c or not l:
        return False
    if c == l:
        return True
    if l in REGION_ALIASES.get(c, set()):
        return True
    if c in REGION_ALIASES.get(l, set()):
        return True
    if c in ("pal europa", "pal uk/eng", "pal alemania") and l in (
        "pal europa",
        "pal uk/eng",
        "pal alemania",
    ):
        return True
    if c in ("pal españa", "españa") and l == "pal europa":
        return False
    return False


def title_conflicts_region(title: str, catalog_region: str) -> bool:
    detected = detect_listing_region(title)
    if not detected:
        return False
    return not regions_match(catalog_region, detected)


def _evidence_from_reference(title: str, catalog_region: str) -> tuple[str | None, list[str]]:
    refs = extract_references_from_text(title)
    for ref in refs:
        implied = reference_implies_region(ref)
        if implied and regions_match(catalog_region, implied):
            return implied, ["sku_regional", "listing_title_region"]
    return None, []


def infer_listing_evidence(
    title: str,
    catalog_region: str,
    *,
    matched_reference: str | None = None,
) -> tuple[str, list[str], float]:
    """
    Devuelve listingRegion, regionEvidence y aiConfidence para un anuncio.
    La región del anuncio debe ser compatible con la edición del catálogo.
    """
    region = catalog_region.strip() or "PAL Europa"
    evidence: list[str] = []
    ai_conf = 0.85

    if matched_reference:
        implied = reference_implies_region(matched_reference)
        listing_region = implied if implied and regions_match(catalog_region, implied) else region
        evidence = ["sku_regional", "listing_title_region"]
        return listing_region, evidence, 0.93

    ref_region, ref_evidence = _evidence_from_reference(title, catalog_region)
    if ref_region and ref_evidence:
        return ref_region, ref_evidence, 0.92

    detected = detect_listing_region(title)
    if detected and regions_match(catalog_region, detected):
        region = detected
        if detected in ("Japón", "Japan"):
            evidence = ["cover_japan", "listing_title_region"]
            ai_conf = 0.9
        elif detected == "USA":
            evidence = ["cover_usa", "listing_title_region"]
            ai_conf = 0.88
        elif detected in ("PAL España", "España"):
            evidence = ["cover_spain", "listing_title_region"]
            ai_conf = 0.88
        elif detected in ("PAL Europa", "PAL UK/ENG", "PAL Alemania"):
            evidence = ["cover_pal_eu", "listing_title_region"]
            ai_conf = 0.87
        elif detected == "Australia":
            evidence = ["cover_pal_eu", "listing_title_region"]
            ai_conf = 0.86
        return region, evidence, ai_conf

    t = title.lower()
    if region in ("PAL España", "España"):
        if any(k in t for k in ("españ", "spanish", "castellano", "espana", "spain")):
            evidence.append("cover_spain")
        if any(k in t for k in ("pal", "europe", "eu", "peg")):
            evidence.append("listing_title_region")
        if evidence:
            return region, evidence, 0.88
        return region, ["listing_title_region", "seller_states_region"], 0.86

    if region == "PAL Europa":
        if any(k in t for k in ("pal", "eur", "europe", "eu", "peg")):
            evidence.extend(["cover_pal_eu", "listing_title_region"])
        elif any(k in t for k in ("españ", "spanish", "castellano")):
            evidence.append("cover_spain")
        else:
            evidence = ["listing_title_region", "seller_states_region"]
        return region, evidence, 0.87

    if normalize_region(region) in ("japón", "japan"):
        return region, ["listing_title_region", "seller_states_region"], 0.84

    if normalize_region(region) == "usa":
        return region, ["listing_title_region", "seller_states_region"], 0.84

    return region, ["listing_title_region"], 0.82


def infer_listing_region_and_evidence(
    title: str,
    catalog_region: str,
    *,
    matched_reference: str | None = None,
) -> tuple[str, list[str], float, bool]:
    listing_region, evidence, ai_conf = infer_listing_evidence(
        title,
        catalog_region,
        matched_reference=matched_reference,
    )
    return listing_region, evidence, ai_conf, True


def listing_passes_rules(
    platform_slug: str,
    catalog_region: str,
    title: str,
    *,
    matched_reference: str | None = None,
    check_rules: Any,
) -> tuple[bool, dict[str, Any] | None]:
    """Construye fila parcial si el anuncio cumple reglas de región."""
    if title_conflicts_region(title, catalog_region):
        return False, None

    listing_region, evidence, ai_conf = infer_listing_evidence(
        title,
        catalog_region,
        matched_reference=matched_reference,
    )
    if not regions_match(catalog_region, listing_region):
        return False, None

    ok, _ = check_rules(platform_slug, catalog_region, evidence, ai_conf)
    if not ok:
        return False, None

    return True, {
        "listingRegion": listing_region,
        "regionEvidence": evidence,
        "aiConfidence": ai_conf,
        "regionVerified": True,
    }
