"""Neutral PhysicalEvidenceBundleV1 serializer shared with Research Engine V2."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

SCHEMA_VERSION = 1
MARKET_BOUND_SIGNALS = {"sku_regional", "distributor_regional"}
LANGUAGE_SIGNALS = {"back_cover_language", "cover_spain"}


def _clean(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _strings(value: Any) -> list[str]:
    return list(dict.fromkeys(str(item).strip() for item in _list(value) if str(item).strip()))


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _hash(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def map_visual_component(observation: dict[str, Any]) -> tuple[str, str]:
    """Map only facts the observation proves; ambiguous boxes stay unknown."""
    role = str(observation.get("role") or "other").strip().lower()
    component = str(observation.get("component") or "other").strip().lower()
    if role == "cartridge":
        return "CARTRIDGE_FRONT", "MEDIA"
    if role == "disc":
        return "DISC", "MEDIA"
    if component == "manual" or role == "manual":
        return ("MANUAL_BACK" if role == "back" else "MANUAL_FRONT"), "DOCUMENT"
    if component == "supplement":
        snippets = " ".join(_strings(observation.get("textSnippets"))).lower()
        if "download" in snippets or "descarga" in snippets:
            return "DOWNLOAD_CARD", "DOCUMENT"
        if "code" in snippets or "código" in snippets or "codigo" in snippets:
            return "CODE_VOUCHER", "DOCUMENT"
        return "UNKNOWN_COMPONENT", "DOCUMENT"
    if component == "seal" or role == "seal":
        return "UNKNOWN_COMPONENT", "STICKER"
    if component == "extra":
        return "UNKNOWN_COMPONENT", "ACCESSORY"
    # A visual 'box' can be the outer collector package or the inner game case.
    if component in {"box", "game", "other"}:
        return "UNKNOWN_COMPONENT", "PHYSICAL_PRODUCT"
    return "UNKNOWN_COMPONENT", "PHYSICAL_PRODUCT"


def _market_binding(region_evidence: list[str], observations: list[dict[str, Any]]) -> str:
    signals = set(region_evidence)
    if signals & MARKET_BOUND_SIGNALS:
        return "MARKET_BOUND"
    # A generic publisher/distributor name is not market proof. The upstream
    # regional policy must have classified the visible legal text as regional.
    languages = {value for row in observations for value in _strings(row.get("languages"))}
    if languages or signals & LANGUAGE_SIGNALS:
        return "LANGUAGE_ONLY"
    return "UNBOUND"


def _gaps(item: dict[str, Any], market_binding: str, observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    reason = str(item.get("reason") or "")
    condition = str(item.get("condition") or "unknown")
    if market_binding != "MARKET_BOUND" and ("region" in reason or item.get("targetRegion")):
        gaps.append({"field": "MARKET_REGION", "code": "MISSING_MARKET_PROOF", "missingProof": "No market-bound physical or distributor evidence.", "recommendedSourceTypes": ["EXACT_PHYSICAL_PHOTO", "DISTRIBUTOR"]})
    if condition == "unknown":
        gaps.append({"field": "CONDITION", "code": "MISSING_COMPONENT_PHOTO", "missingProof": "Visible edition contents are insufficient to assign a condition bucket.", "recommendedSourceTypes": ["EXACT_PHYSICAL_PHOTO"]})
    if not observations:
        gaps.append({"field": "CANONICAL_IDENTITY", "code": "MISSING_COMPONENT_BINDING", "missingProof": "No component-level visual observations reached the queue.", "recommendedSourceTypes": ["LISTING_IMAGES"]})
    return gaps


def build_physical_evidence_bundle(item: dict[str, Any], *, queue_version: str | None = None, row: dict[str, Any] | None = None) -> dict[str, Any]:
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    raw_vision = evidence.get("coverVision") if isinstance(evidence.get("coverVision"), dict) else {}
    raw_observations = _list(evidence.get("visualObservations")) or _list(raw_vision.get("observations")) or _list((row or {}).get("visualObservations"))
    observations: list[dict[str, Any]] = []
    identifiers: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_observations):
        if not isinstance(raw, dict):
            continue
        component, node_type = map_visual_component(raw)
        observation_id = f"obs-{index + 1}-{_hash(raw)[:12]}"
        observation = {
            "id": observation_id,
            "imageIndex": max(1, int(raw.get("imageIndex") or index + 1)),
            "component": component,
            "productNodeType": node_type,
            "role": str(raw.get("role") or "other").strip().lower(),
            "textSnippets": _strings(raw.get("textSnippets")),
            "productCodes": _strings(raw.get("productCodes")),
            "barcodes": [re.sub(r"\D", "", value) for value in _strings(raw.get("barcodes")) if 8 <= len(re.sub(r"\D", "", value)) <= 14],
            "languages": _strings(raw.get("languages")),
            "ratingSystems": _strings(raw.get("ratingSystems")),
            "distributors": _strings(raw.get("distributors")),
            "editionMarkers": _strings(raw.get("editionMarkers")),
        }
        observations.append(observation)
        identifiers.extend({"type": "EAN_UPC", "value": value, "component": component, "observationId": observation_id} for value in observation["barcodes"])
        identifiers.extend({"type": "PRODUCT_CODE", "value": value, "component": component, "observationId": observation_id} for value in observation["productCodes"])

    image_urls = _strings(evidence.get("imageUrls"))
    if _clean(evidence.get("imageUrl")) and evidence.get("imageUrl") not in image_urls:
        image_urls.insert(0, str(evidence["imageUrl"]))
    original_urls = _strings(raw_vision.get("images")) or image_urls
    image_hashes = evidence.get("imageHashes") if isinstance(evidence.get("imageHashes"), dict) else {}
    images = [{"index": index + 1, "url": url, "originalUrl": original_urls[index] if index < len(original_urls) else None, "hash": _clean(image_hashes.get(url))} for index, url in enumerate(image_urls)]
    region_evidence = _strings(evidence.get("regionEvidence"))
    market_binding = _market_binding(region_evidence, observations)
    root_id = f"product-{_hash([item.get('id'), item.get('candidateCatalogId')])[:16]}"
    nodes = [{"id": root_id, "type": "PHYSICAL_PRODUCT", "component": None, "label": str(item.get("listingTitle") or "Physical product")}]
    for observation in observations:
        nodes.append({"id": observation["id"], "type": observation["productNodeType"], "component": observation["component"], "label": f"Image {observation['imageIndex']} · {observation['role']}"})

    condition = str(item.get("condition") or "unknown")
    if condition not in {"loose", "game_manual", "complete", "sealed"}:
        condition = "unknown"
    confirmed: list[str] = []
    rejected: list[str] = []
    uncertain: list[str] = []
    if raw_vision.get("isTargetGame") is True:
        confirmed.append("identity")
    elif raw_vision.get("isTargetGame") is False:
        rejected.append("identity")
    elif item.get("candidateCatalogId") or item.get("catalogId"):
        confirmed.append("candidate_identity")
    else:
        uncertain.append("identity")
    if item.get("platformSlug"):
        confirmed.append("platform_candidate")
    if market_binding == "MARKET_BOUND":
        confirmed.append("market_region")
    else:
        uncertain.append("market_region")
    if condition != "unknown":
        confirmed.append("condition")
    else:
        uncertain.append("condition")

    evidence_payload = {
        "listing": evidence,
        "observations": observations,
        "identifiers": identifiers,
        "region": [item.get("targetRegion"), item.get("detectedRegion"), market_binding],
        "condition": condition,
    }
    input_payload = {key: value for key, value in item.items() if key not in {"decision", "decidedAt", "status", "adminEditedAt", "physicalEvidenceBundle", "curatorResolution", "attemptCount", "lastAttemptAt", "nextEligibleAt"}}
    bundle = {
        "schemaVersion": SCHEMA_VERSION,
        "reviewItemId": str(item.get("id") or ""),
        "queueVersion": str(queue_version or item.get("updatedAt") or item.get("createdAt") or "unknown"),
        "inputHash": _hash(input_payload),
        "evidenceHash": _hash(evidence_payload),
        "source": str(item.get("source") or "unknown"),
        "capturedAt": _clean(item.get("collectedAt")),
        "reason": _clean(item.get("reason")),
        "triageBucket": _clean(item.get("triageBucket")),
        "listing": {"id": _clean(evidence.get("externalId")), "url": _clean(evidence.get("url")), "title": str(item.get("listingTitle") or ""), "description": _clean(evidence.get("description")), "searchQuery": _clean(evidence.get("searchQuery"))},
        "catalog": {"searchedCatalogId": _clean(evidence.get("searchedCatalogId") or item.get("catalogId")), "candidateCatalogId": _clean(item.get("candidateCatalogId") or item.get("catalogId")), "alternatives": [value for value in _list(evidence.get("matchAlternatives")) if isinstance(value, dict)]},
        "subject": {"identity": _clean(evidence.get("catalogTitle") or item.get("listingTitle")), "platform": _clean(item.get("platformSlug")), "edition": _clean((row or {}).get("detectedPhysicalEdition") or (row or {}).get("targetPhysicalEdition")), "physicalVariant": _clean((row or {}).get("physicalVariant"))},
        "images": images,
        "originalImages": [{**image, "url": image["originalUrl"] or image["url"]} for image in images],
        "productGraph": {"nodes": nodes, "relations": [{"fromNodeId": node["id"], "toNodeId": root_id, "relation": "CONTAINS"} for node in nodes[1:]]},
        "observations": observations,
        "identifiers": identifiers,
        "regional": {"targetRegion": _clean(item.get("targetRegion")), "detectedRegion": _clean(item.get("detectedRegion")), "marketBinding": market_binding, "evidence": region_evidence, "packagingLanguages": sorted({value for row in observations for value in row["languages"]}), "distributors": sorted({value for row in observations for value in row["distributors"]}), "ratingSystems": sorted({value for row in observations for value in row["ratingSystems"]})},
        "condition": {"bucket": condition, "confidence": raw_vision.get("conditionConfidence") if isinstance(raw_vision.get("conditionConfidence"), (int, float)) else None, "evidence": _strings(raw_vision.get("sellerClaims")), "manualExpected": evidence.get("manualExpected") if isinstance(evidence.get("manualExpected"), bool) else None, "originalContentsExpected": _strings(evidence.get("originalContentsExpected"))},
        "price": {"amount": item.get("priceEur") if isinstance(item.get("priceEur"), (int, float)) else None, "shipping": evidence.get("shippingEur") if isinstance(evidence.get("shippingEur"), (int, float)) else None, "currency": _clean(evidence.get("originalCurrency") or "EUR"), "estimatedTotalToSpain": evidence.get("estimatedTotalToSpainEur") if isinstance(evidence.get("estimatedTotalToSpainEur"), (int, float)) else None},
        "confidence": evidence.get("aiConfidence") if isinstance(evidence.get("aiConfidence"), (int, float)) else None,
        "conflicts": [str(value) for value in _list(raw_vision.get("validationWarnings"))],
        "confirmed": confirmed,
        "rejected": rejected,
        "uncertain": uncertain,
        "evidenceGaps": _gaps(item, market_binding, observations),
    }
    return bundle


def validate_physical_evidence_bundle(bundle: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = {"schemaVersion", "reviewItemId", "queueVersion", "inputHash", "evidenceHash", "listing", "catalog", "observations", "identifiers", "regional", "condition", "evidenceGaps"}
    for key in sorted(required - set(bundle)):
        errors.append(f"missing:{key}")
    if bundle.get("schemaVersion") != 1:
        errors.append("schemaVersion")
    for key in ("inputHash", "evidenceHash"):
        if not re.fullmatch(r"[a-f0-9]{64}", str(bundle.get(key) or "")):
            errors.append(key)
    return errors


__all__ = ["SCHEMA_VERSION", "build_physical_evidence_bundle", "map_visual_component", "validate_physical_evidence_bundle"]
