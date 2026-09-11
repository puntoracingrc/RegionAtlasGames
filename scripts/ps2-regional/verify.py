"""Validate migration boundaries and documentary/graphic invariants offline."""
import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts/ps2-region-migration"
sys.path.insert(0, str(ROOT / "scripts"))
from owned_scan_migration_compat import historical_bytes


def load(path):
    return json.load(gzip.open(ROOT / path, "rt")) if path.endswith(".gz") else json.loads(historical_bytes(path))


def main():
    baseline = load("artifacts/ps2-region-migration/baseline-ps2.json.gz")
    catalog = load("data/catalog.json")
    details = load("data/game-details.json")
    profiles = load("data/ps2-edition-evidence.json.gz")
    sources = load("data/ps2-source-knowledge.json.gz")["records"]
    before = json.loads(subprocess.check_output(["git", "show", baseline["commit"] + ":data/catalog.json"], cwd=ROOT))
    before_details = json.loads(subprocess.check_output(["git", "show", baseline["commit"] + ":data/game-details.json"], cwd=ROOT))
    checks = []
    assert [g for g in catalog if g["platformSlug"] != "ps2"] == [g for g in before if g["platformSlug"] != "ps2"]
    for gid, detail in before_details.items():
        if not gid.startswith("ps2-"):
            assert details[gid] == detail, gid
    checks.append("OTHER_PLATFORMS_AND_DETAILS_IDENTICAL_TO_BASE_BEFORE_HASH_VERIFIED_SCAN_AMENDMENTS")
    protected = ["data/collection.json", "data/catalog-id-aliases.json", "data/ps1-edition-evidence.json.gz", "data/ps1-works.json.gz", "data/ps1-catalog-curation.json", "data/ps1-variant-review.json"]
    for file in protected:
        assert historical_bytes(file) == subprocess.check_output(["git", "show", baseline["commit"] + ":" + file], cwd=ROOT), file
    checks.append("COLLECTION_URL_ALIASES_AND_PS1_KNOWLEDGE_UNCHANGED")
    old_redirects = json.loads(subprocess.check_output(["git", "show", baseline["commit"] + ":data/catalog-route-redirects.json"], cwd=ROOT))
    redirects = load("data/catalog-route-redirects.json")
    assert len(redirects["redirects"]) == len(old_redirects["redirects"])
    for old, new in zip(old_redirects["redirects"], redirects["redirects"]):
        if old["targetCatalogId"].startswith("ps2-"):
            assert {k: v for k, v in old.items() if k != "targetLocator"} == {k: v for k, v in new.items() if k != "targetLocator"}
            target = next(g for g in catalog if g["id"] == new["targetCatalogId"])
            assert new["targetParam"] == target["canonicalSeoSlug"]
            assert new["targetLocator"]["region"] == target["region"]
            assert new["targetLocator"]["coverUrl"] == target["coverUrl"]
        else:
            assert old == new
    checks.append("EXISTING_REDIRECT_URLS_PRESERVED_WITH_CURRENT_PS2_LOCATOR")
    for kind in ["companies", "genres", "series"]:
        filename = f"data/index/{kind}.json"
        old = json.loads(subprocess.check_output(["git", "show", baseline["commit"] + ":" + filename], cwd=ROOT))
        new = load(filename)
        for key, entry in old.items():
            assert key in new
            for field in ["gameIds", "asDeveloper", "asPublisher", "asDigitalPublisher", "asPhysicalPublisherOrDistributor"]:
                assert [i for i in entry.get(field, []) if not i.startswith("ps2-")] == [i for i in new[key].get(field, []) if not i.startswith("ps2-")], (kind, key, field)
    checks.append("OTHER_PLATFORM_ENTITY_MEMBERSHIPS_PRESERVED")
    by_id = {g["id"]: g for g in catalog}
    assert len(by_id) == len(catalog)
    assert len(profiles) == sum(g["platformSlug"] == "ps2" for g in catalog)
    for old in baseline["catalog"]:
        assert old["id"] in by_id and old["slug"] == by_id[old["id"]]["slug"]
    for gid, profile in profiles.items():
        assert profile["physicalVariantResolved"] is False
        if profile["status"] == "resolved":
            assert profile["sources"] and profile["fieldProvenance"]["market"]
            assert by_id[gid]["marketRegion"]
        else:
            assert profile["reviewReasons"] and by_id[gid]["marketRegion"] is None
    checks.append("EVERY_EDITION_TRACEABLE_WITH_PHYSICAL_UNCERTAINTY")
    assets = load("artifacts/ps2-region-migration/assets.json.gz")
    assert len(assets) == 8811
    assert len({a["sha256"] for a in assets}) == len(assets)
    for asset in assets:
        assert asset["url"].startswith("/catalog-covers/ps2/galeria/") and ".." not in asset["url"]
        path = ART / "original-covers" / asset["url"].removeprefix("/catalog-covers/ps2/galeria/")
        assert path.stat().st_size == asset["bytes"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
        assert "psxdatacenter" not in asset["url"].lower()
    checks.append("8811_ORIGINALS_BYTE_IDENTICAL_AND_NAMED_BY_GAME")
    hosting = load("data/ps2-cover-hosting.json")
    publication = load("artifacts/ps2-region-migration/cover-publication.json.gz")
    assert hosting["origin"] == "https://rcu58incyx2s3rib.public.blob.vercel-storage.com" and hosting["access"] == "public"
    assert hosting["count"] == len(assets) == len(publication)
    assert hosting["bytes"] == sum(a["bytes"] for a in assets)
    manifest_content = gzip.decompress((ART / "assets.json.gz").read_bytes())
    assert hashlib.sha256(manifest_content).hexdigest() == hosting["assetManifestSha256"]
    published = {row["pathname"]: row for row in publication}
    assert len(published) == len(assets)
    for asset in assets:
        row = published[asset["url"].lstrip("/")]
        assert row["status"] == "verified" and row["sha256"] == asset["sha256"] and row["bytes"] == asset["bytes"]
        assert row["url"] == hosting["origin"] + asset["url"]
    checks.append("PUBLIC_CDN_PUBLICATION_MATCHES_EVERY_ARCHIVED_ORIGINAL")
    assigned = load("artifacts/ps2-region-migration/assigned-cover-evidence.json")
    for asset in assigned:
        game = by_id[asset["catalogId"]]
        assert asset["marketHints"] == [game["regionCode"]]
        assert "front_cover" in asset["roles"] and not asset.get("identifierDifference")
        assert not asset.get("thumbnailOnly")
        assert game["coverUrl"] == asset["url"]
    checks.append("ASSIGNED_COVERS_SAME_CODE_MARKET_EDITION")
    assert len(sources) == 11003
    assert all(p["sourceUrl"].startswith("https://psxdatacenter.com/") and not p["physicalVariantResolved"] for p in sources)
    ffx = next(p for p in sources if "SCES-50494" in p["codes"])
    assert ffx["languages"]["text"] == ["es"] and ffx["languages"]["audio"] == ["en"]
    assert not ffx["languages"]["discrepancy"]
    korea = next(p for p in sources if "SCKA-20099" in p["codes"])
    assert korea["market"]["code"] == "KR" and korea["languages"]["discrepancy"]
    for p in sources:
        assert not {a["value"] for a in p["accessoryCodes"]} & set(p["codes"])
    checks.append("LANGUAGE_SCOPE_KOREA_AND_ACCESSORY_CODES")
    result = {"status": "PASS", "checks": checks, "catalogRows": len(profiles), "statusCounts": dict(Counter(p["status"] for p in profiles.values())), "assignedCovers": len(assigned), "images": len(assets)}
    (ART / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
