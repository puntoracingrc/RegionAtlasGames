"""Apply only the user-authorized visual Game Boy sample; no paid collection."""

from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess

from sync_es_prices import apply_condition_price_estimates

ROOT = Path(__file__).resolve().parents[1]
BATCH_FILE = ROOT / "data/region-research/gameboy-reviewed-listings.json"
REPORT_FILE = ROOT / "data/research/gameboy-reviewed-batch-report.json"
CATALOG_FILE = ROOT / "data/catalog.json"
QUEUE_FILE = ROOT / "data/ebay-regional-campaigns/review-queue.json"
META_FILE = ROOT / "data/meta.json"
CURATION_FILE = ROOT / "data/curation-report.json"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def catalog_seed(review, family, batch):
    result = {key: None for key in (
        "pcId", "pcPath", "pcRegion", "pcCondition", "marketMin", "marketMax",
        "recommendedPrice", "pcRefPrice", "deltaEsVsPc", "priceSource", "updatedAt",
    )}
    result.update({
        "id": review["targetCatalogId"], "slug": family["slug"], "title": family["title"],
        "titlePc": family["title"], "platformSlug": "gameboy", "region": review["region"],
        "edition": "standard", "listingStatus": "listed", "hasEsPrice": False,
        "coverUrl": f"/catalog-covers/{review['targetCatalogId']}.webp", "matchConfidence": "MANUAL_REVIEW",
        "seedSource": batch["batch"], "regionVerified": True,
        "regionEvidence": ["human_reviewed_physical_components", review["listingUrl"]],
    })
    return result


def apply_batch(catalog, queue, meta, batch, curation=None):
    before = deepcopy(catalog)
    by_id = {row["id"]: row for row in catalog}
    assert len(by_id) == len(catalog), "Duplicate IDs before apply"
    accepted = [row for row in batch["reviews"] if row["action"] == "accept"]
    assert len(accepted) == batch["expectedActions"]["accept"]
    assert Counter(row["action"] for row in batch["reviews"]) == Counter({
        key: batch["expectedActions"][key] for key in ("accept", "reject", "pending")
    })
    changes = []
    for review in accepted:
        gid = review["targetCatalogId"]
        assert review["priceKind"] == "active_asking_price" and review["priceEur"] > 0
        created = review["outcome"] == "new_regional_edition_evidenced"
        if created:
            assert gid not in by_id, f"Entry already exists: {gid}; use --check after apply"
            family = by_id[review["familyCatalogId"]]
            assert family["platformSlug"] == "gameboy" and family["edition"] == "standard"
            assert not any(g["platformSlug"] == "gameboy" and g["region"] == review["region"]
                           and g["slug"] == family["slug"] for g in catalog), "Existing regional edition"
            old = None
            game = catalog_seed(review, family, batch)
            catalog.append(game)
            by_id[gid] = game
        else:
            game = by_id[gid]
            old = deepcopy(game)
        assert game["platformSlug"] == "gameboy" and game["region"] == review["region"]
        condition = "complete" if review["condition"] == "complete_core_visible" else review["condition"]
        assert condition in {"loose", "complete"}
        stamp = "2026-09-07T21:36:07Z"
        apply_condition_price_estimates(game, [(review["priceEur"], condition, "ebay-es")],
            synced_at=stamp, pc_ref=game.get("pcRefPrice"), human_reviewed_buckets={condition})
        game["priceSource"] = "eBay ES"
        changes.append({"catalogId": gid, "operation": "create" if created else "update",
                        "externalId": f"v1|{review['ebayId']}|0", "condition": condition,
                        "priceKind": review["priceKind"], "sourceUrl": review["listingUrl"],
                        "before": old, "after": deepcopy(game)})

    items = {item["id"]: item for item in queue["items"]}
    queue_changes = []
    for review in batch["reviews"]:
        if review["action"] == "pending":
            continue
        qid = review["queueId"] or hashlib.sha256(
            f"ebay-es|v1|{review['ebayId']}|0|non_game".encode()).hexdigest()[:20]
        old = deepcopy(items.get(qid))
        assert not old or old.get("status") == "pending", f"Already decided: {qid}"
        original = review["originalRow"]
        item = deepcopy(old) if old else {
            "id": qid, "status": "pending", "source": "ebay-es", "platformSlug": "gameboy",
            "targetRegion": original.get("listingRegion"), "detectedRegion": original.get("listingRegion"),
            "catalogId": original.get("catalogId"), "candidateCatalogId": original.get("catalogId"),
            "listingTitle": original["title"], "priceEur": original["priceEur"],
            "condition": original.get("condition") or "unknown", "reason": "non_game",
            "evidence": {"url": original["productUrl"], "externalId": original["externalId"]},
            "jobId": batch["sourceBatch"], "createdAt": batch["reviewedAt"],
        }
        action = review["action"]
        item.update(status="accepted" if action == "accept" else "rejected",
                    decidedAt=batch["reviewedAt"], updatedAt=batch["reviewedAt"])
        item["evidence"].update(imageUrl=review["imagesReviewed"][0], imageUrls=review["imagesReviewed"],
                                regionEvidence=["human_reviewed_physical_components"],
                                reviewNotes=[review["finding"], review["doNotInfer"]])
        decision = {"action": action, "note": review["finding"] + " " + review["doNotInfer"],
                    "reviewBatch": batch["batch"], "reviewer": review["reviewer"]}
        if action == "accept":
            condition = "complete" if review["condition"] == "complete_core_visible" else review["condition"]
            decision.update(catalogId=review["targetCatalogId"], region=review["region"], condition=condition)
            item.update(catalogId=review["targetCatalogId"], candidateCatalogId=review["targetCatalogId"],
                        detectedRegion=review["region"], condition=condition)
        else:
            decision["reasonCode"] = "non_game"
        item["decision"] = decision
        items[qid] = item
        queue["decisions"].append({"id": qid, "at": batch["reviewedAt"], **decision})
        queue_changes.append({"id": qid, "before": old, "after": deepcopy(item)})
    queue["items"] = list(items.values())
    queue["updatedAt"] = batch["reviewedAt"]

    listed = [row for row in catalog if row.get("listingStatus") == "listed"]
    old_meta = deepcopy(meta)
    meta["catalogTotal"] = len(catalog)
    meta["catalogListed"] = len(listed)
    meta["listedByPlatform"] = dict(Counter(row["platformSlug"] for row in listed))
    meta["coversListed"] = sum(bool(row.get("coverUrl")) for row in listed)
    meta["coversListedPct"] = round(meta["coversListed"] * 100 / len(listed), 1)
    old_ids = {row["id"] for row in before}
    new_ids = {row["id"] for row in catalog}
    assert old_ids <= new_ids and len(catalog) == len(new_ids)
    assert len(new_ids - old_ids) == batch["expectedActions"]["create"]
    touched = {row["catalogId"] for row in changes}
    assert all(row == by_id[row["id"]] for row in before if row["id"] not in touched)
    report = {"batch": batch["batch"], "baseCommit": batch["catalogBaseCommit"],
            "rowsBefore": len(before), "rowsAfter": len(catalog), "uniqueIdsAfter": len(new_ids),
            "addedIds": sorted(new_ids - old_ids), "removedIds": [], "priceObservationsApplied": len(changes),
            "publicPriceMeaning": "reviewed active asking price, not a completed sale or a statistical sample",
            "changes": changes, "queueChanges": queue_changes,
            "metaBefore": old_meta, "metaAfter": deepcopy(meta)}
    if curation is not None:
        report["curationBefore"] = deepcopy(curation)
        curation.update(total=len(catalog), listed=len(listed), excluded=len(catalog) - len(listed),
                        listedByPlatform=dict(sorted(Counter(row["platformSlug"] for row in listed).items())))
        report["curationAfter"] = deepcopy(curation)
    return report


def check(catalog, queue, meta, report):
    by_id = {row["id"]: row for row in catalog}
    assert len(catalog) == len(by_id)
    for change in report["changes"]:
        assert by_id[change["catalogId"]] == change["after"], change["catalogId"]
    items = {row["id"]: row for row in queue["items"]}
    for change in report["queueChanges"]:
        assert items[change["id"]] == change["after"], change["id"]
    assert meta["catalogTotal"] == len(catalog)
    assert meta["catalogListed"] == sum(g.get("listingStatus") == "listed" for g in catalog)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare-base", action="store_true", help="Replay the batch against its recorded Git base")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    batch, catalog, queue, meta, curation = map(load, [BATCH_FILE, CATALOG_FILE, QUEUE_FILE, META_FILE, CURATION_FILE])
    if args.compare_base:
        originals = [json.loads(subprocess.check_output(
            ["git", "show", f"{batch['catalogBaseCommit']}:{path.relative_to(ROOT)}"], cwd=ROOT))
            for path in (CATALOG_FILE, QUEUE_FILE, META_FILE, CURATION_FILE)]
        replay = apply_batch(*originals[:3], batch, originals[3])
        assert originals == [catalog, queue, meta, curation], "Data differs from the exact reviewed replay"
        assert replay == load(REPORT_FILE), "Report differs from the reproducible replay"
        print(f"PASS: {replay['rowsBefore']} -> {replay['rowsAfter']} unique entries; "
              f"{len(replay['addedIds'])} added, 0 removed, 8 asking prices, 11 review decisions")
        return
    if REPORT_FILE.exists():
        report = load(REPORT_FILE)
        check(catalog, queue, meta, report)
        assert curation == report["curationAfter"]
        print("PASS: batch already applied, no rewrites")
        return
    assert not args.check, "Batch has not been applied"
    report = apply_batch(catalog, queue, meta, batch, curation)
    print(json.dumps({key: value for key, value in report.items()
                      if key not in {"changes", "queueChanges", "metaBefore", "metaAfter", "curationBefore", "curationAfter"}}, ensure_ascii=False, indent=2))
    if args.write:
        for path, value in [(CATALOG_FILE, catalog), (QUEUE_FILE, queue), (META_FILE, meta), (CURATION_FILE, curation), (REPORT_FILE, report)]:
            save(path, value)
        check(catalog, queue, meta, report)


if __name__ == "__main__":
    main()
