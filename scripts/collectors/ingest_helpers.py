"""Helpers comunes para filas ingest (condición, imágenes, metadatos)."""

from __future__ import annotations

from typing import Any

from collectors.catalog_match import CatalogMatchResult
from collectors.condition_buckets import bucket_from_raw, infer_condition_bucket
from collectors.listing_images import attach_image_urls
from collectors.match_pipeline import attach_match_metadata


def apply_condition_bucket(row: dict[str, Any], product: dict[str, Any], *, title: str = "") -> None:
    title = title or str(row.get("title") or product.get("title") or product.get("name") or "")
    raw = str(row.get("condition") or product.get("condition") or product.get("conditionRaw") or "")
    bucket = bucket_from_raw(raw) or infer_condition_bucket(title, condition_raw=raw)
    if bucket:
        row["condition"] = bucket


__all__ = ["apply_condition_bucket", "attach_match_metadata", "attach_image_urls"]
