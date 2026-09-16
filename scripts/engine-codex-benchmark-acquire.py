#!/usr/bin/env python3
"""Acquire and interpret the frozen benchmark listings as the Engine layer."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


load_local_env(ROOT / ".env.local")
PILOT_PATH = ROOT / "scripts" / "listing-evidence-pilot-v2.py"
spec = importlib.util.spec_from_file_location("listing_evidence_pilot_v2", PILOT_PATH)
if not spec or not spec.loader:
    raise RuntimeError("LISTING_EVIDENCE_PILOT_IMPORT_FAILED")
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rg_files(title: str, roots: list[str]) -> list[str]:
    completed = subprocess.run(
        ["rg", "-l", "-i", "-F", title, *roots, "--glob", "*.json", "--glob", "*.md"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode not in {0, 1}:
        raise RuntimeError(f"PREFLIGHT_RG_FAILED:{completed.stderr[:200]}")
    return sorted({line for line in completed.stdout.splitlines() if line})


def preflight(row: dict[str, Any]) -> dict[str, Any]:
    title = str(row["game"])
    owned = rg_files(title, ["data/research/owned-scans", "data/catalog-owned-scans.json"])
    research = rg_files(title, ["data/research-engine/knowledge", "data/research"])
    guides = rg_files(title, ["data/catalog-edition-guides.json", "data"])
    deeply_analyzed = bool(owned and research and guides)
    return {
        "status": "ALREADY_DEEPLY_ANALYZED" if deeply_analyzed else "NOT_DEEPLY_ANALYZED",
        "ownedScanMatches": owned,
        "regionalResearchMatches": research,
        "guideMatches": guides,
        "reason": "Requires owned scan plus regional research plus an exact guide; all three were present." if deeply_analyzed
        else "No complete owned-scan + regional-guide + component/market mapping set was found.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="artifacts/engine-codex-review-benchmark")
    args = parser.parse_args()
    output = ROOT / args.output_dir
    selected = read_json(output / "selected-listings.json")
    by_id, by_title = pilot.catalog_indexes()
    results: list[dict[str, Any]] = []
    preflights: dict[str, Any] = {}
    cache_dir = ROOT / "data" / "price-ingest" / "cache" / "engine-codex-benchmark"
    for row in selected["cases"]:
        preflights[row["caseId"]] = preflight(row)
        if row["status"] != "SELECTED":
            results.append({
                "caseId": row["caseId"], "platform": row["platform"], "subjectTitle": row["game"],
                "availability": row["status"], "availabilityReason": row["availabilityReason"], "item": None,
                "costUsd": 0, "openAiCalls": 0,
            })
            continue
        case = {
            "caseId": row["caseId"],
            "platform": row["platform"],
            "subjectTitle": row["game"],
            "initialCatalogId": row["initialCatalogId"],
            "targetRegion": (by_id.get(str(row["initialCatalogId"])) or {}).get("region"),
            "hydrated": row["hydrated"],
        }
        print(f"ENGINE_ACQUIRE_START {row['caseId']}", flush=True)
        result = pilot.process_case(case, output_dir=output / "engine-acquisition", cache_dir=cache_dir, by_id=by_id, by_title=by_title)
        result["availability"] = "USABLE"
        result["selectionInputHash"] = row["inputHash"]
        result["selectionGalleryHash"] = row["galleryHash"]
        results.append(result)
        print(f"ENGINE_ACQUIRE_DONE {row['caseId']} cost={result['costUsd']:.6f}", flush=True)
    summary = {
        "schemaVersion": 1,
        "benchmark": "PILOT_16",
        "selectionFreezeHash": selected["freezeHash"],
        "cases": results,
        "preflight": preflights,
        "costUsd": sum(float(row.get("costUsd") or 0) for row in results),
        "openAiCalls": sum(int(row.get("openAiCalls") or 0) for row in results),
        "mutations": {"catalog": 0, "prices": 0, "authoritativeQueue": 0, "publicAssets": 0},
    }
    write_json(output / "engine-input.json", summary)
    write_json(output / "preflight.json", preflights)
    print(json.dumps({"usable": sum(row["availability"] == "USABLE" for row in results), "costUsd": summary["costUsd"], "openAiCalls": summary["openAiCalls"]}, indent=2))


if __name__ == "__main__":
    main()
