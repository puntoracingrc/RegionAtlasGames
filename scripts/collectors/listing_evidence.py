"""Listing-specific evidence acquisition and component-bound visual analysis.

The module is deliberately separate from public assets. Downloaded bytes are an
internal, auditable evidence cache and every observation retains its exact
listing, image index, content hash and physical component.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from collectors.ai_balance import check_billing_error
from collectors.ai_usage import record_usage
from collectors.listing_images import CURATOR_MAX_LISTING_IMAGES, curator_ebay_image_records

try:
    from PIL import Image
except ImportError:  # pragma: no cover - dimensions remain optional by contract
    Image = None  # type: ignore[assignment]


COMPONENTS = (
    "OUTER_PACKAGE_FRONT", "OUTER_PACKAGE_BACK", "OUTER_PACKAGE_SPINE",
    "INNER_CASE_FRONT", "INNER_CASE_BACK", "INNER_CASE_SPINE",
    "CARTRIDGE_FRONT", "CARTRIDGE_BACK", "DISC", "MANUAL_FRONT", "MANUAL_BACK",
    "INSERT", "CODE_VOUCHER", "DOWNLOAD_CARD", "SEAL", "SELLER_STICKER",
    "ACCESSORY", "UNKNOWN_COMPONENT",
)
IRRELEVANT_SUBJECTS = (
    "OTHER_MERCHANDISE", "DECORATION", "SCREENSHOT", "INVOICE", "CONTROLLER",
    "CONSOLE", "MOVIE", "FIGURE", "DUPLICATE", "NEAR_DUPLICATE",
)
ACCEPTED_SUBJECT = "TARGET_LISTING_SPECIMEN"
DEFAULT_MODEL = "gpt-4o-mini"
MAX_IMAGE_BYTES = 20_000_000


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _dimensions(data: bytes) -> tuple[int | None, int | None, str | None]:
    if Image is None:
        return None, None, None
    try:
        with Image.open(io.BytesIO(data)) as image:
            return int(image.width), int(image.height), str(image.format or "").lower() or None
    except Exception:
        return None, None, None


def _download_image(url: str) -> tuple[bytes, str | None, str]:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (host == "ebayimg.com" or host.endswith(".ebayimg.com")):
        raise ValueError("UNSAFE_LISTING_IMAGE_URL")
    request = urllib.request.Request(url, headers={"User-Agent": "RegionAtlasGames/1.0 listing-evidence"})
    with urllib.request.urlopen(request, timeout=45) as response:
        content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].lower() or None
        resolved = response.geturl()
        data = response.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("LISTING_IMAGE_TOO_LARGE")
    if not data or (content_type and not content_type.startswith("image/")):
        raise ValueError("LISTING_IMAGE_NOT_IMAGE")
    return data, content_type, resolved


def acquire_listing_snapshot(
    hydrated: dict[str, Any],
    *,
    cache_dir: Path,
    downloader: Callable[[str], tuple[bytes, str | None, str]] = _download_image,
    captured_at: str | None = None,
    max_images: int = CURATOR_MAX_LISTING_IMAGES,
) -> dict[str, Any]:
    listing_id = str(hydrated.get("itemId") or hydrated.get("legacyItemId") or "").strip()
    if not listing_id:
        raise ValueError("MISSING_LISTING_ID")
    records = curator_ebay_image_records(hydrated, limit=max_images)
    cache_dir.mkdir(parents=True, exist_ok=True)
    acquired: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    by_hash: dict[str, int] = {}
    for source_index, record in enumerate(records, start=1):
        url = str(record["resolvedUrl"])
        try:
            data, content_type, resolved_url = downloader(url)
            digest = hashlib.sha256(data).hexdigest()
            width, height, image_format = _dimensions(data)
            suffix = ".jpg" if image_format in {"jpeg", "jpg"} else f".{image_format}" if image_format else ".img"
            target = cache_dir / f"{digest}{suffix}"
            if not target.exists():
                target.write_bytes(data)
            try:
                cache_reference = str(target.relative_to(Path.cwd()))
            except ValueError:
                # Keep committed audit artifacts portable and avoid leaking a
                # developer's absolute filesystem path.
                cache_reference = str(Path("data/price-ingest/listing-evidence") / listing_id.replace("|", "_") / target.name)
            image = {
                "listingId": listing_id,
                "imageIndex": len(acquired) + 1,
                "sourceIndex": source_index,
                "sourceUrl": record["sourceUrl"],
                "originalUrl": record["originalUrl"],
                "resolvedUrl": resolved_url,
                "contentHash": digest,
                "width": width or record.get("width"),
                "height": height or record.get("height"),
                "byteLength": len(data),
                "contentType": content_type,
                "cachePath": cache_reference,
                "sourceKind": record.get("kind"),
                "publicationAllowed": False,
            }
            previous_index = by_hash.get(digest)
            if previous_index is None:
                by_hash[digest] = len(acquired)
                acquired.append(image)
            else:
                previous = acquired[previous_index]
                previous_quality = (int(previous.get("width") or 0) * int(previous.get("height") or 0), int(previous.get("byteLength") or 0))
                quality = (int(image.get("width") or 0) * int(image.get("height") or 0), int(image.get("byteLength") or 0))
                if quality > previous_quality:
                    image["imageIndex"] = previous["imageIndex"]
                    acquired[previous_index] = image
        except (ValueError, OSError, TimeoutError, urllib.error.URLError) as exc:
            failures.append({"url": url, "error": str(exc)})
    metadata = {key: hydrated.get(key) for key in (
        "title", "shortDescription", "description", "condition", "conditionId",
        "conditionDescription", "itemWebUrl", "itemLocation", "seller", "category",
        "categoryId", "aspects", "price", "shippingOptions", "buyingOptions",
        "itemEndDate", "estimatedAvailabilities", "gtin", "brand", "mpn", "epid",
    )}
    return {
        "schemaVersion": 1,
        "listingId": listing_id,
        "legacyItemId": hydrated.get("legacyItemId"),
        "capturedAt": captured_at or now_iso(),
        "sourceMarketplace": "ebay",
        "metadata": metadata,
        "imagesAvailableFromSource": len(records),
        "imagesPreserved": len(acquired),
        "images": acquired,
        "failures": failures,
        "rights": {"classification": "INTERNAL_EVIDENCE_REFERENCE", "publishAsRegionAtlasAsset": False},
    }


def classify_images(
    snapshot: dict[str, Any],
    *,
    classifier: Callable[[dict[str, Any]], dict[str, Any]],
) -> list[dict[str, Any]]:
    classified: list[dict[str, Any]] = []
    for image in snapshot.get("images") or []:
        raw = classifier(image)
        subject = str(raw.get("subject") or "UNKNOWN").upper()
        component = str(raw.get("component") or "UNKNOWN_COMPONENT").upper()
        if component not in COMPONENTS:
            component = "UNKNOWN_COMPONENT"
        if subject != ACCEPTED_SUBJECT and subject not in IRRELEVANT_SUBJECTS:
            subject = "UNKNOWN"
        classified.append({
            "listingId": snapshot["listingId"],
            "imageIndex": image["imageIndex"],
            "contentHash": image["contentHash"],
            "subject": subject,
            "component": component,
            "confidence": max(0.0, min(1.0, float(raw.get("confidence") or 0))),
            "reason": str(raw.get("reason") or ""),
        })
    return classified


def listing_component_coverage(classifications: list[dict[str, Any]]) -> dict[str, Any]:
    accepted = [row for row in classifications if row["subject"] == ACCEPTED_SUBJECT]
    components = sorted({row["component"] for row in accepted if row["component"] != "UNKNOWN_COMPONENT"})
    return {
        "components": {component: component in components for component in COMPONENTS if component != "UNKNOWN_COMPONENT"},
        "acceptedImageIndexes": [row["imageIndex"] for row in accepted],
        "rejectedImageIndexes": [row["imageIndex"] for row in classifications if row["subject"] not in {ACCEPTED_SUBJECT, "UNKNOWN"}],
        "unknownImageIndexes": [row["imageIndex"] for row in classifications if row["subject"] == "UNKNOWN" or row["component"] == "UNKNOWN_COMPONENT"],
    }


def plan_high_detail_images(
    classifications: list[dict[str, Any]],
    *,
    platform: str,
    evidence_gaps: list[str],
    max_images: int = 8,
) -> list[int]:
    gap_text = " ".join(evidence_gaps).upper()
    platform_key = platform.lower().replace(" ", "")
    wanted: list[str] = []
    if "MARKET" in gap_text or "REGION" in gap_text:
        wanted.extend(["OUTER_PACKAGE_BACK", "INNER_CASE_BACK", "OUTER_PACKAGE_SPINE", "INNER_CASE_SPINE"])
    if "PRODUCT_CODE" in gap_text or platform_key in {"n64", "gameboy", "gb", "gbc", "gba"}:
        wanted.extend(["CARTRIDGE_FRONT", "CARTRIDGE_BACK"])
    if "CONDITION" in gap_text or "COMPONENT" in gap_text:
        wanted.extend(["OUTER_PACKAGE_FRONT", "OUTER_PACKAGE_BACK", "INNER_CASE_FRONT", "INNER_CASE_BACK", "DISC", "CARTRIDGE_FRONT", "MANUAL_FRONT", "SEAL", "ACCESSORY"])
    if platform_key in {"ps4", "ps5"}:
        wanted.extend(["INNER_CASE_BACK", "OUTER_PACKAGE_BACK", "DISC", "SEAL"])
    rank = {component: index for index, component in enumerate(dict.fromkeys(wanted))}
    eligible = [row for row in classifications if row["subject"] == ACCEPTED_SUBJECT]
    eligible.sort(key=lambda row: (rank.get(row["component"], len(rank) + 1), -float(row["confidence"]), row["imageIndex"]))
    selected: list[dict[str, Any]] = []
    seen_components: set[str] = set()
    # Coverage first: repeated cartridge/front photos must not crowd out the
    # only manual, back, seal or disc image that can close the evidence gap.
    for row in eligible:
        if row["component"] in seen_components:
            continue
        selected.append(row)
        seen_components.add(row["component"])
        if len(selected) >= max(1, max_images):
            break
    if len(selected) < max(1, max_images):
        selected_ids = {int(row["imageIndex"]) for row in selected}
        selected.extend(row for row in eligible if int(row["imageIndex"]) not in selected_ids)
    return [int(row["imageIndex"]) for row in selected[:max(1, max_images)]]


def bound_observation(
    snapshot: dict[str, Any],
    classification: dict[str, Any],
    extracted: dict[str, Any],
) -> dict[str, Any]:
    image_index = int(classification["imageIndex"])
    image = next(row for row in snapshot["images"] if int(row["imageIndex"]) == image_index)
    if str(classification.get("listingId") or "") != str(snapshot.get("listingId") or ""):
        raise ValueError("LISTING_IMAGE_CROSS_ATTRIBUTION")
    if str(classification.get("contentHash") or "") != str(image.get("contentHash") or ""):
        raise ValueError("LISTING_IMAGE_HASH_MISMATCH")
    component = classification["component"]
    seed = json.dumps([snapshot["listingId"], image_index, image["contentHash"], component], separators=(",", ":"))
    observation_id = f"listing-obs-{hashlib.sha256(seed.encode()).hexdigest()[:16]}"
    strings = lambda key: list(dict.fromkeys(str(value).strip() for value in extracted.get(key) or [] if str(value).strip()))
    return {
        "id": observation_id,
        "listingId": snapshot["listingId"],
        "imageIndex": image_index,
        "contentHash": image["contentHash"],
        "component": component,
        "subject": classification["subject"],
        "title": str(extracted.get("title") or "").strip() or None,
        "platform": str(extracted.get("platform") or "").strip() or None,
        "editionMarkers": strings("editionMarkers"),
        "barcodes": strings("barcodes"),
        "productCodes": strings("productCodes"),
        "serials": strings("serials"),
        "ratingSystems": strings("ratingSystems"),
        "languages": strings("languages"),
        "distributors": strings("distributors"),
        "publisherLegalText": strings("publisherLegalText"),
        "visibleText": strings("visibleText"),
        "sealEvidence": str(extracted.get("sealEvidence") or "UNKNOWN").upper(),
        "confidence": max(0.0, min(1.0, float(extracted.get("confidence") or 0))),
    }


def diagnose_evidence_stage(snapshot: dict[str, Any], classifications: list[dict[str, Any]], observations: list[dict[str, Any]], *, market_bound: bool, resolved: bool) -> str:
    if not snapshot.get("imagesAvailableFromSource") or not snapshot.get("imagesPreserved"):
        return "ACQUISITION_FAILURE"
    if not any((row.get("width") or 0) >= 800 or (row.get("height") or 0) >= 800 for row in snapshot.get("images") or []):
        return "IMAGE_QUALITY_FAILURE"
    if not any(row.get("subject") == ACCEPTED_SUBJECT for row in classifications):
        return "SUBJECT_CLASSIFICATION_FAILURE"
    if not any(row.get("component") != "UNKNOWN_COMPONENT" for row in classifications if row.get("subject") == ACCEPTED_SUBJECT):
        return "COMPONENT_CLASSIFICATION_FAILURE"
    if not observations:
        return "EXTRACTION_FAILURE"
    if any(not row.get("listingId") or not row.get("contentHash") or not row.get("component") for row in observations):
        return "COMPONENT_BINDING_FAILURE"
    if not market_bound:
        return "MARKET_BINDING_FAILURE"
    return "RESOLVED" if resolved else "TRULY_MISSING_EVIDENCE"


def _openai_json(*, image_url: str, prompt: str, detail: str, operation: str) -> tuple[dict[str, Any], dict[str, Any]]:
    return _openai_images_json(image_urls=[image_url], prompt=prompt, detail=detail, operation=operation)


def _openai_images_json(*, image_urls: list[str], prompt: str, detail: str, operation: str) -> tuple[dict[str, Any], dict[str, Any]]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada")
    model = os.environ.get("RESEARCH_VISION_MODEL") or os.environ.get("OPENAI_VISION_MODEL") or DEFAULT_MODEL
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for index, image_url in enumerate(image_urls, start=1):
        content.append({"type": "text", "text": f"IMAGE_INDEX={index}"})
        content.append({"type": "image_url", "image_url": {"url": image_url, "detail": detail}})
    body = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "Inspect physical videogame listing photos. Report only visible facts; never infer hidden identifiers or market."},
            {"role": "user", "content": content},
        ],
    }
    request = urllib.request.Request(
        f"{os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        check_billing_error(exc)
        raise
    record_usage(payload, model=model, operation=operation)
    content = str(payload["choices"][0]["message"]["content"])
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return json.loads(content), usage


def openai_triage(image: dict[str, Any]) -> dict[str, Any]:
    prompt = (
        "Classify this one image from an exact marketplace listing. Return JSON only: "
        '{"subject":"TARGET_LISTING_SPECIMEN|OTHER_MERCHANDISE|DECORATION|SCREENSHOT|INVOICE|CONTROLLER|CONSOLE|MOVIE|FIGURE|DUPLICATE|NEAR_DUPLICATE|UNKNOWN",'
        f'"component":"{"|".join(COMPONENTS)}","confidence":0.0,"reason":"short visible reason"}}. '
        "TARGET_LISTING_SPECIMEN means a physical item belonging to the videogame specimen offered in this listing."
    )
    result, usage = _openai_json(image_url=str(image["resolvedUrl"]), prompt=prompt, detail="low", operation="listing_evidence_triage")
    result["usage"] = usage
    return result


def openai_triage_batch(images: list[dict[str, Any]], *, title: str, platform: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not images:
        return [], {}
    prompt = (
        f"Listing title: {title}\nExpected platform: {platform}\n"
        "Classify every supplied image independently. Return JSON only as "
        '{"images":[{"imageIndex":1,"subject":"TARGET_LISTING_SPECIMEN|OTHER_MERCHANDISE|DECORATION|SCREENSHOT|INVOICE|CONTROLLER|CONSOLE|MOVIE|FIGURE|DUPLICATE|NEAR_DUPLICATE|UNKNOWN",'
        f'"component":"{"|".join(COMPONENTS)}","confidence":0.0,"reason":"short visible reason"}}]}}. '
        "TARGET_LISTING_SPECIMEN means a physical item belonging to the videogame specimen offered by this exact listing."
    )
    result, usage = _openai_images_json(
        image_urls=[str(row["resolvedUrl"]) for row in images], prompt=prompt, detail="low", operation="listing_evidence_triage_batch",
    )
    rows = result.get("images") if isinstance(result.get("images"), list) else []
    return [row for row in rows if isinstance(row, dict)], usage


def openai_extract(image: dict[str, Any], *, component: str, title: str, platform: str) -> dict[str, Any]:
    prompt = (
        f"Expected listing title: {title}\nExpected platform: {platform}\nClassified component: {component}\n"
        "Extract only clearly visible facts from this exact component. Return JSON only with: "
        '{"title":null,"platform":null,"editionMarkers":[],"barcodes":[],"productCodes":[],"serials":[],'
        '"ratingSystems":[],"languages":[],"distributors":[],"publisherLegalText":[],"visibleText":[],'
        '"sealEvidence":"FACTORY_SEAL|OPENED|NOT_APPLICABLE|UNKNOWN","confidence":0.0}. '
        "Do not repair, complete, guess or infer identifiers. Keep uncertain text out."
    )
    result, usage = _openai_json(image_url=str(image["resolvedUrl"]), prompt=prompt, detail="high", operation="listing_evidence_extract")
    result["usage"] = usage
    return result


def openai_extract_batch(images: list[dict[str, Any]], *, components: dict[int, str], title: str, platform: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not images:
        return [], {}
    component_lines = ", ".join(f"{position + 1}:{components.get(int(image['imageIndex']), 'UNKNOWN_COMPONENT')}" for position, image in enumerate(images))
    prompt = (
        f"Expected listing title: {title}\nExpected platform: {platform}\nComponents by IMAGE_INDEX: {component_lines}\n"
        "Extract only clearly visible facts for every exact component. Return JSON only as "
        '{"images":[{"imageIndex":1,"title":null,"platform":null,"editionMarkers":[],"barcodes":[],"productCodes":[],"serials":[],'
        '"ratingSystems":[],"languages":[],"distributors":[],"publisherLegalText":[],"visibleText":[],'
        '"sealEvidence":"FACTORY_SEAL|OPENED|NOT_APPLICABLE|UNKNOWN","confidence":0.0}]}. '
        "Do not repair, complete, guess or infer identifiers. Keep uncertain text out."
    )
    result, usage = _openai_images_json(
        image_urls=[str(row["resolvedUrl"]) for row in images], prompt=prompt, detail="high", operation="listing_evidence_extract_batch",
    )
    rows = result.get("images") if isinstance(result.get("images"), list) else []
    return [row for row in rows if isinstance(row, dict)], usage


def openai_market_extract_batch(images: list[dict[str, Any]], *, components: dict[int, str], title: str, platform: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not images:
        return [], {}
    component_lines = ", ".join(f"{position + 1}:{components.get(int(image['imageIndex']), 'UNKNOWN_COMPONENT')}" for position, image in enumerate(images))
    prompt = (
        f"Expected listing title: {title}\nExpected platform: {platform}\nComponents by IMAGE_INDEX: {component_lines}\n"
        "This is a targeted second reading for MARKET BINDING. Read only clearly visible text from the physical component. "
        "Return JSON only as "
        '{"images":[{"imageIndex":1,"productCodes":[],"serials":[],"barcodes":[],"distributors":[],'
        '"publisherLegalText":[],"languages":[],"visibleText":[],"confidence":0.0}]}. '
        "Prioritize exact cartridge/box/disc codes and named national importer/distributor or explicit legal distribution country. "
        "Do not infer country from seller location, language, PEGI, EAN prefix, title metadata, or an incomplete code."
    )
    result, usage = _openai_images_json(
        image_urls=[str(row["resolvedUrl"]) for row in images], prompt=prompt, detail="high", operation="listing_evidence_market_followup",
    )
    rows = result.get("images") if isinstance(result.get("images"), list) else []
    return [row for row in rows if isinstance(row, dict)], usage


__all__ = [
    "ACCEPTED_SUBJECT", "COMPONENTS", "acquire_listing_snapshot", "bound_observation",
    "classify_images", "diagnose_evidence_stage", "listing_component_coverage",
    "openai_extract", "openai_extract_batch", "openai_market_extract_batch", "openai_triage", "openai_triage_batch", "plan_high_detail_images",
]
