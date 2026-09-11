"""Export one PS2 documentary contract for the scanner, web and Python collectors."""
import gzip
import json
from collections import defaultdict
from reference import ROOT, ART, SOURCES, load_gzip
from migrate import dump_gzip


def main():
    pages = json.loads((ART / "source-resolution.json").read_text())
    findings = load_gzip("curated-findings.json.gz")["records"]
    by_source = defaultdict(list)
    for finding in findings:
        for evidence in finding["evidence"]:
            by_source[evidence["sourceId"]].append(finding)
    assets = defaultdict(list)
    packaging_barcodes = defaultdict(list)
    for asset in load_gzip("psx-assets.json.gz"):
        if not set(asset["types"]) & {"front_cover", "back_cover", "disc_label", "manual_page", "interior_or_inlay", "spine_card", "box_paper_scan"}:
            continue
        for ref in asset["pageReferences"]:
            assets[ref["sourceId"]].append({"assetId": asset["assetId"], "roles": asset["types"], "label": ref.get("sourceLabel"), "sourceImageReference": asset["referenceUrl"], "url": asset.get("archive", {}).get("publicArchiveUrl"), "physicalPairingVerified": False})
            visual = asset.get("visualObservation", {})
            if visual.get("observedBarcode") and visual.get("barcodeChecksumValid"):
                packaging_barcodes[ref["sourceId"]].append({"digits": visual["observedBarcode"], "scope": "packaging_scan", "editionLabel": visual.get("editionMarkObserved"), "sourceUrl": ref["sourceUrl"], "assetId": asset["assetId"], "imageSha256": visual.get("imageSha256"), "independentVisualGroundTruth": False})
    source_records = []
    for page in pages:
        fields = page["fields"]
        product = page.get("productCodeEvidence", [])
        codes = sorted(set(page["serials"]) | {p["value"] for p in product if p.get("kind") != "accessory_code"})
        source_records.append({"id": page["sourceId"], "title": page["title"], "names": page["names"], "sourceUrl": page["sourceUrl"], "sourceHash": page["sourceHash"], "family": page["family"], "market": page["market"] if not page["reviewReasons"] else None, "codes": codes, "serialEvidence": page["serialEvidence"], "accessoryCodes": page.get("accessoryCodeEvidence", []), "productCodes": product, "languages": page["languages"], "editionLabels": page["editionLabels"], "releaseDate": page["release"], "barcodes": page["barcodes"], "metadata": {k: " ".join(v).strip() for k, v in fields.items() if k not in ["Official Title", "Common Title", "Serial Number(s)", "Serial Number In Disc", "Barcode Number(s)"] and any(v)}, "reviewReasons": page["reviewReasons"], "warnings": sorted(set(page["sourceWarnings"] + page.get("sourceReviewFlags", []))), "graphics": assets[page["sourceId"]], "findings": by_source[page["sourceId"]], "physicalVariantResolved": False})
    for record in source_records:
        record["barcodeReferences"] = [{"digits": b["digits"], "scope": "source_table", "sourceUrl": record["sourceUrl"], "sourceDisclaimsCertainty": "barcode_source_disclaims_certainty" in record["warnings"], "independentVisualGroundTruth": False} for b in record["barcodes"] if b.get("checksumValid")] + packaging_barcodes[record["id"]]
    dump_gzip(ROOT / "data/ps2-source-knowledge.json.gz", {"schemaVersion": 2, "platform": "ps2", "reviewedAt": "2026-09-11", "mode": "documentary_not_visual_ground_truth", "records": source_records})
    profiles = json.load(gzip.open(ROOT / "data/ps2-edition-evidence.json.gz", "rt"))
    source_for_url = {p["sourceUrl"]: p["sourceId"] for p in pages if not p.get("indexOnly")}
    for profile in profiles.values():
        selected = {f["id"]: f for src in profile["sources"] for f in by_source[source_for_url.get(src["url"]) or ""]}
        profile["findings"] = list(selected.values())
    dump_gzip(ROOT / "data/ps2-edition-evidence.json.gz", profiles)
    print(json.dumps({"sourceRecords": len(source_records), "withCodes": sum(bool(p["codes"]) for p in source_records), "findings": len(findings), "profilesWithFindings": sum(bool(p["findings"]) for p in profiles.values())}))


if __name__ == "__main__":
    main()
