"""Utilidades compartidas para collectors de precios ES."""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collectors.reference_match import catalog_reference, listing_reference_valid_for_catalog

ROOT = Path(__file__).resolve().parents[2]
CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
INGEST_DIR = ROOT / "data" / "price-ingest"

ES_MARKET_EXCLUDE = {"usa", "japón", "japan", "australia", "pal uk/eng", "pal alemania"}

TITLE_EXCLUDE_RE = re.compile(
    r"\b(ntsc|usa|us version|u\.s\.|japan|japanese|japon|japonés|japón)\b",
    re.I,
)

REGION_QUERY_HINTS: dict[str, str] = {
    "PAL España": "PAL español",
    "España": "PAL español",
    "PAL Europa": "PAL",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_platforms() -> dict[str, dict[str, Any]]:
    rows = load_json(PLATFORMS_FILE, [])
    return {p["slug"]: p for p in rows}


def es_market_games(platform_slug: str, region: str | None = None) -> list[dict[str, Any]]:
    catalog = load_json(CATALOG_FILE, [])
    games = [
        g
        for g in catalog
        if g.get("platformSlug") == platform_slug
        and g.get("listingStatus") != "excluded"
        and (g.get("region") or "").strip().lower() not in ES_MARKET_EXCLUDE
    ]
    if region:
        games = [g for g in games if g.get("region") == region]
    return sorted(games, key=lambda g: g["title"].lower())


def normalize_query(text: str) -> str:
    t = unicodedata.normalize("NFKD", text)
    t = t.encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^\w\s-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def build_search_query(game: dict[str, Any], platform: dict[str, Any] | None) -> str:
    parts = [game["title"]]
    if platform:
        parts.append(platform.get("shortName") or platform.get("name") or "")
    region = game.get("region") or ""
    hint = REGION_QUERY_HINTS.get(region)
    if hint:
        parts.append(hint)
    ref = catalog_reference(str(game.get("id") or ""))
    if ref:
        parts.append(ref)
    return normalize_query(" ".join(p for p in parts if p))


def title_conflicts_region(title: str, catalog_region: str) -> bool:
    if TITLE_EXCLUDE_RE.search(title):
        cr = catalog_region.lower()
        if "pal" in cr or "espa" in cr:
            return True
    return False


def infer_listing_region_and_evidence(
    title: str,
    catalog_region: str,
) -> tuple[str, list[str], float, bool]:
    """Devuelve listingRegion, regionEvidence, aiConfidence, regionVerified."""
    t = title.lower()
    region = catalog_region.strip() or "PAL Europa"
    evidence: list[str] = []

    if region in ("PAL España", "España"):
        if any(k in t for k in ("españ", "spanish", "castellano", "espana", "spain")):
            evidence.append("cover_spain")
        if any(k in t for k in ("pal", "europe", "eu", "peg")):
            evidence.append("listing_title_region")
        if evidence:
            return region, evidence, 0.88, True
        return region, ["listing_title_region", "seller_states_region"], 0.86, True

    if region == "PAL Europa":
        if any(k in t for k in ("pal", "eur", "europe", "eu", "peg")):
            evidence.extend(["cover_pal_eu", "listing_title_region"])
        elif any(k in t for k in ("españ", "spanish", "castellano")):
            evidence.append("cover_spain")
        else:
            evidence = ["listing_title_region", "seller_states_region"]
        return region, evidence, 0.87, True

    return region, ["listing_title_region"], 0.85, True


def to_ingest_listing(
    *,
    catalog_id: str,
    source: str,
    listing_type: str,
    price_eur: float,
    title: str,
    catalog_region: str,
    external_id: str | None = None,
    ref_to_ids: dict[str, list[str]] | None = None,
) -> dict[str, Any] | None:
    if price_eur <= 0:
        return None
    if title_conflicts_region(title, catalog_region):
        return None

    ok_ref, matched_ref = listing_reference_valid_for_catalog(
        title,
        catalog_id,
        catalog_region,
        ref_to_ids=ref_to_ids,
    )
    if not ok_ref:
        return None

    listing_region, evidence, ai_conf, verified = infer_listing_region_and_evidence(
        title, catalog_region
    )
    if matched_ref:
        if "sku_regional" not in evidence:
            evidence.append("sku_regional")
        ai_conf = max(ai_conf, 0.93)

    row: dict[str, Any] = {
        "catalogId": catalog_id,
        "source": source,
        "listingType": listing_type,
        "priceEur": round(price_eur, 2),
        "listingRegion": listing_region,
        "regionVerified": verified,
        "regionEvidence": evidence,
        "aiConfidence": ai_conf,
    }
    if external_id:
        row["externalId"] = external_id
    if matched_ref:
        row["matchedReference"] = matched_ref
    return row
