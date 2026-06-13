"""Reglas de prueba de región (data/region-evidence-rules.json)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RULES_FILE = ROOT / "data" / "region-evidence-rules.json"


def _load_rules() -> dict[str, Any]:
    return json.loads(RULES_FILE.read_text(encoding="utf-8"))


def _normalize_region(region: str) -> str:
    return region.strip().lower()


def _merge_rule(*blocks: dict[str, Any] | None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for block in blocks:
        if not block:
            continue
        for key, value in block.items():
            if value is not None:
                merged[key] = value
    return merged


def get_region_evidence_rule(platform_slug: str, catalog_region: str) -> dict[str, Any]:
    rules = _load_rules()
    region_key = _normalize_region(catalog_region)
    platform = (rules.get("platforms") or {}).get(platform_slug) or {}

    return _merge_rule(
        rules.get("default"),
        (rules.get("catalogRegionOverrides") or {}).get(region_key),
        platform,
        (platform.get("catalogRegionOverrides") or {}).get(region_key),
    )


def get_retail_evidence_rule(retail_source: str) -> dict[str, Any]:
    rules = _load_rules()
    return dict((rules.get("retailSources") or {}).get(retail_source) or {})


def check_retail_evidence_meets_rules(
    retail_source: str,
    region_evidence: list[str],
    ai_confidence: float | None = None,
) -> tuple[bool, str | None]:
    rules = _load_rules()
    rule = get_retail_evidence_rule(retail_source)
    if not rule:
        return False, "unknown_retail_source"

    evidence = {e.strip() for e in region_evidence if e and str(e).strip()}
    min_count = rule.get("minEvidenceCount") or rules.get("default", {}).get("minEvidenceCount", 1)
    if len(evidence) < min_count:
        return False, "insufficient_count"

    required_any = rule.get("requiredAnyOf") or []
    if required_any and not any(code in evidence for code in required_any):
        return False, "missing_required"

    forbidden = rule.get("forbiddenEvidence") or []
    if any(code in evidence for code in forbidden):
        return False, "forbidden"

    min_ai = rule.get("minAiConfidence") or rules.get("default", {}).get("minAiConfidence")
    if min_ai is not None and ai_confidence is not None and ai_confidence < min_ai:
        return False, "low_ai_confidence"

    return True, None


def check_listing_evidence_meets_rules(
    platform_slug: str,
    catalog_region: str,
    region_evidence: list[str],
    ai_confidence: float | None = None,
) -> tuple[bool, str | None]:
    rules = _load_rules()
    rule = get_region_evidence_rule(platform_slug, catalog_region)
    evidence = {e.strip() for e in region_evidence if e and str(e).strip()}

    min_count = rule.get("minEvidenceCount") or rules.get("default", {}).get("minEvidenceCount", 1)
    if len(evidence) < min_count:
        return False, "insufficient_count"

    required_any = rule.get("requiredAnyOf") or []
    if required_any and not any(code in evidence for code in required_any):
        return False, "missing_required"

    forbidden = rule.get("forbiddenEvidence") or []
    if any(code in evidence for code in forbidden):
        return False, "forbidden"

    min_ai = rule.get("minAiConfidence") or rules.get("default", {}).get("minAiConfidence")
    if min_ai is not None and ai_confidence is not None and ai_confidence < min_ai:
        return False, "low_ai_confidence"

    return True, None
