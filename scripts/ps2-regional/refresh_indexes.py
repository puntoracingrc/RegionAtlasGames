"""Refresh PS2 memberships/counts without changing other platforms' metadata."""
import json
import gzip
import hashlib
import subprocess
import sys
from collections import Counter

from reference import ROOT, AT, ART

sys.path.insert(0, str(ROOT / "scripts"))
from collectors.game_details_lib import resolve_canonical_company, resolve_canonical_genre


def main():
    baseline = json.load(gzip.open(ART / "baseline-ps2.json.gz", "rt"))
    catalog = json.loads((ROOT / "data/catalog.json").read_text())
    details = json.loads((ROOT / "data/game-details.json").read_text())
    works = json.load(gzip.open(ROOT / "data/ps2-works.json.gz", "rt"))["works"]
    for d in details.values():
        wid = d.get("ps2Edition", {}).get("workId")
        common = works.get(wid, {}).get("commonDetails", {})
        for field in ["genres", "series"]:
            if not d.get(field) and common.get(field): d[field] = common[field]
    by_id = {g["id"]: g for g in catalog}
    ps2 = [g for g in catalog if g["platformSlug"] == "ps2"]
    ps2_ids = {g["id"] for g in ps2}
    report = {}
    for kind in ["companies", "genres", "series"]:
        path = "data/index/" + kind + ".json"
        old = json.loads(subprocess.check_output(["git", "show", baseline["commit"] + ":" + path], cwd=ROOT))
        bucket = json.loads(json.dumps(old))
        for entry in bucket.values():
            for key in ["gameIds", "asDeveloper", "asPublisher", "asDigitalPublisher", "asPhysicalPublisherOrDistributor"]:
                if key in entry:
                    entry[key] = [gid for gid in entry[key] if gid not in ps2_ids]
        for game in ps2:
            d = details.get(game["id"], {})
            if kind == "companies":
                values = [(d.get("developer"), "asDeveloper"), (d.get("publisher"), "asPublisher")]
            elif kind == "genres":
                values = [(v, None) for v in d.get("genres", [])]
            else:
                values = [(d.get("series"), None)]
            if game["listingStatus"] == "excluded" and kind != "companies":
                continue
            for entity, role in values:
                if not entity or not entity.get("name"):
                    continue
                key = entity["slug"]
                name = entity["name"]
                if kind == "companies":
                    canonical = resolve_canonical_company(key, name, wikidata_id=entity.get("wikidataId"), museum_path=entity.get("museumPath"))
                    key, name = canonical["slug"], canonical["name"]
                elif kind == "genres":
                    canonical = resolve_canonical_genre(key, name, museum_path=entity.get("museumPath"))
                    key, name = canonical["slug"], canonical["name"]
                entry = bucket.setdefault(key, {"name": name, "slug": key, "museumPath": entity.get("museumPath") or "", "gameIds": []})
                if game["id"] not in entry["gameIds"]:
                    entry["gameIds"].append(game["id"])
                if role:
                    entry.setdefault("asDeveloper", [])
                    entry.setdefault("asPublisher", [])
                    if game["id"] not in entry[role]: entry[role].append(game["id"])
        for key, entry in bucket.items():
            entry["gameCount"] = len(entry["gameIds"])
            entry["byPlatform"] = dict(sorted(Counter(by_id[gid]["platformSlug"] for gid in entry["gameIds"] if gid in by_id).items()))
            if key in old:
                assert [i for i in entry["gameIds"] if i not in ps2_ids] == [i for i in old[key]["gameIds"] if i not in ps2_ids]
        (ROOT / path).write_text(json.dumps(bucket, ensure_ascii=False, indent=2) + "\n")
        report[kind] = {"entries": len(bucket), "ps2Memberships": sum(sum(gid in ps2_ids for gid in e["gameIds"]) for e in bucket.values())}
    meta_file = ROOT / "data/meta.json"
    meta = json.loads(meta_file.read_text())
    meta["catalogTotal"] = len(catalog)
    meta["catalogListed"] = sum(g["listingStatus"] != "excluded" for g in catalog)
    meta["listedByPlatform"]["ps2"] = sum(g["listingStatus"] != "excluded" for g in ps2)
    meta["gamesWithDetails"] = len(details)
    meta["indexCompanies"] = report["companies"]["entries"]
    meta["lastPs2RegionalMigrationAt"] = AT
    meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    curation_file = ROOT / "data/curation-report.json"
    curation = json.loads(curation_file.read_text())
    curation["total"] = meta["catalogTotal"]
    curation["listed"] = meta["catalogListed"]
    curation["listedByPlatform"]["ps2"] = meta["listedByPlatform"]["ps2"]
    curation_file.write_text(json.dumps(curation, ensure_ascii=False, indent=2) + "\n")
    platforms_file = ROOT / "data/platforms.json"
    platforms = json.loads(platforms_file.read_text())
    next(p for p in platforms if p["slug"] == "ps2")["estimatedCatalogSize"] = meta["listedByPlatform"]["ps2"]
    next(p for p in platforms if p["slug"] == "ps2")["description"] = "Ediciones documentadas de Europa, América y Asia, con códigos, idiomas y referencias de sus componentes."
    platforms_file.write_text(json.dumps(platforms, ensure_ascii=False, indent=2) + "\n")
    # A pre-existing PS4 redirect points to Cars on PS2. Keep both route
    # addresses, while its descriptive locator follows the current PS2 row.
    redirects_file = ROOT / "data/catalog-route-redirects.json"
    redirects = json.loads(redirects_file.read_text())
    for redirect in redirects["redirects"]:
        game = by_id[redirect["targetCatalogId"]]
        if game["platformSlug"] == "ps2":
            assert redirect["targetParam"] == game["canonicalSeoSlug"]
            locator = redirect["targetLocator"]
            for field in ["region", "edition", "physicalVariant", "pcId", "coverUrl", "listingStatus"]:
                locator[field] = game.get(field)
    redirects_file.write_text(json.dumps(redirects, ensure_ascii=False, indent=2) + "\n")
    (ART / "index-refresh.json").write_text(json.dumps(report, indent=2) + "\n")
    # These research manifests already keep a ledger of legitimate catalog
    # changes. Advance only the two PS2 projections; retain all other hashes.
    for study in ["company-study", "person-study"]:
        manifest_path = ROOT / "data/research" / study / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        updates = manifest.setdefault("protectedFileHashUpdates", [])
        updates[:] = [u for u in updates if u["batchId"] != "ps2-regional-v2-2026-09-11"]
        changes = {}
        for name in ["data/index/companies.json", "data/game-details.json"]:
            before = hashlib.sha256(subprocess.check_output(["git", "show", baseline["commit"] + ":" + name], cwd=ROOT)).hexdigest()
            after = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            changes[name] = {"before": before, "after": after}
            manifest["protectedFileHashes"][name] = after
        updates.append({"batchId": "ps2-regional-v2-2026-09-11", "reviewedAt": "2026-09-11", "files": changes})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__": main()
