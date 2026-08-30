"""Estado de conservación → precios por estado."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from collectors.jgo_match import infer_condition

ROOT = Path(__file__).resolve().parents[2]
WEIGHTS_FILE = ROOT / "data" / "price-source-weights.json"

DISPLAY_BUCKETS = ("loose", "game_manual", "complete", "sealed")

BUCKET_LABELS_ES: dict[str, str] = {
    "loose": "Suelto",
    "game_manual": "Juego + manual",
    "complete": "Completo",
    "sealed": "Precintado",
}

RAW_TO_BUCKET: dict[str, str] = {
    "used": "loose",
    "preowned": "complete",
    "segunda mano": "complete",
    "loose": "loose",
    "game_manual": "game_manual",
    "with_manual": "game_manual",
    "no_box": "game_manual",
    "no_manual": "complete",
    "cib": "complete",
    "complete": "complete",
    "sealed": "sealed",
}

SEALED_RE = re.compile(r"\b(precintado|precintada|sellado|sealed|brand new sealed|new sealed)\b", re.I)
UNSEALED_RE = re.compile(
    r"\b(desprecintado|desprecintada|sin precinto|precinto abierto|caja abierta|open box|opened)\b",
    re.I,
)
NO_BOX_RE = re.compile(r"\b(sin caja|no box|solo cartucho|solo disco|solo juego)\b", re.I)
COMPLETE_RE = re.compile(
    r"\b("
    r"completo|complete|cib|con caja|"
    r"sin manual|no manual|solo falta manual|"
    r"caja y|box and|with box|in box|boxed"
    r")\b",
    re.I,
)
GAME_MANUAL_RE = re.compile(
    r"\b("
    r"juego\s*(?:\+|y|con)\s*manual|"
    r"cartucho\s*(?:\+|y|con)\s*manual|"
    r"disco\s*(?:\+|y|con)\s*manual|"
    r"con manual(?:\s+y\s+sin\s+caja|\s+sin\s+caja)|"
    r"manual incluido(?:\s+sin\s+caja)?|"
    r"manual incl\.?(?:\s+sin\s+caja)?|"
    r"game\s*(?:\+|and|with)\s*manual|"
    r"disc\s*(?:\+|and|with)\s*manual|"
    r"cart\s*(?:\+|and|with)\s*manual"
    r")\b",
    re.I,
)
LOOSE_RE = re.compile(
    r"\b("
    r"solo cartucho|solo juego|solo disco|only cart|only disc|"
    r"loose|suelto|usado\b|used\b|cartucho nudo|solo el juego|"
    r"cartucho|cartridge"
    r")\b",
    re.I,
)


def bucket_from_raw(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower()
    return RAW_TO_BUCKET.get(key)


def infer_condition_bucket(
    title: str,
    *,
    condition_raw: str = "",
    description: str = "",
) -> str | None:
    """Devuelve loose | complete | sealed | None."""
    combined = f"{condition_raw} {title} {description}".strip()
    if not combined:
        return None

    if UNSEALED_RE.search(combined) and not NO_BOX_RE.search(combined):
        return "complete"
    if SEALED_RE.search(combined):
        return "sealed"
    if GAME_MANUAL_RE.search(combined) and not COMPLETE_RE.search(combined):
        return "game_manual"
    if COMPLETE_RE.search(combined):
        return "complete"
    if LOOSE_RE.search(combined):
        return "loose"

    inferred = infer_condition(combined)
    bucket = bucket_from_raw(inferred)
    if bucket:
        return bucket
    return None


def observation_from_row(
    row: dict[str, Any],
    *,
    platform_slug: str = "",
    price_key: str = "priceEur",
    title_key: str = "title",
    condition_key: str = "condition",
    use_vision: bool = True,
    fetch_images: bool = True,
) -> tuple[float, str, str] | None:
    price = row.get(price_key)
    if price is None:
        price = row.get("retailPriceEur")
    if price is None:
        price = row.get("sellPriceEur")
    if price is None or float(price) <= 0:
        return None

    from collectors.condition_resolve import resolve_condition_bucket

    has_inline_image = bool(row.get("imageUrls") or row.get("imageUrl"))
    bucket, method = resolve_condition_bucket(
        row,
        platform_slug=platform_slug,
        use_vision=use_vision,
        fetch_images=fetch_images and not has_inline_image,
    )
    if not bucket:
        return None

    source = str(row.get("source") or "otro").strip().lower()
    if method == "vision":
        row["conditionBucket"] = bucket
        row["conditionResolvedBy"] = "vision"
    return round(float(price), 2), bucket, source


def _load_weight_config() -> tuple[dict[str, str], dict[str, float]]:
    raw = load_json_weights()
    categories = {str(k).lower(): str(v) for k, v in (raw.get("sourceCategories") or {}).items()}
    weights = {str(k): float(v) for k, v in (raw.get("categoryWeights") or {}).items()}
    if not weights:
        weights = {"p2p": 1.0, "retail_es": 0.65, "import_retail": 0.55}
    return categories, weights


def load_json_weights() -> dict[str, Any]:
    if not WEIGHTS_FILE.exists():
        return {}
    return json.loads(WEIGHTS_FILE.read_text(encoding="utf-8"))


def source_weight(source: str, *, categories: dict[str, str] | None = None, weights: dict[str, float] | None = None) -> float:
    if categories is None or weights is None:
        categories, weights = _load_weight_config()
    key = str(source or "otro").strip().lower()
    category = categories.get(key, "p2p")
    return weights.get(category, 1.0)


def mean_by_bucket(observations: list[tuple[float, str, str]]) -> tuple[dict[str, float | None], set[str]]:
    """Media ponderada por estado; pesos en data/price-source-weights.json."""
    categories, weights = _load_weight_config()
    buckets: dict[str, list[tuple[float, float]]] = {b: [] for b in DISPLAY_BUCKETS}
    sources: set[str] = set()
    for price, bucket, source in observations:
        w = source_weight(source, categories=categories, weights=weights)
        buckets[bucket].append((price, w))
        sources.add(source)

    out: dict[str, float | None] = {}
    for bucket in DISPLAY_BUCKETS:
        vals = buckets[bucket]
        if not vals:
            out[bucket] = None
            continue
        total_w = sum(w for _, w in vals)
        if total_w <= 0:
            out[bucket] = round(sum(p for p, _ in vals) / len(vals), 2)
        else:
            out[bucket] = round(sum(p * w for p, w in vals) / total_w, 2)
    return out, sources


SOURCE_LABELS: dict[str, str] = {
    "todocoleccion": "TodoColeccion",
    "todoconsolas": "TodoConsolas",
    "cex": "CeX",
    "game-es-preowned": "GAME seminuevo",
    "jgo": "Japan Game Online",
    "japangameonline": "Japan Game Online",
    "chollo": "Chollo Games",
    "chollogames": "Chollo Games",
    "kaoto": "Kaoto Store",
    "kaotostore": "Kaoto Store",
    "ebay-es": "eBay ES",
    "ebay": "eBay ES",
    "wallapop": "Wallapop",
    "vinted-es": "Vinted",
    "otro": "Otros",
}


def format_data_sources(sources: set[str]) -> str:
    labels = [SOURCE_LABELS.get(s, s.replace("-", " ").title()) for s in sorted(sources)]
    return " · ".join(labels)


__all__ = [
    "BUCKET_LABELS_ES",
    "DISPLAY_BUCKETS",
    "format_data_sources",
    "infer_condition_bucket",
    "mean_by_bucket",
    "observation_from_row",
    "source_weight",
]
