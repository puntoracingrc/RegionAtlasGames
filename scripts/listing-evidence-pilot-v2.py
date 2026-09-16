#!/usr/bin/env python3
"""Real, read-only pilot for listing-specific physical evidence acquisition."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.ebay_client import hydrate_ebay_item, search_ebay_es  # noqa: E402
from collectors.ai_balance import AiBalanceExhausted  # noqa: E402
from collectors.listing_evidence import (  # noqa: E402
    ACCEPTED_SUBJECT,
    COMPONENTS,
    acquire_listing_snapshot,
    bound_observation,
    diagnose_evidence_stage,
    listing_component_coverage,
    openai_extract_batch,
    openai_market_extract_batch,
    openai_triage_batch,
    plan_high_detail_images,
)

PLATFORM_SEEDS = {
    "ps4": [
        ("Hoa", "ps4-hoa"), ("God Eater 3", "ps4-god-eater-3"),
        ("Tales of Berseria", "ps4-tales-of-berseria"),
        ("Gran Turismo 7", "ps4-gran-turismo-7"), ("Horizon Zero Dawn", "ps4-horizon-zero-dawn"),
        ("The Last of Us Part II", "ps4-the-last-of-us-part-ii"),
        ("Uncharted 4 A Thief's End", "ps4-uncharted-4-a-thief%27s-end"),
        ("Horizon Forbidden West", "ps4-horizon-forbidden-west"),
    ],
    "n64": [
        ("Super Mario 64", "n64-pal-eu-super-mario-64"), ("Pokemon Snap", "n64-espana-pokemon-snap"),
        ("Milo's Astro Lanes", "n64-milo%27s-astro-lanes"), ("Mario Party", "n64-pal-eu-mario-party"),
        ("Star Wars Episode I Racer", "n64-star-wars-episode-i-racer"),
        ("Mario Kart 64", "n64-pal-mario-kart-64"), ("Diddy Kong Racing", "n64-diddy-kong-racing"),
    ],
    "ps5": [
        ("Ikai", "ps5-ikai"), ("Biomutant", "ps5-biomutant"), ("Hoa", "ps5-hoa"),
        ("Tales of Arise", "ps5-tales-of-arise"), ("Bramble The Mountain King", "ps5-bramble-the-mountain-king"),
        ("Gran Turismo 7", "ps5-gran-turismo-7"),
    ],
}
GAMEBOY_HOLDOUT_IDS = [
    "74f1b486ba2398b1d771",  # negative product-category holdout
    "d7f572a1f0c11eea4e20", "2e7645bc3a0305d6661c", "3e5cf57f4a78743f4a89", "2a15931917249023d109",
]
IRRELEVANT = {"OTHER_MERCHANDISE", "DECORATION", "SCREENSHOT", "INVOICE", "CONTROLLER", "CONSOLE", "MOVIE", "FIGURE"}


def normalized(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", html.unescape(str(value or "")))
    return re.sub(r"[^a-z0-9]+", " ", "".join(ch for ch in raw if not unicodedata.combining(ch)).lower()).strip()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def catalog_indexes() -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str], list[dict[str, Any]]]]:
    rows = read_json(ROOT / "data" / "catalog.json")
    by_id = {str(row["id"]): row for row in rows}
    by_title: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        by_title.setdefault((str(row.get("platformSlug") or ""), normalized(row.get("title"))), []).append(row)
    return by_id, by_title


def title_matches(candidate: str, expected: str) -> bool:
    a = set(normalized(candidate).split())
    b = {token for token in normalized(expected).split() if token not in {"the", "of", "a"}}
    return bool(b) and len(a & b) / len(b) >= 0.75


def discover_seed_case(platform: str, title: str, catalog_id: str) -> dict[str, Any] | None:
    platform_query = {"n64": "Nintendo 64", "ps4": "PS4", "ps5": "PS5"}.get(platform, platform)
    rows, backend = search_ebay_es(f'"{title}" {platform_query} PAL España', catalog_region="PAL España", max_results=12)
    for row in rows:
        if not title_matches(row.get("title", ""), title):
            continue
        try:
            hydrated = hydrate_ebay_item(str(row["itemId"]))
        except RuntimeError:
            continue
        non_thumbnails = [image for image in hydrated.get("images") or [] if image.get("kind") != "THUMBNAIL"]
        if len(non_thumbnails) < 3:
            continue
        return {
            "caseId": f"{platform}-{normalized(title).replace(' ', '-')}", "platform": platform,
            "subjectTitle": title, "initialCatalogId": catalog_id, "targetRegion": "PAL España",
            "hydrated": hydrated, "discoveryBackend": backend, "holdout": None,
        }
    return None


def discover_cases(target_per_platform: int) -> list[dict[str, Any]]:
    by_id, _ = catalog_indexes()
    cases: list[dict[str, Any]] = []
    for platform, seeds in PLATFORM_SEEDS.items():
        selected = 0
        for title, catalog_id in seeds:
            catalog = by_id.get(catalog_id)
            if not catalog:
                continue
            case = discover_seed_case(platform, title, catalog_id)
            if case:
                case["targetRegion"] = catalog.get("region") or case["targetRegion"]
                cases.append(case)
                selected += 1
            if selected >= target_per_platform:
                break
    queue = read_json(ROOT / "data" / "ebay-regional-campaigns" / "review-queue.json")
    queue_rows = {row["id"]: row for row in queue["items"]}
    selected = 0
    for row_id in GAMEBOY_HOLDOUT_IDS:
        row = queue_rows.get(row_id)
        if not row:
            continue
        evidence = row.get("evidence") if isinstance(row.get("evidence"), dict) else {}
        item_id = str(evidence.get("externalId") or "")
        try:
            hydrated = hydrate_ebay_item(item_id)
        except RuntimeError:
            continue
        non_thumbnails = [image for image in hydrated.get("images") or [] if image.get("kind") != "THUMBNAIL"]
        if len(non_thumbnails) < 3:
            continue
        initial_id = evidence.get("searchedCatalogId") or row.get("catalogId")
        catalog = by_id.get(str(initial_id))
        cases.append({
            "caseId": f"gameboy-{row_id}", "platform": "gameboy",
            "subjectTitle": catalog.get("title") if catalog else row.get("listingTitle"),
            "initialCatalogId": initial_id, "targetRegion": catalog.get("region") if catalog else row.get("targetRegion"),
            "hydrated": hydrated, "discoveryBackend": "browse-item-holdout",
            "holdout": {"rowId": row_id, "expectedStatus": row.get("status"), "expectedDecision": row.get("decision")},
        })
        selected += 1
        if selected >= target_per_platform:
            break
    return cases


def estimate_usage_cost(usage: dict[str, Any]) -> float:
    prompt = int(usage.get("prompt_tokens") or 0)
    completion = int(usage.get("completion_tokens") or 0)
    input_per_m = float(os.environ.get("LISTING_EVIDENCE_INPUT_USD_PER_M", "0.15"))
    output_per_m = float(os.environ.get("LISTING_EVIDENCE_OUTPUT_USD_PER_M", "0.60"))
    return prompt * input_per_m / 1_000_000 + completion * output_per_m / 1_000_000


def classify_case(snapshot: dict[str, Any], *, title: str, platform: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], float, int]:
    classifications: list[dict[str, Any]] = []
    usage_rows: list[dict[str, Any]] = []
    calls = 0
    images = snapshot["images"]
    for start in range(0, len(images), 8):
        chunk = images[start:start + 8]
        results, usage = openai_triage_batch(chunk, title=title, platform=platform)
        usage_rows.append(usage)
        calls += 1
        for result in results:
            position = int(result.get("imageIndex") or 0) - 1
            if position < 0 or position >= len(chunk):
                continue
            image = chunk[position]
            subject = str(result.get("subject") or "UNKNOWN").upper()
            component = str(result.get("component") or "UNKNOWN_COMPONENT").upper()
            classifications.append({
                "listingId": snapshot["listingId"], "imageIndex": image["imageIndex"], "contentHash": image["contentHash"],
                "subject": subject if subject == ACCEPTED_SUBJECT or subject in IRRELEVANT else "UNKNOWN",
                "component": component if component in COMPONENTS else "UNKNOWN_COMPONENT",
                "confidence": max(0.0, min(1.0, float(result.get("confidence") or 0))), "reason": str(result.get("reason") or ""),
            })
    cost = sum(estimate_usage_cost(row) for row in usage_rows)
    return classifications, usage_rows, cost, calls


def extract_case(snapshot: dict[str, Any], classifications: list[dict[str, Any]], *, title: str, platform: str, indexes: list[int]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], float, int]:
    by_index = {int(row["imageIndex"]): row for row in classifications}
    images = [row for row in snapshot["images"] if int(row["imageIndex"]) in indexes]
    observations: list[dict[str, Any]] = []
    usage_rows: list[dict[str, Any]] = []
    calls = 0
    for start in range(0, len(images), 6):
        chunk = images[start:start + 6]
        components = {int(row["imageIndex"]): by_index[int(row["imageIndex"])]["component"] for row in chunk}
        results, usage = openai_extract_batch(chunk, components=components, title=title, platform=platform)
        usage_rows.append(usage)
        calls += 1
        for result in results:
            position = int(result.get("imageIndex") or 0) - 1
            if position < 0 or position >= len(chunk):
                continue
            image = chunk[position]
            observation = bound_observation(snapshot, by_index[int(image["imageIndex"])], result)
            observations.append(observation)
    cost = sum(estimate_usage_cost(row) for row in usage_rows)
    return observations, usage_rows, cost, calls


def market_followup(snapshot: dict[str, Any], classifications: list[dict[str, Any]], observations: list[dict[str, Any]], *, title: str, platform: str) -> tuple[list[dict[str, Any]], dict[str, Any], float, int]:
    if detected_market(observations)[0]:
        return observations, {}, 0.0, 0
    preferred = {"OUTER_PACKAGE_BACK", "INNER_CASE_BACK", "OUTER_PACKAGE_SPINE", "INNER_CASE_SPINE", "CARTRIDGE_FRONT", "CARTRIDGE_BACK", "DISC"}
    selected = [row for row in classifications if row.get("subject") == ACCEPTED_SUBJECT and row.get("component") in preferred][:4]
    if not selected:
        return observations, {}, 0.0, 0
    selected_indexes = {int(row["imageIndex"]) for row in selected}
    images = [row for row in snapshot["images"] if int(row["imageIndex"]) in selected_indexes]
    by_index = {int(row["imageIndex"]): row for row in selected}
    components = {index: row["component"] for index, row in by_index.items()}
    try:
        results, usage = openai_market_extract_batch(images, components=components, title=title, platform=platform)
    except AiBalanceExhausted:
        raise
    except Exception as exc:
        # A narrow optional second reading must never turn a fully acquired
        # atomic case into a technical failure. The unresolved market gap stays
        # explicit and the main observations remain usable.
        return observations, {"status": "FOLLOWUP_UNAVAILABLE", "errorType": type(exc).__name__}, 0.0, 0
    merged = {int(row["imageIndex"]): row for row in observations}
    for result in results:
        position = int(result.get("imageIndex") or 0) - 1
        if position < 0 or position >= len(images):
            continue
        image = images[position]
        index = int(image["imageIndex"])
        followup = bound_observation(snapshot, by_index[index], result)
        current = merged.get(index)
        if current:
            for key in ("productCodes", "serials", "barcodes", "distributors", "publisherLegalText", "languages", "visibleText"):
                current[key] = list(dict.fromkeys([*(current.get(key) or []), *(followup.get(key) or [])]))
            current["confidence"] = max(float(current.get("confidence") or 0), float(followup.get("confidence") or 0))
        else:
            merged[index] = followup
    return [merged[index] for index in sorted(merged)], usage, estimate_usage_cost(usage), 1


def detected_market(observations: list[dict[str, Any]]) -> tuple[str | None, list[str]]:
    code_text = " ".join(value for row in observations for value in [*(row.get("productCodes") or []), *(row.get("serials") or [])]).upper()
    legal_text = " ".join(value for row in observations for value in [*(row.get("distributors") or []), *(row.get("publisherLegalText") or []), *(row.get("visibleText") or [])])
    legal = normalized(legal_text)
    mappings = [
        (r"(?:^|[^A-Z0-9])ESP(?:[^A-Z0-9]|$)", "PAL España"), (r"(?:^|[^A-Z0-9])UKV(?:[^A-Z0-9]|$)", "PAL UK/ENG"),
        (r"(?:^|[^A-Z0-9])(?:ITA|NOI)(?:[^A-Z0-9]|$)", "PAL Italia"), (r"(?:^|[^A-Z0-9])NOE(?:[^A-Z0-9]|$)", "PAL Alemania"),
        (r"(?:^|[^A-Z0-9])USA(?:[^A-Z0-9]|$)", "USA"), (r"(?:^|[^A-Z0-9])EUR(?:[^A-Z0-9]|$)", "PAL Europa"),
    ]
    for pattern, region in mappings:
        if re.search(pattern, code_text):
            return region, ["sku_regional"]
    if re.search(r"\b(espana|spain|distribuido en espana|distribucion espana)\b", legal):
        return "PAL España", ["distributor_regional"]
    if re.search(r"\b(italia|italy)\b", legal):
        return "PAL Italia", ["distributor_regional"]
    if re.search(r"\b(deutschland|germany)\b", legal):
        return "PAL Alemania", ["distributor_regional"]
    if re.search(r"\b(united kingdom|uk)\b", legal):
        return "PAL UK/ENG", ["distributor_regional"]
    return None, []


def infer_condition(platform: str, classifications: list[dict[str, Any]], observations: list[dict[str, Any]]) -> tuple[str, list[str], bool | None]:
    components = {row["component"] for row in classifications if row.get("subject") == ACCEPTED_SUBJECT and float(row.get("confidence") or 0) >= 0.65}
    if any(row.get("sealEvidence") == "FACTORY_SEAL" for row in observations):
        return "sealed", ["factory seal visible on listing-specific image"], False if platform in {"ps4", "ps5"} else None
    media = bool(components & {"DISC", "CARTRIDGE_FRONT", "CARTRIDGE_BACK"})
    package = bool(components & {"OUTER_PACKAGE_FRONT", "OUTER_PACKAGE_BACK", "INNER_CASE_FRONT", "INNER_CASE_BACK"})
    manual = bool(components & {"MANUAL_FRONT", "MANUAL_BACK"})
    if media and not package:
        return "loose", ["media visible without retail package"], None
    if media and manual and not package:
        return "game_manual", ["media and manual visible without retail package"], True
    if media and package and (platform in {"ps4", "ps5"} or manual):
        return "complete", ["required visible media and package components present"], platform not in {"ps4", "ps5"}
    return "unknown", [], False if platform in {"ps4", "ps5"} else None


def build_review_item(case: dict[str, Any], snapshot: dict[str, Any], classifications: list[dict[str, Any]], observations: list[dict[str, Any]], by_id: dict[str, dict[str, Any]], by_title: dict[tuple[str, str], list[dict[str, Any]]]) -> dict[str, Any]:
    platform = case["platform"]
    subject_title = case["subjectTitle"]
    initial_id = case.get("initialCatalogId")
    initial = by_id.get(str(initial_id)) if initial_id else None
    alternatives = list(by_title.get((platform, normalized(subject_title)), []))
    seen_alternatives = {row["id"] for row in alternatives}
    for row in by_id.values():
        if row.get("platformSlug") != platform or row["id"] in seen_alternatives:
            continue
        if title_matches(str(row.get("title") or ""), subject_title) and title_matches(subject_title, str(row.get("title") or "")):
            alternatives.append(row)
            seen_alternatives.add(row["id"])
    market, region_evidence = detected_market(observations)
    condition, condition_evidence, manual_expected = infer_condition(platform, classifications, observations)
    visible_titles = [row.get("title") for row in observations if row.get("title")]
    identity = any(title_matches(str(value), subject_title) for value in visible_titles)
    accepted = [row for row in classifications if row["subject"] == ACCEPTED_SUBJECT]
    rejected = [row for row in classifications if row["subject"] in IRRELEVANT]
    if not accepted and rejected:
        identity_value: bool | None = False
    else:
        identity_value = True if identity else None
    item_id = f"listing-evidence-v2-{normalized(case['caseId']).replace(' ', '-')[:80]}"
    item = {
        "id": item_id, "status": "pending", "source": "ebay-es", "platformSlug": platform,
        "targetRegion": case.get("targetRegion") or (initial or {}).get("region"), "detectedRegion": market,
        "catalogId": initial_id, "candidateCatalogId": initial_id,
        "listingTitle": snapshot["metadata"].get("title") or subject_title,
        "priceEur": (snapshot["metadata"].get("price") or {}).get("value"), "condition": condition,
        "reason": "listing_evidence_acquisition_v2", "updatedAt": snapshot["capturedAt"],
        "evidence": {
            "externalId": snapshot["listingId"], "url": snapshot["metadata"].get("itemWebUrl"),
            "description": snapshot["metadata"].get("shortDescription") or snapshot["metadata"].get("description"),
            "imageUrl": snapshot["images"][0]["resolvedUrl"] if snapshot["images"] else None,
            "imageUrls": [row["resolvedUrl"] for row in snapshot["images"]], "listingSnapshot": snapshot,
            "visualObservations": [{
                **row, "role": row["component"].lower(), "textSnippets": row.get("visibleText") or [],
            } for row in observations],
            "coverVision": {"isTargetGame": identity_value, "conditionConfidence": max([float(row.get("confidence") or 0) for row in observations] or [0]), "sellerClaims": condition_evidence},
            "regionEvidence": region_evidence, "searchedCatalogId": initial_id,
            "catalogTitle": subject_title,
            "matchAlternatives": [{"catalogId": row["id"], "region": row.get("region"), "title": row.get("title"), "edition": row.get("edition")} for row in alternatives],
            "manualExpected": manual_expected,
        },
    }
    return item


def process_case(case: dict[str, Any], *, output_dir: Path, cache_dir: Path, by_id: dict[str, dict[str, Any]], by_title: dict[tuple[str, str], list[dict[str, Any]]]) -> dict[str, Any]:
    case_dir = output_dir / "cases" / case["caseId"]
    snapshot = acquire_listing_snapshot(case["hydrated"], cache_dir=cache_dir / case["caseId"])
    write_json(case_dir / "listing-snapshot.json", snapshot)
    classifications, triage_usage, triage_cost, triage_calls = classify_case(snapshot, title=case["subjectTitle"], platform=case["platform"])
    coverage = listing_component_coverage(classifications)
    indexes = plan_high_detail_images(classifications, platform=case["platform"], evidence_gaps=["CANONICAL_IDENTITY", "MISSING_MARKET_PROOF", "MISSING_COMPONENT_PHOTO", "MISSING_COMPONENT_BINDING"], max_images=8)
    observations, extract_usage, extract_cost, extract_calls = extract_case(snapshot, classifications, title=case["subjectTitle"], platform=case["platform"], indexes=indexes)
    observations, market_usage, market_cost, market_calls = market_followup(snapshot, classifications, observations, title=case["subjectTitle"], platform=case["platform"])
    item = build_review_item(case, snapshot, classifications, observations, by_id, by_title)
    market_bound = bool(item["evidence"]["regionEvidence"])
    stage = diagnose_evidence_stage(snapshot, classifications, observations, market_bound=market_bound, resolved=False)
    result = {
        "caseId": case["caseId"], "platform": case["platform"], "subjectTitle": case["subjectTitle"],
        "sourcePhotos": snapshot["imagesAvailableFromSource"], "preservedPhotos": snapshot["imagesPreserved"],
        "originalResolutionPhotos": sum(1 for row in snapshot["images"] if (row.get("width") or 0) >= 800 or (row.get("height") or 0) >= 800),
        "photosClassified": len(classifications), "photosInspectedHighDetail": len(indexes),
        "coverage": coverage, "componentsFound": sorted(key for key, value in coverage["components"].items() if value),
        "componentsMissing": sorted(key for key, value in coverage["components"].items() if not value),
        "componentBoundObservations": len(observations), "marketBoundObservations": sum(1 for row in observations if row.get("distributors") or row.get("publisherLegalText") or row.get("productCodes")),
        "diagnosis": stage, "triageCalls": triage_calls, "extractCalls": extract_calls, "marketFollowupCalls": market_calls,
        "openAiCalls": triage_calls + extract_calls + market_calls, "openAiUsage": [*triage_usage, *extract_usage, *([market_usage] if market_usage else [])],
        "costUsd": triage_cost + extract_cost + market_cost, "item": item,
    }
    write_json(case_dir / "classifications.json", classifications)
    write_json(case_dir / "coverage.json", coverage)
    write_json(case_dir / "observations.json", observations)
    write_json(case_dir / "case-result.json", result)
    return result


def funnel_markdown(results: list[dict[str, Any]], *, selected: int, hydrated: int) -> str:
    total = lambda key: sum(int(row.get(key) or 0) for row in results)
    lines = [
        "# Listing image funnel", "",
        "The eBay HTML listing page is not used as the primary acquisition route. Exact items are hydrated with the official Browse API.", "",
        "## Global funnel", "",
        f"- listings selected: {selected}", f"- listings hydrated: {hydrated}",
        f"- listings with image URLs: {sum(1 for row in results if row['sourcePhotos'] > 0)}",
        f"- total gallery images: {total('sourcePhotos')}", f"- unique images preserved by content hash: {total('preservedPhotos')}",
        f"- original-resolution images: {total('originalResolutionPhotos')}", f"- subject/component classified: {total('photosClassified')}",
        f"- high-detail inspected: {total('photosInspectedHighDetail')}", f"- component-bound observations: {total('componentBoundObservations')}",
        f"- market-bound observations: {total('marketBoundObservations')}", "",
        "## Loss audit", "",
        "The previous funnel stored search-summary image URLs in the collector row, then the shared listing helper defaulted to three images. The review queue and PhysicalEvidenceBundle inherited only that truncated list and carried no content hash, dimensions, exact-item snapshot, or immutable listing/image/component binding.", "",
        "### Exact legacy trace: `v1|377370832247|0`", "",
        "This listing was followed through the committed PR #288 evidence. The exact-item API was re-read on 2026-09-16; the listing HTML was not used.", "",
        "| Stage | Image references | Unique physical photos | Resolution/provenance | What happened |",
        "|---|---:|---:|---|---|",
        "| eBay Browse `GET item/{item_id}` | 3 | 3 | All 1200×1600; official exact-item response | The complete API gallery was available. |",
        "| collector search row | 4 | 3 | One 1600 URL, three 225 URLs; same primary photo appears twice | Search-summary variants were stored without normalization or content hashes. |",
        "| ingest | not independently persisted | not independently auditable | No raw pre-queue snapshot exists | The boundary could not be reconstructed without assuming it matched the queue row. |",
        "| review queue | 4 | 3 | Same one 1600 + three 225 references | No additional loss in count, but two unique photos remained thumbnail-only. |",
        "| `PhysicalEvidenceBundleV1` | 4 | 3 | Width/height absent; all hashes `null`; components absent | Duplicate resolution variants were treated as separate images. |",
        "| Stage A | 4 carried, 0 used | 3 carried | `imagesUsed=[]`, `observations=[]` | The bundle was consulted as URL references, not component-bound physical evidence. |",
        "| Deep Curator | 4 carried, 0 inspected | 3 carried | Exact listing browser access returned HTTP 403 | It retried the listing page instead of hydrating the exact item through Browse API. |", "",
        "Exact API gallery URLs:", "",
        "- `https://i.ebayimg.com/images/g/IpQAAeSwqn9qjtNW/s-l1600.jpg`",
        "- `https://i.ebayimg.com/images/g/o5AAAeSw0DZqjtNW/s-l1600.jpg`",
        "- `https://i.ebayimg.com/images/g/kKMAAeSw0zlqjtNW/s-l1600.jpg`", "",
        "Legacy collector/queue URLs:", "",
        "- `https://i.ebayimg.com/images/g/IpQAAeSwqn9qjtNW/s-l225.jpg`",
        "- `https://i.ebayimg.com/images/g/IpQAAeSwqn9qjtNW/s-l1600.jpg`",
        "- `https://i.ebayimg.com/images/g/o5AAAeSw0DZqjtNW/s-l225.jpg`",
        "- `https://i.ebayimg.com/images/g/kKMAAeSw0zlqjtNW/s-l225.jpg`", "",
        "The measurable loss was therefore not simply “four became three”. It was loss of exact-item hydration, original resolution for two unique photos, deduplication, dimensions, content hashes, component labels, and actual high-detail inspection. V2 repairs those boundaries and makes the unpersisted legacy ingest boundary explicit instead of inventing evidence.", "",
        "V2 hydrates the exact item first, retains up to 24 API-returned gallery records, downloads them only into the ignored internal evidence cache, deduplicates by SHA-256, and passes listingId + imageIndex + contentHash + component into every observation. Images remain non-public evidence references.", "",
        "| Case | Platform | API photos | Preserved | Original | Classified | High detail | Bound observations | Diagnosis |",
        "|---|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in results:
        lines.append(f"| {row['caseId']} | {row['platform']} | {row['sourcePhotos']} | {row['preservedPhotos']} | {row['originalResolutionPhotos']} | {row['photosClassified']} | {row['photosInspectedHighDetail']} | {row['componentBoundObservations']} | {row['diagnosis']} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="artifacts/listing-evidence-acquisition-v2")
    parser.add_argument("--target-per-platform", type=int, default=5)
    parser.add_argument("--budget-usd", type=float, default=3.0)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    output_dir = ROOT / args.output_dir
    cache_dir = ROOT / "data" / "price-ingest" / "cache" / "listing-evidence-v2"
    by_id, by_title = catalog_indexes()
    cases = discover_cases(max(1, args.target_per_platform))
    write_json(output_dir / "selected-cases.json", [{key: value for key, value in row.items() if key not in {"hydrated", "holdout"}} for row in cases])
    holdout = {row["caseId"]: row["holdout"] for row in cases if row.get("holdout")}
    results: list[dict[str, Any]] = []
    total_cost = 0.0
    stopped_before: str | None = None
    for case in cases:
        # Budget is checked only between games. Once begun, the complete game's
        # acquisition -> triage -> extraction cycle remains atomic.
        if total_cost >= args.budget_usd:
            stopped_before = case["caseId"]
            break
        result_path = output_dir / "cases" / case["caseId"] / "case-result.json"
        if args.resume and result_path.exists():
            result = read_json(result_path)
        else:
            result = process_case(case, output_dir=output_dir, cache_dir=cache_dir, by_id=by_id, by_title=by_title)
        results.append(result)
        total_cost += float(result["costUsd"])
        write_json(output_dir / "progress.json", {"completed": len(results), "selected": len(cases), "costUsd": total_cost, "budgetUsd": args.budget_usd})
    write_json(output_dir / "pilot-input.json", {"schemaVersion": 1, "cases": [{"caseId": row["caseId"], "platform": row["platform"], "item": row["item"]} for row in results]})
    write_json(output_dir / "holdout-ground-truth.json", holdout)
    summary = {
        "schemaVersion": 1, "selected": len(cases), "completed": len(results), "stoppedBeforeCaseId": stopped_before,
        "budgetUsd": args.budget_usd, "costUsd": total_cost, "overrunUsd": max(0.0, total_cost - args.budget_usd),
        "openAiCalls": sum(row["openAiCalls"] for row in results), "catalogMutations": 0, "priceMutations": 0, "authoritativeQueueMutations": 0,
        "platforms": {platform: sum(1 for row in results if row["platform"] == platform) for platform in ("ps4", "n64", "ps5", "gameboy")},
    }
    write_json(output_dir / "acquisition-summary.json", summary)
    (output_dir / "listing-image-funnel.md").write_text(funnel_markdown(results, selected=len(cases), hydrated=len(cases)), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
