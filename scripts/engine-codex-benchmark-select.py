#!/usr/bin/env python3
"""Freeze objective eBay listings for the closed 16-case benchmark.

This phase performs no AI analysis and does not inspect regional truth. It
selects the first active fixed-price physical candidate returned by the normal
eBay Browse route, then freezes the exact item and gallery hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.ebay_client import hydrate_ebay_item, search_ebay_es  # noqa: E402


CASES = (
    ("PS4-01", "ps4", "Fobia: St. Dinfna Hotel", "ps4-usa-fobia-st-dinfna-hotel", None),
    ("PS4-02", "ps4", "Soul Hackers 2", "ps4-soul-hackers-2", None),
    ("PS4-03", "ps4", "Atelier Firis: The Alchemist and the Mysterious Journey", "ps4-atelier-firis-the-alchemist-and-the-mysterious-journey", None),
    ("PS4-04", "ps4", "Code Vein", "ps4-code-vein", None),
    ("PS5-01", "ps5", "Demon's Souls", "ps5-usa-demon-s-souls", "STANDARD"),
    ("PS5-02", "ps5", "Dragon's Dogma 2", "ps5-usa-dragon-s-dogma-2", "STANDARD"),
    ("PS5-03", "ps5", "Final Fantasy XVI", "ps5-final-fantasy-xvi", "STANDARD"),
    ("PS5-04", "ps5", "Hogwarts Legacy", "ps5-hogwarts-legacy-standard", "STANDARD"),
    ("N64-01", "n64", "Holy Magic Century", "n64-holy-magic-century", None),
    ("N64-02", "n64", "Aidyn Chronicles", "n64-aidyn-chronicles", None),
    ("N64-03", "n64", "Hybrid Heaven", "n64-pal-hybrid-heaven", None),
    ("N64-04", "n64", "Shadow Man", "n64-shadow-man", None),
    ("GB-01", "gameboy", "Lock 'n' Chase", "gameboy-pal-lock-n-chase", None),
    ("GB-02", "gameboy", "Nail 'n' Scale", "gameboy-pal-nail-n-scale", None),
    ("GB-03", "gameboy", "Tumble Pop", "gameboy-pal-tumble-pop", None),
    ("GB-04", "gameboy", "BurgerTime Deluxe", "gameboy-burgertime-deluxe", None),
)

PLATFORM_QUERY = {"ps4": "PS4", "ps5": "PS5", "n64": "Nintendo 64", "gameboy": "Game Boy"}
WRONG_PRODUCT = re.compile(
    r"\b(?:poster|print|guide|magazine|book|soundtrack|ost|figure|figurine|magnet|iman|keyring|keychain|"
    r"controller|console|skin|sticker|replacement|repro|reproduction|custom|empty case|case only|"
    r"box only|manual only|cover only|artwork only|digital code|download code)\b",
    re.I,
)
NON_STANDARD = re.compile(r"\b(?:deluxe|collector|steelbook|limited|lenticular|bundle)\b", re.I)


def normalized(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", html.unescape(str(value or "")))
    return re.sub(r"[^a-z0-9]+", " ", "".join(ch for ch in raw if not unicodedata.combining(ch)).lower()).strip()


def canonical_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def title_matches(candidate: str, expected: str) -> bool:
    actual = set(normalized(candidate).split())
    wanted = {token for token in normalized(expected).split() if token not in {"the", "of", "and", "a"}}
    return bool(wanted) and len(actual & wanted) / len(wanted) >= 0.8


def platform_matches(title: str, platform: str) -> bool:
    clean = normalized(title)
    if platform == "ps4":
        return bool(re.search(r"\b(?:ps4|playstation 4)\b", clean)) and not re.search(r"\b(?:ps5|playstation 5)\b", clean)
    if platform == "ps5":
        return bool(re.search(r"\b(?:ps5|playstation 5)\b", clean)) and not re.search(r"\b(?:ps4|playstation 4)\b", clean)
    if platform == "n64":
        return bool(re.search(r"\b(?:n64|nintendo 64)\b", clean))
    return bool(re.search(r"\b(?:game ?boy|dmg)\b", clean))


def fixed_price(row: dict[str, Any]) -> bool:
    options = {str(value).upper() for value in row.get("buyingOptions") or []}
    listing_type = str(row.get("ebayListingType") or "").upper()
    return "AUCTION" not in options and "AUCTION" not in listing_type


def select_case(case: tuple[str, str, str, str, str | None]) -> dict[str, Any]:
    case_id, platform, game, initial_catalog_id, edition_constraint = case
    query = f'"{game}" {PLATFORM_QUERY[platform]}'
    rows, backend = search_ebay_es(query, catalog_region="PAL España", max_results=30)
    rejected: list[dict[str, str]] = []
    for row in rows:
        title = str(row.get("title") or "")
        reason = None
        if not fixed_price(row):
            reason = "ACTIVE_AUCTION"
        elif not title_matches(title, game):
            reason = "WRONG_GAME_CANDIDATE"
        elif not platform_matches(title, platform):
            reason = "WRONG_PLATFORM_CANDIDATE"
        elif WRONG_PRODUCT.search(title):
            reason = "OBVIOUS_NON_GAME_PRODUCT"
        elif edition_constraint == "STANDARD" and NON_STANDARD.search(title):
            reason = "NON_STANDARD_EDITION"
        if reason:
            rejected.append({"listingId": str(row.get("itemId") or ""), "reason": reason})
            continue
        try:
            hydrated = hydrate_ebay_item(str(row.get("itemId") or ""))
        except (RuntimeError, ValueError) as exc:
            rejected.append({"listingId": str(row.get("itemId") or ""), "reason": type(exc).__name__})
            continue
        gallery = hydrated.get("images") if isinstance(hydrated.get("images"), list) else []
        freeze_input = {
            "caseId": case_id,
            "game": game,
            "platform": platform,
            "initialCatalogId": initial_catalog_id,
            "editionConstraint": edition_constraint,
            "selectionQuery": query,
            "listingId": hydrated.get("itemId"),
            "legacyListingId": hydrated.get("legacyItemId"),
            "listingUrl": hydrated.get("itemWebUrl"),
            "listingTitle": hydrated.get("title"),
            "gallery": gallery,
        }
        return {
            **freeze_input,
            "status": "SELECTED",
            "availabilityReason": None,
            "selectionBackend": backend,
            "inputHash": canonical_hash({key: freeze_input[key] for key in freeze_input if key != "gallery"}),
            "galleryHash": canonical_hash(gallery),
            "galleryImages": len(gallery),
            "hydrated": hydrated,
            "rejectedBeforeSelection": rejected,
        }
    return {
        "caseId": case_id,
        "game": game,
        "platform": platform,
        "initialCatalogId": initial_catalog_id,
        "editionConstraint": edition_constraint,
        "selectionQuery": query,
        "status": "CASE_UNAVAILABLE",
        "availabilityReason": "NO_ACTIVE_PHYSICAL_LISTING" if not rows else "NO_USABLE_LISTING",
        "selectionBackend": backend,
        "rejectedBeforeSelection": rejected,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="artifacts/engine-codex-review-benchmark")
    args = parser.parse_args()
    output = ROOT / args.output_dir
    output.mkdir(parents=True, exist_ok=True)
    selected: list[dict[str, Any]] = []
    for case in CASES:
        print(f"SELECT_START {case[0]} {case[2]}", flush=True)
        row = select_case(case)
        selected.append(row)
        print(f"SELECT_DONE {case[0]} {row['status']} {row.get('listingId') or '-'}", flush=True)
    document = {
        "schemaVersion": 1,
        "benchmark": "PILOT_16",
        "selectionPolicy": "FIRST_ELIGIBLE_BROWSE_RESULT_BEFORE_RESEARCH",
        "selectedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "cases": selected,
        "freezeHash": canonical_hash([{key: value for key, value in row.items() if key != "rejectedBeforeSelection"} for row in selected]),
    }
    (output / "selected-listings.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"selected": sum(row["status"] == "SELECTED" for row in selected), "unavailable": sum(row["status"] != "SELECTED" for row in selected), "freezeHash": document["freezeHash"]}, indent=2))


if __name__ == "__main__":
    main()
