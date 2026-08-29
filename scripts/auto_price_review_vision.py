#!/usr/bin/env python3
"""Analiza portadas de pendientes de precio desde el PC worker.

No aplica precios al catálogo: añade evidencia de IA a la cola de revisión para
que el admin pueda aceptar los seguros después.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from collectors.tcns_client import (
    TodoConsolasRequestError,
    fetch_category_page,
    tcns_category_paths_for_platform,
)

ROOT = Path(__file__).resolve().parents[1]
QUEUE_FILE = ROOT / "data" / "admin" / "price-review-queue.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalized(value: str | None) -> str:
    import unicodedata

    raw = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in raw if not unicodedata.combining(ch)).lower().strip()


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def item_matches(item: dict[str, Any], request: dict[str, Any]) -> bool:
    if item.get("status") != "pending":
        return False
    triage_filter = str(request.get("triageBucket") or "all").strip()
    triage_bucket = str(item.get("triageBucket") or "manual_match").strip()
    if triage_filter == "actionable" and triage_bucket not in {"manual_match", "missing_region"}:
        return False
    if triage_filter not in {"", "all", "actionable"} and triage_bucket != triage_filter:
        return False
    platform = str(request.get("platformSlug") or "").strip()
    if platform and platform != "all" and item.get("platformSlug") != platform:
        return False
    source = str(request.get("source") or "").strip()
    if source and source != "all" and item.get("source") != source:
        return False
    query = normalized(str(request.get("query") or ""))
    if not query:
        return True
    haystack = normalized(
        " ".join(
            str(item.get(key) or "")
            for key in ("listingTitle", "catalogId", "candidateCatalogId", "targetRegion", "detectedRegion", "reason", "source", "platformSlug")
        )
    )
    return query in haystack


def region_compatible(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return True
    if a == b:
        return True
    return {a, b} == {"PAL España", "PAL Europa"}


def map_region(value: Any) -> str | None:
    text = normalized(str(value or ""))
    if not text or text == "unknown":
        return None
    if "espana" in text or "spain" in text or "spanish" in text:
        return "PAL España"
    if "pal" in text or "euro" in text or "pegi" in text:
        return "PAL Europa"
    if "usa" in text or "esrb" in text or "ntsc u" in text:
        return "USA"
    if "japon" in text or "japan" in text or "ntsc j" in text:
        return "Japón"
    if "asia" in text:
        return "Asia"
    return None


def map_condition(value: Any) -> str | None:
    text = normalized(str(value or ""))
    if not text or text in {"unknown", "null", "none"}:
        return None
    if "sealed" in text or "precint" in text:
        return "sealed"
    if "manual" in text and "caja" not in text and "case" not in text:
        return "game_manual"
    if "complete" in text or "completo" in text or "case" in text or "caja" in text:
        return "complete"
    if "loose" in text or "suelto" in text or "cartucho" in text or "disco" in text:
        return "loose"
    return None


def useful_listing_page_url(page_url: str | None) -> bool:
    if not page_url or not re.match(r"^https?://", page_url, re.I):
        return False
    parsed = urllib.parse.urlparse(page_url)
    path = parsed.path.rstrip("/")
    return bool(path and path != "/")


def image_url_looks_useful(url: str) -> bool:
    text = normalized(url)
    if not re.match(r"^https?://", url, re.I):
        return False
    if re.search(r"\.(svg|ico)(\?|$)", url, re.I):
        return False
    return not any(part in text for part in ("logo", "sprite", "placeholder", "favicon", "payment", "banner", "icon"))


def absolute_image_url(raw_url: str, page_url: str) -> str | None:
    clean = html.unescape((raw_url or "").strip())
    if not clean or clean.startswith("data:"):
        return None
    first = clean.split(",")[0].strip().split()[0]
    try:
        return urllib.parse.urljoin(page_url, first)
    except Exception:
        return None


def push_image(out: list[str], raw_url: str | None, page_url: str) -> None:
    if not raw_url:
        return
    image_url = absolute_image_url(raw_url, page_url)
    if image_url and image_url_looks_useful(image_url) and image_url not in out:
        out.append(image_url)


def extract_images_from_html(text: str, page_url: str) -> list[str]:
    out: list[str] = []
    for match in re.finditer(r"<meta[^>]+(?:property|name)\s*=\s*[\"'](?:og:image|twitter:image|image)[\"'][^>]+content\s*=\s*[\"']([^\"']+)[\"'][^>]*>", text, re.I):
        push_image(out, match.group(1), page_url)
    for match in re.finditer(r'"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")', text, re.I):
        push_image(out, match.group(1) or match.group(2), page_url)
    for match in re.finditer(r"<img\b[^>]+>", text, re.I):
        tag = match.group(0)
        attr = re.search(r"\b(?:src|data-src|data-lazy-src|data-full-size-image-url|srcset)\s*=\s*[\"']([^\"']+)[\"']", tag, re.I)
        if attr:
            push_image(out, attr.group(1), page_url)
        if len(out) >= 3:
            break
    return out[:2]


def fetch_listing_images(item: dict[str, Any]) -> list[str]:
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    urls = []
    image_url = str(evidence.get("imageUrl") or "").strip()
    if image_url:
        urls.append(image_url)
    image_urls = evidence.get("imageUrls")
    if isinstance(image_urls, list):
        urls.extend(str(url).strip() for url in image_urls if str(url).strip())
    clean_urls = [url for url in dict.fromkeys(urls) if image_url_looks_useful(url)]
    if clean_urls:
        return clean_urls[:2]

    page_url = str(evidence.get("url") or "").strip()
    if not useful_listing_page_url(page_url):
        return []
    try:
        req = urllib.request.Request(page_url, headers={"User-Agent": "RegionAtlasGamesBot/1.0 (+https://www.regionatlas.games)"})
        with urllib.request.urlopen(req, timeout=10) as response:
            text = response.read(500_000).decode("utf-8", errors="ignore")
    except Exception:
        return []
    return extract_images_from_html(text, page_url)


def item_image_urls(item: dict[str, Any]) -> list[str]:
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    urls = [str(evidence.get("imageUrl") or "").strip()]
    if isinstance(evidence.get("imageUrls"), list):
        urls.extend(str(url).strip() for url in evidence["imageUrls"] if str(url).strip())
    return [url for url in dict.fromkeys(urls) if image_url_looks_useful(url)][:2]


def store_item_images(item: dict[str, Any], images: list[str], source: str) -> bool:
    clean = [url for url in dict.fromkeys(images) if image_url_looks_useful(url)][:2]
    if not clean:
        return False
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    before = (evidence.get("imageUrl"), tuple(evidence.get("imageUrls") or []))
    evidence["imageUrl"] = clean[0]
    evidence["imageUrls"] = clean
    evidence["imageCapturedAt"] = now_iso()
    evidence["imageSource"] = source
    item["evidence"] = evidence
    item["updatedAt"] = now_iso()
    return before != (evidence["imageUrl"], tuple(clean))


def canonical_product_url(value: str | None) -> str:
    clean = str(value or "").strip()
    if not clean:
        return ""
    parsed = urllib.parse.urlsplit(clean)
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), "", ""))


def capture_todoconsolas_category_images(
    items: list[dict[str, Any]],
    *,
    delay_seconds: float,
    fetch_page: Callable[[str, int], tuple[list[dict[str, Any]], int]] = fetch_category_page,
    on_progress: Callable[[dict[str, int]], None] | None = None,
) -> dict[str, int]:
    stats = {"pagesFetched": 0, "captured": 0, "remaining": 0, "errors": 0}
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for item in items:
        if item_image_urls(item):
            continue
        evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
        product_url = canonical_product_url(str(evidence.get("url") or ""))
        platform = str(item.get("platformSlug") or "").strip()
        if product_url and platform:
            grouped.setdefault(platform, {}).setdefault(product_url, []).append(item)

    for platform, targets in sorted(grouped.items()):
        for category_path in tcns_category_paths_for_platform(platform):
            page = 1
            last_page = 1
            while page <= last_page and targets:
                try:
                    products, last_page = fetch_page(category_path, page)
                except TodoConsolasRequestError:
                    stats["errors"] += 1
                    break
                stats["pagesFetched"] += 1
                for product in products:
                    product_url = canonical_product_url(str(product.get("productUrl") or ""))
                    image_url = str(product.get("imageUrl") or "").strip()
                    matched_items = targets.pop(product_url, [])
                    for item in matched_items:
                        if store_item_images(item, [image_url], "todoconsolas_category"):
                            stats["captured"] += 1
                if on_progress:
                    on_progress(stats)
                page += 1
                if page <= last_page and targets:
                    time.sleep(delay_seconds)
        stats["remaining"] += sum(len(matches) for matches in targets.values())
    return stats


def run_capture_only(
    matches: list[dict[str, Any]],
    request: dict[str, Any],
    queue: dict[str, Any],
    queue_path: Path,
    status_path: Path,
    started: str,
) -> int:
    limit = max(1, min(2_000, int(request.get("mediaLimit") or 1_000)))
    delay_seconds = max(2.0, min(30.0, float(request.get("captureDelaySeconds") or 8.0)))
    selected = matches[:limit]
    stats = {
        "matched": len(matches),
        "selected": len(selected),
        "existing": sum(1 for item in selected if item_image_urls(item)),
        "captured": 0,
        "pagesFetched": 0,
        "noImage": 0,
        "errors": 0,
    }

    def progress(batch_stats: dict[str, int]) -> None:
        stats["captured"] = batch_stats["captured"]
        stats["pagesFetched"] = batch_stats["pagesFetched"]
        stats["errors"] = batch_stats["errors"]
        queue["updatedAt"] = now_iso()
        write_json(queue_path, queue)
        write_json(status_path, {"status": "running", "mode": "capture_only", "startedAt": started, "updatedAt": now_iso(), "stats": stats})

    tcns_items = [item for item in selected if str(item.get("source") or "").lower() == "todoconsolas"]
    tcns_stats = capture_todoconsolas_category_images(
        tcns_items,
        delay_seconds=delay_seconds,
        on_progress=progress,
    )
    stats["captured"] = tcns_stats["captured"]
    stats["pagesFetched"] = tcns_stats["pagesFetched"]
    stats["errors"] = tcns_stats["errors"]

    for item in selected:
        if item_image_urls(item) or str(item.get("source") or "").lower() == "todoconsolas":
            continue
        images = fetch_listing_images(item)
        if images and store_item_images(item, images, "listing_page"):
            stats["captured"] += 1
            queue["updatedAt"] = now_iso()
            write_json(queue_path, queue)
            time.sleep(2.0)

    stats["noImage"] = sum(1 for item in selected if not item_image_urls(item))
    queue["updatedAt"] = now_iso()
    write_json(queue_path, queue)
    write_json(status_path, {"status": "done", "mode": "capture_only", "startedAt": started, "finishedAt": now_iso(), "stats": stats})
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return 0


def openai_vision(item: dict[str, Any], images: list[str]) -> dict[str, Any] | None:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    prompt = (
        "Analiza la portada/foto de un videojuego físico para revisar precio en Region Atlas. "
        "Mira señales visibles: PEGI, ESRB, NTSC, textos en español, japonés, caja, manual o disco/cartucho. "
        "Responde SOLO JSON válido con estas claves: "
        '{"isTargetGame":boolean,"listingRegion":"PAL Europa|PAL España|USA|Japón|Asia|unknown",'
        '"condition":"loose|game_manual|complete|sealed|null","confidence":0-1,'
        '"evidence":["cover_pal_eu"|"cover_spain"|"cover_usa"|"cover_japan"|"photo_region_mark"],"reason":"texto breve"}. '
        f"Título anuncio: {item.get('listingTitle')}. Plataforma: {item.get('platformSlug')}. "
        "PEGI indica PAL Europa; ESRB/NTSC-U indica USA; CERO/JPN o japonés indica Japón."
    )
    content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    content.extend({"type": "input_image", "image_url": url} for url in images[:2])
    payload = {
        "model": os.environ.get("OPENAI_VISION_MODEL", "gpt-4o-mini"),
        "input": [{"role": "user", "content": content}],
        "max_output_tokens": 450,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(f"OpenAI HTTP {exc.code}: {exc.read().decode('utf-8', errors='ignore')[:500]}")
        return None
    except Exception as exc:
        print(f"OpenAI error: {exc}")
        return None
    text = data.get("output_text") or ""
    if not text:
        parts = []
        for entry in data.get("output") or []:
            for content_item in entry.get("content") or []:
                parts.append(content_item.get("text") or "")
        text = "\n".join(parts)
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def apply_vision_to_item(item: dict[str, Any], vision: dict[str, Any], images: list[str], request: dict[str, Any]) -> str:
    evidence = item.setdefault("evidence", {})
    if not isinstance(evidence, dict):
        evidence = {}
        item["evidence"] = evidence
    region = map_region(vision.get("listingRegion"))
    condition = map_condition(vision.get("condition"))
    confidence = max(0.0, min(1.0, float(vision.get("confidence") or 0)))
    reason = str(vision.get("reason") or "")[:240]
    assumed_region = str(request.get("assumedRegion") or "").strip() or None
    assumed_condition = str(request.get("assumedCondition") or "").strip()
    if assumed_condition == "none":
        assumed_condition = ""

    evidence["coverVision"] = {
        "reviewedAt": now_iso(),
        "isTargetGame": vision.get("isTargetGame") is True,
        "region": region,
        "condition": condition,
        "confidence": confidence,
        "images": images[:2],
        "reason": reason,
    }
    notes = [str(note) for note in evidence.get("reviewNotes") or [] if str(note).strip()]

    if vision.get("isTargetGame") is not True or confidence < 0.65:
        notes.append(f"IA portada PC: no concluyente ({reason or 'sin detalle'}).")
        evidence["reviewNotes"] = notes[-12:]
        return "unclear"

    if region and assumed_region and not region_compatible(region, assumed_region):
        notes.append(f"IA portada PC: región incompatible {region}.")
        evidence["reviewNotes"] = notes[-12:]
        return "conflict"

    if region:
        item["detectedRegion"] = assumed_region if assumed_region and region_compatible(region, assumed_region) else region
        region_evidence = [str(value) for value in evidence.get("regionEvidence") or [] if str(value).strip()]
        region_evidence.append("cover_vision_pc")
        evidence["regionEvidence"] = list(dict.fromkeys(region_evidence))
        evidence["aiConfidence"] = max(float(evidence.get("aiConfidence") or 0), confidence)
    if condition and (not item.get("condition") or item.get("condition") == "unknown"):
        item["condition"] = assumed_condition or condition
    elif assumed_condition and item.get("condition") in (None, "", "unknown"):
        item["condition"] = assumed_condition

    notes.append(f"IA portada PC: {region or 'sin región'} · {condition or 'sin estado'} · {reason}")
    evidence["reviewNotes"] = notes[-12:]
    item["updatedAt"] = now_iso()
    return "updated"


def run(request_path: Path, queue_path: Path, status_path: Path) -> int:
    request = load_json(request_path, {})
    queue = load_json(queue_path, {"schemaVersion": 1, "updatedAt": now_iso(), "items": [], "decisions": []})
    items = [item for item in queue.get("items") or [] if isinstance(item, dict)]
    matches = [item for item in items if item_matches(item, request)]
    limit = max(1, min(200, int(request.get("visionLimit") or 25)))
    stats = {"matched": len(matches), "attempted": 0, "updated": 0, "noImage": 0, "noAi": 0, "conflict": 0, "unclear": 0}
    started = now_iso()
    write_json(status_path, {"status": "running", "startedAt": started, "stats": stats})

    if request.get("captureOnly") is True:
        return run_capture_only(matches, request, queue, queue_path, status_path, started)

    if not os.environ.get("OPENAI_API_KEY", "").strip():
        stats["noAi"] = len(matches)
        write_json(status_path, {"status": "error", "startedAt": started, "finishedAt": now_iso(), "error": "OPENAI_API_KEY no configurada en el PC worker.", "stats": stats})
        return 2

    for item in matches:
        if stats["attempted"] >= limit:
            break
        images = fetch_listing_images(item)
        if not images:
            stats["noImage"] += 1
            continue
        store_item_images(item, images, "listing_page")
        stats["attempted"] += 1
        vision = openai_vision(item, images)
        if not vision:
            stats["unclear"] += 1
            continue
        outcome = apply_vision_to_item(item, vision, images, request)
        if outcome == "updated":
            stats["updated"] += 1
        elif outcome == "conflict":
            stats["conflict"] += 1
        else:
            stats["unclear"] += 1
        queue["updatedAt"] = now_iso()
        write_json(queue_path, queue)
        write_json(status_path, {"status": "running", "startedAt": started, "updatedAt": now_iso(), "stats": stats})
        time.sleep(0.2)

    queue["updatedAt"] = now_iso()
    write_json(queue_path, queue)
    write_json(status_path, {"status": "done", "startedAt": started, "finishedAt": now_iso(), "stats": stats})
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--queue", default=str(QUEUE_FILE))
    parser.add_argument("--status-file", required=True)
    args = parser.parse_args()
    return run(Path(args.request), Path(args.queue), Path(args.status_file))


if __name__ == "__main__":
    raise SystemExit(main())
