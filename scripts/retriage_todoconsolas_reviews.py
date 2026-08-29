#!/usr/bin/env python3
"""Prepara precios TodoConsolas exactos y una cola de revisión agrupada.

No consulta la web ni escribe en remoto. Los resultados se guardan en el
directorio indicado para poder validarlos antes de sincronizar por Git.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.tcns_review_triage import (  # noqa: E402
    TRIAGE_BUCKETS,
    TcnsTriageDecision,
    approved_tcns_ingest_row,
    build_tcns_triage_index,
    queue_item_as_product,
    triage_tcns_product,
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def review_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("regionalCandidates") or []
    return [row for row in rows if isinstance(row, dict)]


def prepare_payloads(input_paths: list[Path], output_dir: Path) -> dict[str, Any]:
    catalog = load_json(ROOT / "data" / "catalog.json")
    details = load_json(ROOT / "data" / "game-details.json")
    index = build_tcns_triage_index(catalog, details)
    decisions: list[dict[str, Any]] = []
    approved_by_platform: dict[str, dict[str, dict[str, Any]]] = {}
    counts: Counter[str] = Counter()
    collected_at = now_iso()

    for input_path in input_paths:
        payload = load_json(input_path)
        platform_slug = str(payload.get("platformSlug") or "").strip()
        if not platform_slug:
            raise SystemExit(f"Falta platformSlug en {input_path}")
        payload_collected_at = str(payload.get("collectedAt") or collected_at)
        for product in review_rows(payload):
            decision = triage_tcns_product(product, platform_slug, index)
            counts[decision.bucket] += 1
            record = {
                "platformSlug": platform_slug,
                "productUrl": product.get("productUrl") or product.get("listingUrl"),
                "listingTitle": product.get("title"),
                "priceEur": product.get("priceEur"),
                "triageBucket": decision.bucket,
                "triageReason": decision.policy_reason,
                "triageCatalogId": decision.catalog_id,
                "triageMatchMethod": decision.match_method,
                "triageMatchedReference": decision.matched_reference,
            }
            decisions.append(record)
            if decision.bucket != "safe_exact" or not decision.catalog_id:
                continue
            row = approved_tcns_ingest_row(product, decision, index, payload_collected_at)
            platform_rows = approved_by_platform.setdefault(platform_slug, {})
            previous = platform_rows.get(decision.catalog_id)
            if previous is None or float(row["retailPriceEur"]) < float(previous["retailPriceEur"]):
                platform_rows[decision.catalog_id] = row

    platform_summary: dict[str, Any] = {}
    for platform_slug, rows_by_id in sorted(approved_by_platform.items()):
        rows = sorted(rows_by_id.values(), key=lambda row: str(row["catalogId"]))
        ingest = {
            "schemaVersion": 1,
            "platformSlug": platform_slug,
            "collectedAt": collected_at,
            "source": "todoconsolas",
            "searchMode": "exact_review_retriage",
            "listings": [],
            "regionalCandidates": [],
            "cex": [],
            "jgo": [],
            "chollo": [],
            "kaoto": [],
            "tcns": rows,
            "tc": [],
            "sourceStats": {"todoconsolas": {"auto_approved": len(rows), "manual_review": 0}},
        }
        save_json(output_dir / f"tcns-triage-{platform_slug}-ingest.json", ingest)
        save_json(output_dir / f"tcns-triage-{platform_slug}-catalog-ids.json", sorted(rows_by_id))
        platform_summary[platform_slug] = {"exactListings": len(rows), "catalogIds": len(rows_by_id)}

    summary = {
        "generatedAt": collected_at,
        "inputs": [str(path) for path in input_paths],
        "reviewListings": len(decisions),
        "counts": dict(sorted(counts.items())),
        "platforms": platform_summary,
    }
    save_json(output_dir / "tcns-triage-decisions.json", decisions)
    save_json(output_dir / "tcns-triage-summary.json", summary)
    return summary


def triage_queue(
    queue_path: Path,
    output_path: Path,
    output_dir: Path,
    *,
    resolve_safe: bool,
) -> dict[str, Any]:
    catalog = load_json(ROOT / "data" / "catalog.json")
    details = load_json(ROOT / "data" / "game-details.json")
    index = build_tcns_triage_index(catalog, details)
    queue = load_json(queue_path)
    now = now_iso()
    counts: Counter[str] = Counter()
    resolved = 0
    decisions_to_add: list[dict[str, Any]] = []
    approved_by_platform: dict[str, dict[str, dict[str, Any]]] = {}

    items = queue.get("items") if isinstance(queue, dict) else None
    if not isinstance(items, list):
        raise SystemExit("La cola no contiene items válidos")

    classified: dict[int, TcnsTriageDecision] = {}
    selected_prices: dict[tuple[str, str], float] = {}
    for index_number, raw_item in enumerate(items):
        if not isinstance(raw_item, dict):
            continue
        if raw_item.get("status") != "pending" or str(raw_item.get("source") or "").lower() != "todoconsolas":
            continue
        platform_slug = str(raw_item.get("platformSlug") or "").strip()
        stored_bucket = str(raw_item.get("triageBucket") or "")
        if resolve_safe and stored_bucket in TRIAGE_BUCKETS:
            decision = TcnsTriageDecision(
                stored_bucket,
                str(raw_item.get("triageReason") or raw_item.get("reason") or "manual_review"),
                catalog_id=str(raw_item.get("triageCatalogId") or "").strip() or None,
                match_method=str(raw_item.get("triageMatchMethod") or "").strip() or None,
                matched_reference=str(raw_item.get("triageMatchedReference") or "").strip() or None,
                match_score=1.0 if stored_bucket == "safe_exact" else None,
                match_margin=1.0 if stored_bucket == "safe_exact" else None,
            )
        else:
            decision = triage_tcns_product(queue_item_as_product(raw_item), platform_slug, index)
        classified[index_number] = decision
        if decision.bucket == "safe_exact" and decision.catalog_id:
            key = (platform_slug, decision.catalog_id)
            price = float(raw_item.get("priceEur"))
            selected_prices[key] = min(price, selected_prices.get(key, price))

    next_items: list[Any] = []
    accepted_safe = 0
    superseded = 0
    for index_number, raw_item in enumerate(items):
        if not isinstance(raw_item, dict):
            next_items.append(raw_item)
            continue
        item = dict(raw_item)
        if item.get("status") != "pending" or str(item.get("source") or "").lower() != "todoconsolas":
            next_items.append(item)
            continue
        platform_slug = str(item.get("platformSlug") or "").strip()
        decision = classified[index_number]
        item["triageBucket"] = decision.bucket
        item["triageReason"] = decision.policy_reason
        item["triageCatalogId"] = decision.catalog_id
        item["triageMatchMethod"] = decision.match_method
        item["triageMatchedReference"] = decision.matched_reference
        counts[decision.bucket] += 1
        if decision.bucket == "safe_exact" and decision.catalog_id and not resolve_safe:
            row = approved_tcns_ingest_row(
                queue_item_as_product(item),
                decision,
                index,
                str(item.get("collectedAt") or now),
            )
            platform_rows = approved_by_platform.setdefault(platform_slug, {})
            previous = platform_rows.get(decision.catalog_id)
            if previous is None or float(row["retailPriceEur"]) < float(previous["retailPriceEur"]):
                platform_rows[decision.catalog_id] = row
        if resolve_safe and decision.bucket == "safe_exact" and decision.catalog_id:
            selected_price = selected_prices[(platform_slug, decision.catalog_id)]
            is_selected = abs(float(item.get("priceEur")) - selected_price) < 0.001
            note = (
                "Auto-resuelto por título/EAN, plataforma y región exactos; precio publicado por Git."
                if is_selected
                else "Oferta exacta duplicada; se conservó para la ficha la oferta válida de menor precio."
            )
            action = "accept" if is_selected else "reject"
            item.update(
                {
                    "status": "accepted" if is_selected else "rejected",
                    "catalogId": decision.catalog_id,
                    "candidateCatalogId": decision.catalog_id,
                    "triageBucket": "resolved_exact" if is_selected else "resolved_duplicate",
                    "decidedAt": now,
                    "updatedAt": now,
                    "decision": {
                        "action": action,
                        "catalogId": decision.catalog_id,
                        "region": item.get("detectedRegion") or item.get("targetRegion"),
                        "condition": "preowned",
                        "note": note,
                    },
                }
            )
            decisions_to_add.append({"id": item.get("id"), "at": now, **item["decision"]})
            resolved += 1
            if is_selected:
                accepted_safe += 1
            else:
                superseded += 1
        next_items.append(item)

    queue["items"] = next_items
    queue["updatedAt"] = now
    if decisions_to_add:
        existing = queue.get("decisions") if isinstance(queue.get("decisions"), list) else []
        queue["decisions"] = [*decisions_to_add, *existing][:5000]
    save_json(output_path, queue)
    safe_catalog_ids: dict[str, int] = {}
    for platform_slug, rows_by_id in sorted(approved_by_platform.items()):
        rows = sorted(rows_by_id.values(), key=lambda row: str(row["catalogId"]))
        ingest = {
            "schemaVersion": 1,
            "platformSlug": platform_slug,
            "collectedAt": now,
            "source": "todoconsolas",
            "searchMode": "exact_queue_retriage",
            "listings": [],
            "regionalCandidates": [],
            "cex": [],
            "jgo": [],
            "chollo": [],
            "kaoto": [],
            "tcns": rows,
            "tc": [],
            "sourceStats": {"todoconsolas": {"auto_approved": len(rows), "manual_review": 0}},
        }
        save_json(output_dir / f"tcns-queue-safe-{platform_slug}-ingest.json", ingest)
        save_json(output_dir / f"tcns-queue-safe-{platform_slug}-catalog-ids.json", sorted(rows_by_id))
        safe_catalog_ids[platform_slug] = len(rows_by_id)
    if resolve_safe:
        safe_catalog_counts = Counter(platform_slug for platform_slug, _catalog_id in selected_prices)
        safe_catalog_ids = dict(sorted(safe_catalog_counts.items()))
    return {
        "counts": dict(sorted(counts.items())),
        "safeCatalogIds": safe_catalog_ids,
        "resolved": resolved,
        "acceptedSafe": accepted_safe,
        "supersededDuplicates": superseded,
        "items": len(next_items),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Agrupa revisiones TodoConsolas y prepara matches exactos")
    parser.add_argument("--input", type=Path, action="append", default=[], help="Payload de ingest; se puede repetir")
    parser.add_argument("--output-dir", type=Path, default=Path("/tmp/region-atlas-tcns-triage"))
    parser.add_argument("--queue-input", type=Path)
    parser.add_argument("--queue-output", type=Path)
    parser.add_argument("--resolve-safe", action="store_true", help="Marcar exactos aceptados en la copia de cola")
    args = parser.parse_args()

    if not args.input and not args.queue_input:
        raise SystemExit("Indica al menos --input o --queue-input")
    if args.input:
        summary = prepare_payloads(args.input, args.output_dir)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.queue_input:
        if not args.queue_output:
            raise SystemExit("--queue-input exige --queue-output")
        summary = triage_queue(
            args.queue_input,
            args.queue_output,
            args.output_dir,
            resolve_safe=args.resolve_safe,
        )
        print(json.dumps({"queue": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
