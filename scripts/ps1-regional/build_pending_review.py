"""Build a reproducible packaging review queue; never assign a region or a cover.

Title matches retrieve research candidates, not edition equivalences. Only gallery
references explicitly labelled with the requested range/box type are retained.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from reference import title_key
from migrate import FLAGS

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "data/ps1-variant-review.json"


def build():
    catalog = json.loads((ROOT / "data/catalog.json").read_text())
    profiles = json.load(gzip.open(ROOT / "data/ps1-edition-evidence.json.gz", "rt"))
    resolution = json.loads((ROOT / "artifacts/ps1-region-migration/catalog-resolution.json").read_text())
    releases = resolution["releases"]
    # The original gallery parser excluded some box-paper scans from profiles.
    # Recover explicitly labelled packaging, preferring the current published URL.
    published = {asset["assetId"]: asset for profile in profiles.values() for asset in profile.get("graphics", []) if asset.get("stored") and asset.get("url")}
    gallery = {}
    raw_assets = json.load(gzip.open(ROOT / "artifacts/ps1-region-migration/sources/psx-assets.json.gz", "rt"))
    for asset in raw_assets:
        for ref in asset.get("pageReferences", []):
            label = ((ref.get("sourceLabel") or "") + " " + (ref.get("groupLabel") or "")).lower().replace("-", " ")
            if not any(word in label for word in ["platinum", "greatest hits", "long box"]):
                continue
            archive = asset.get("archive") or {}
            flags = sorted({FLAGS.get(urlparse(flag).path.split("/")[-1].split(".")[0], "UNKNOWN") for flag in ref.get("flagHints", [])})
            value = {"assetId": asset["assetId"], "roles": asset.get("types", []), "sourceUrl": ref["sourceUrl"], "sourceImageReference": asset["referenceUrl"], "label": ref.get("sourceLabel"), "group": ref.get("groupLabel"), "marketHints": flags, "stored": False, "physicalPairingVerified": False}
            url = archive.get("publicArchiveUrl") or ""
            if url.startswith("https://www.puntoracing.net/MEDIAREGIONATLAS/covers/"):
                value.update({key: archive[key] for key in ["sha256", "bytes", "width", "height"] if key in archive})
                value.update({"url": url, "stored": True})
            if asset["assetId"] in published:
                value.update({key: val for key, val in published[asset["assetId"]].items() if key in {"url", "sha256", "bytes", "width", "height", "stored", "storageLocation", "sourceImageUrl", "thumbnailOnly"}})
            gallery.setdefault(ref["sourceUrl"], []).append(value)
    ps1 = [g for g in catalog if g["platformSlug"] == "ps1" and g.get("listingStatus") != "excluded" and g.get("catalogKind", "game") == "game"]
    candidates = {}
    for game in ps1:
        if game.get("regionalStatus") != "resolved":
            continue
        profile = profiles[game["id"]]
        if profile.get("containsMultipleWorks"):
            continue
        release = releases.get(profile.get("releaseId"), {})
        keys = {title_key(game["title"]), *release.get("titleKeys", []), *release.get("workTitleKeys", [])}
        for key in keys:
            candidates.setdefault((game.get("regionFamily"), key), []).append(game)

    entries = {}
    for game in ps1:
        if game.get("regionalStatus") != "review":
            continue
        title = game["title"].lower()
        kind = next((kind for label, kind in [("[platinum]", "platinum"), ("[greatest hits]", "greatest-hits"), ("[long box]", "long-box")] if label in title), None)
        if not kind:
            continue
        possible = {g["id"]: g for g in candidates.get((game.get("regionFamily"), title_key(game["title"])), [])}
        references = {}
        for candidate in possible.values():
            profile = profiles[candidate["id"]]
            assets = [*profile.get("graphics", []), *(asset for source in profile.get("sources", []) for asset in gallery.get(source["url"], []))]
            for asset in assets:
                label = ((asset.get("label") or "") + " " + (asset.get("group") or "")).lower().replace("-", " ")
                marker = {"platinum": "platinum", "greatest-hits": "greatest hits", "long-box": "long box"}[kind]
                if marker not in label or not any(word in label for word in ["front", "back"]):
                    continue
                key = (asset["assetId"], asset["sourceUrl"], asset.get("label"))
                if key not in references:
                    references[key] = {**asset, "candidateCatalogIds": [], "assignmentVerified": False}
                references[key]["candidateCatalogIds"].append(candidate["id"])
        refs = sorted(references.values(), key=lambda a: (a["sourceUrl"], a.get("label") or "", a["assetId"]))
        for ref in refs:
            ref["candidateCatalogIds"] = sorted(set(ref["candidateCatalogIds"]))
        entries[game["id"]] = {
            "title": game["title"], "kind": kind,
            "status": "packaging_references_found" if refs else "packaging_source_needed",
            "physicalVariantResolved": False,
            "matchBasis": "same_family_title_research_candidate_only",
            "researchCandidateIds": sorted(possible),
            "references": refs,
            "requiredEvidence": ["front_back_and_spine", "printed_codes_and_market", "disc_and_manual_consistency", "edition_range_and_box_construction"],
        }
    summary = {}
    for kind in ["platinum", "greatest-hits", "long-box"]:
        rows = [entry for entry in entries.values() if entry["kind"] == kind]
        summary[kind] = {
            "total": len(rows),
            "withPackagingReferences": sum(bool(row["references"]) for row in rows),
            "withStoredReferences": sum(any(a.get("stored") and a.get("url") for a in row["references"]) for row in rows),
            "withoutPackagingReference": sum(not row["references"] for row in rows),
            "physicalVariantResolved": 0,
        }
    return {"schemaVersion": 1, "reviewedAt": "2026-09-10", "scope": "packaging_review_not_catalog_assignment", "inputs": {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in ["data/catalog.json", "data/ps1-edition-evidence.json.gz", "artifacts/ps1-region-migration/catalog-resolution.json", "artifacts/ps1-region-migration/sources/psx-assets.json.gz"]
    }, "summary": summary, "entries": entries}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    payload = build()
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not TARGET.exists() or TARGET.read_text() != encoded:
            raise SystemExit("PS1 packaging review is stale; run build_pending_review.py")
    else:
        TARGET.write_text(encoded)
    print(json.dumps(payload["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
