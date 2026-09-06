#!/usr/bin/env python3
"""Reproducible, scoped reconciliation of the duplicated TodoConsolas campaign."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import unicodedata
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/research/price-prs-197-202"
CAMPAIGN = "20260905T201323Z"
BASE = "177bf42b20db1e7c2cfb9859f00715ef34b81d57"
FIELDS = ("tcnsRetailPrice", "tcnsProductUrl", "tcnsCondition", "tcnsMatchedAt")
URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker/cron/"
EXPECTED = {"ps4": 287, "ps5": 63, "switch2": 4}
TITLE_EQUIVALENTS = {
    "ps4-tales-of-the-neon-sea": "Tales of Neon Sea",
    "ps4-this-is-the-police-2": "This Is The Police II",
}


def git_json(ref, path):
    return json.loads(subprocess.check_output(["git", "show", f"{ref}:{path}"], cwd=ROOT))


def normalized(value):
    value = unicodedata.normalize("NFKD", html.unescape(value)).lower()
    return re.sub(r"[^a-z0-9]", "", value)


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.download:
        paths = {"status": "todoconsolas-weekly-status.json", "ready": f"todoconsolas-weekly/{CAMPAIGN}/ready-for-git.json"}
        paths.update({p: f"todoconsolas-weekly/{CAMPAIGN}/ingest/todoconsolas-{p}.json" for p in EXPECTED})
        for name, path in paths.items():
            with urlopen(URL + path, timeout=30) as response:
                save(OUT / f"{name}.json", json.load(response))
    evidence = {name: json.loads((OUT / f"{name}.json").read_text()) for name in ["status", "ready", *EXPECTED]}
    for name in ["status", "ready"]:
        assert evidence[name]["status"] == "ready_for_git"
        assert evidence[name]["campaignId"] == CAMPAIGN
    before = git_json(BASE, "data/catalog.json")
    current = json.loads((ROOT / "data/catalog.json").read_text())
    after = copy.deepcopy(before)
    by_id = {g["id"]: g for g in after}
    assert len(by_id) == len(before)
    report = {"base": BASE, "campaign": CAMPAIGN, "sourcePrs": [197, 202], "accepted": [], "rejected": []}
    seen = set()
    for platform, count in EXPECTED.items():
        payload = evidence[platform]
        rows = payload["tcns"]
        assert len(rows) == count == evidence["ready"]["platforms"][platform]["exactListings"]
        assert set(r["catalogId"] for r in rows) == set(evidence["ready"]["platforms"][platform]["catalogIds"])
        for row in rows:
            catalog_id = row["catalogId"]
            assert catalog_id not in seen
            seen.add(catalog_id)
            game = by_id.get(catalog_id)
            reason = None
            if not game:
                reason = "Catalog ID no longer exists"
            elif catalog_id == "ps4-persona-5-strikers":
                reason = "Limited edition listing versus standard catalog entry; EAN alone does not resolve edition"
            elif not (game["platformSlug"] == platform and game["region"] == row["catalogRegion"] == row["listingRegion"]):
                reason = "Platform or region mismatch"
            elif not (row.get("autoApproved") is True and row.get("regionVerified") is True and row.get("acceptancePolicy") == "tcns_exact_title_region_used_v1" and row.get("source") == "todoconsolas" and row.get("sourceType") == "retail_es_preowned" and row.get("condition") == row.get("offerType") == "preowned" and row.get("currency") == "EUR"):
                reason = "Evidence contract invalid"
            elif normalized(game["title"]) != normalized(row["displayTitle"]) and TITLE_EQUIVALENTS.get(catalog_id) != row["displayTitle"]:
                reason = "Unresolved title or edition mismatch"
            elif not (0 < row["retailPriceEur"] < 100000 and row["productUrl"].startswith("https://www.todoconsolas.com/")):
                reason = "Invalid price or source URL"
            elif game.get("tcnsMatchedAt", "") > row["collectedAt"]:
                reason = "Preserve newer TodoConsolas observation"
            if reason:
                report["rejected"].append({"id": catalog_id, "reason": reason, "evidence": row})
                continue
            old = {key: game.get(key) for key in FIELDS}
            new = dict(zip(FIELDS, [row["retailPriceEur"], row["productUrl"], "preowned", row["collectedAt"]]))
            game.update(new)
            report["accepted"].append({"id": catalog_id, "platform": platform, "region": game["region"], "before": old, "after": new, "evidence": row})
    assert len(seen) == 354
    assert [g["id"] for g in before] == [g["id"] for g in after]
    strip = lambda g: {k: v for k, v in g.items() if k not in FIELDS}
    assert all(strip(a) == strip(b) for a, b in zip(before, after))
    report["summary"] = {
        "observations": len(seen), "accepted": len(report["accepted"]), "rejected": len(report["rejected"]),
        "rowsBefore": len(before), "rowsAfter": len(after), "uniqueIds": len(by_id),
        "newPrices": sum(r["before"]["tcnsRetailPrice"] is None for r in report["accepted"]),
        "changedPrices": sum(r["before"]["tcnsRetailPrice"] is not None and r["before"]["tcnsRetailPrice"] != r["after"]["tcnsRetailPrice"] for r in report["accepted"]),
        "otherFieldsUnchanged": True,
    }
    report["evidenceSha256"] = {name: hashlib.sha256((OUT / f"{name}.json").read_bytes()).hexdigest() for name in evidence}
    if args.apply:
        assert current == before or current == after, "Catalog changed since reviewed base; do not overwrite"
        save(ROOT / "data/catalog.json", after)
        state_path = ROOT / "data/price-artifact-publish-state.json"
        state = json.loads(state_path.read_text())
        if CAMPAIGN not in state["todoconsolasCampaigns"]:
            state["todoconsolasCampaigns"].append(CAMPAIGN)
            state["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        save(state_path, state)
    if args.check:
        assert current == after, "Catalog differs from the reviewed reconciliation"
        assert CAMPAIGN in json.loads((ROOT / "data/price-artifact-publish-state.json").read_text())["todoconsolasCampaigns"]
    save(OUT / "report.json", report)
    print(json.dumps(report["summary"]))
    if current == after:
        print("Applied catalog matches reproducible reconciliation")


if __name__ == "__main__":
    main()
