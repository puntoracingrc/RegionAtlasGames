#!/usr/bin/env python3
"""Prepara un plan no destructivo para migrar IDs/slugs codificados del catálogo."""

from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
PRICE_REVIEW_FILE = ROOT / "data" / "admin" / "price-review-queue.json"
OUTPUT_FILE = ROOT / "data" / "admin" / "catalog-entity-migration-plan.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def decode_repeated(value: str) -> str:
    current = value
    for _ in range(5):
        decoded = html.unescape(unquote(current))
        if decoded == current:
            break
        current = decoded
    return current


def slugify(value: str) -> str:
    value = decode_repeated(value)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "juego"


def candidate_new_id(game: dict[str, Any]) -> tuple[str, str]:
    platform = str(game.get("platformSlug") or "").strip()
    raw_slug = str(game.get("slug") or "")
    clean_slug = slugify(raw_slug)
    return clean_slug, f"{platform}-{clean_slug}" if platform else clean_slug


def target_matches(value: str, target: str) -> bool:
    if target == "percent27":
        return "%27" in value.lower()
    if target == "html_amp":
        return "&amp;" in value.lower()
    return "%" in value or "&" in value


def walk_references(value: Any, old_id: str, *, path: str = "") -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            refs.extend(walk_references(child, old_id, path=f"{path}.{key}" if path else str(key)))
        return refs
    if isinstance(value, list):
        for index, child in enumerate(value):
            refs.extend(walk_references(child, old_id, path=f"{path}[{index}]"))
        return refs
    if isinstance(value, str) and value == old_id:
        refs.append({"path": path, "value": value})
    return refs


def plan_item(
    game: dict[str, Any],
    *,
    catalog_ids: set[str],
    details: dict[str, Any],
    price_review: dict[str, Any],
) -> dict[str, Any]:
    old_id = str(game.get("id") or "")
    new_slug, new_id = candidate_new_id(game)
    old_slug = str(game.get("slug") or "")
    changes: list[dict[str, Any]] = []
    if old_id != new_id:
        changes.append({"file": "data/catalog.json", "path": f"game[{old_id}].id", "from": old_id, "to": new_id})
    if old_slug != new_slug:
        changes.append({"file": "data/catalog.json", "path": f"game[{old_id}].slug", "from": old_slug, "to": new_slug})
    for field in ("title", "titlePc", "pcPath"):
        raw = game.get(field)
        if isinstance(raw, str):
            decoded = decode_repeated(raw)
            if decoded != raw:
                changes.append({"file": "data/catalog.json", "path": f"game[{old_id}].{field}", "from": raw, "to": decoded})

    if old_id in details:
        changes.append({"file": "data/game-details.json", "path": f"$key.{old_id}", "from": old_id, "to": new_id})
    for ref in walk_references(price_review, old_id):
        changes.append({"file": "data/admin/price-review-queue.json", "path": ref["path"], "from": old_id, "to": new_id})

    conflict = new_id != old_id and new_id in catalog_ids
    return {
        "oldId": old_id,
        "newId": new_id,
        "oldSlug": old_slug,
        "newSlug": new_slug,
        "platformSlug": game.get("platformSlug"),
        "title": decode_repeated(str(game.get("title") or "")),
        "region": game.get("region"),
        "conflict": conflict,
        "safeToApply": bool(old_id and new_id and old_id != new_id and not conflict),
        "changeCount": len(changes),
        "changes": changes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=str(CATALOG_FILE))
    parser.add_argument("--details", default=str(DETAILS_FILE))
    parser.add_argument("--price-review", default=str(PRICE_REVIEW_FILE))
    parser.add_argument("--output", default=str(OUTPUT_FILE))
    parser.add_argument("--target", choices=["percent27", "html_amp", "all"], default="percent27")
    args = parser.parse_args()

    catalog = load_json(Path(args.catalog), [])
    details = load_json(Path(args.details), {})
    price_review = load_json(Path(args.price_review), {})
    catalog_ids = {str(game.get("id")) for game in catalog if isinstance(game, dict) and game.get("id")}

    items = [
        plan_item(game, catalog_ids=catalog_ids, details=details, price_review=price_review)
        for game in catalog
        if isinstance(game, dict) and target_matches(str(game.get("id") or "") + " " + str(game.get("slug") or ""), args.target)
    ]
    items.sort(key=lambda item: (not item["safeToApply"], item["platformSlug"] or "", item["oldId"]))

    summary = {
        "target": args.target,
        "totalItems": len(items),
        "safeToApply": sum(1 for item in items if item["safeToApply"]),
        "conflicts": sum(1 for item in items if item["conflict"]),
        "totalChanges": sum(int(item["changeCount"]) for item in items),
    }
    output = {
        "schemaVersion": 1,
        "generatedAt": now_iso(),
        "summary": summary,
        "items": items,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Plan escrito: {output_path}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
