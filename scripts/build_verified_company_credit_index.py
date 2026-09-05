#!/usr/bin/env python3
"""Build the compact runtime index for company credits with complete provenance."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DETAILS_FILE = ROOT / "data/game-details.json"
OUTPUT_FILE = ROOT / "data/index/verified-company-credits.json"
FIELDS = ("developer", "publisher")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def complete_provenance(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    return bool(
        str(value.get("source") or "").strip()
        and str(value.get("reviewedAt") or "").strip()
        and str(value.get("reviewBatch") or "").strip()
        and str(value.get("evidenceSummary") or "").strip()
        and any(str(url).strip() for url in value.get("evidenceUrls") or [])
    )


def build_index(details: dict[str, Any]) -> dict[str, Any]:
    credits: dict[str, Any] = {}
    for catalog_id in sorted(details):
        detail = details[catalog_id]
        if not isinstance(detail, dict):
            continue

        verified_fields = [
            field
            for field in FIELDS
            if isinstance(detail.get(field), dict)
            and complete_provenance((detail.get("fieldProvenance") or {}).get(field))
        ]
        if not verified_fields:
            continue

        credits[catalog_id] = {
            "developer": detail.get("developer") if "developer" in verified_fields else None,
            "publisher": detail.get("publisher") if "publisher" in verified_fields else None,
            "fieldSources": {
                field: (detail.get("fieldSources") or {}).get(field)
                or detail["fieldProvenance"][field]["source"]
                for field in verified_fields
            },
            "fieldProvenance": {
                field: detail["fieldProvenance"][field] for field in verified_fields
            },
        }

    return {"schemaVersion": 1, "credits": credits}


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    expected = build_index(read_json(DETAILS_FILE))
    if args.write:
        write_json(OUTPUT_FILE, expected)
    else:
        if not OUTPUT_FILE.is_file() or read_json(OUTPUT_FILE) != expected:
            raise SystemExit(
                "data/index/verified-company-credits.json is missing or out of sync"
            )

    field_count = sum(
        len(entry["fieldProvenance"]) for entry in expected["credits"].values()
    )
    print(
        "OK verified company credit index: "
        f"{len(expected['credits'])} entries, {field_count} fields"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
