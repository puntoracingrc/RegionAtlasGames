"""Freeze PS2 inputs and retain named originals outside the application bundle."""
import argparse
import collections
import gzip
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
from urllib.parse import urlparse

from reference import ROOT, ART, SOURCES
from migrate import slug


def gz(path, value):
    path.write_bytes(gzip.compress(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--research", type=pathlib.Path, required=True)
    cli.add_argument("--base", required=True)
    args = cli.parse_args()
    SOURCES.mkdir(parents=True, exist_ok=True)
    def rows(name):
        return [json.loads(line) for line in (args.research / name).open()]
    facts = rows("game-facts.jsonl")
    assets = rows("graphic-assets.jsonl")
    archive = rows("cover-archive-manifest.jsonl")
    by_sha = collections.defaultdict(list)
    for item in archive:
        if item["status"] == "stored":
            by_sha[item["sha256"]].append(item)
    named = {}
    for sha, members in sorted(by_sha.items()):
        item = sorted(members, key=lambda r: r["sourceReferenceUrl"])[0]
        refs = item["pageReferences"]
        indexes = sorted([i for ref in refs for i in ref.get("indexReferences", [])], key=lambda i: (i["title"], i["serials"]))
        index = indexes[0]
        code = next(iter(index["serials"]), "sin-codigo")
        label = refs[0].get("label") or "referencia"
        label = re.sub(r"\bFRONT\b", "portada", label, flags=re.I)
        label = re.sub(r"\bBACK\b", "contraportada", label, flags=re.I)
        source = pathlib.Path(item["localPath"])
        url = f'/catalog-covers/ps2/galeria/{index["region"]}/{slug(index["title"])[:105]}-{slug(code)}-{slug(label)[:45]}-{sha[:10]}{source.suffix}'
        data = source.read_bytes()
        assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == sha, source
        destination = ART / "original-covers" / url.removeprefix("/catalog-covers/ps2/galeria/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            assert hashlib.sha256(destination.read_bytes()).hexdigest() == sha
        else:
            shutil.copyfile(source, destination)
        named[sha] = {"url": url, "sha256": sha, "bytes": len(data), "width": item["width"], "height": item["height"], "title": index["title"], "sourceReferences": sorted(r["sourceReferenceUrl"] for r in members)}
    for asset in assets:
        original = asset.get("archive")
        if original and original.get("sha256") in named:
            info = named[original["sha256"]]
            asset["archive"] = {k: v for k, v in original.items() if k not in ("localPath", "remotePath")}
            asset["archive"].update({"publicArchiveUrl": info["url"], "storageLocation": "regionatlas-static"})
    indexes = [{**r, "family": r["sourceRegion"], "sourceUrl": r["retrieval"]["url"], "sourceHash": r["retrieval"]["sha256"]} for r in rows("source-index-records.jsonl")]
    for name, value in [("psx-facts.json.gz", facts), ("psx-assets.json.gz", assets), ("psx-index.json.gz", indexes), ("psx-relationships.json.gz", rows("regional-relationships.jsonl")), ("curated-findings.json.gz", json.loads((args.research / "curated-findings.json").read_text()))]:
        gz(SOURCES / name, value)
    (SOURCES / "adjudications.json").write_text("{}\n")
    gz(ART / "assets.json.gz", list(named.values()))
    catalog_raw = subprocess.check_output(["git", "show", args.base + ":data/catalog.json"], cwd=ROOT)
    details_raw = subprocess.check_output(["git", "show", args.base + ":data/game-details.json"], cwd=ROOT)
    catalog = [g for g in json.loads(catalog_raw) if g["platformSlug"] == "ps2"]
    ids = {g["id"] for g in catalog}
    baseline = {"commit": args.base, "catalog": catalog, "details": {k: v for k, v in json.loads(details_raw).items() if k in ids}, "sourceHashes": {"catalog.json": hashlib.sha256(catalog_raw).hexdigest(), "game-details.json": hashlib.sha256(details_raw).hexdigest()}}
    gz(ART / "baseline-ps2.json.gz", baseline)
    batches = []
    batch = []
    size = 0
    for item in named.values():
        if batch and size + item["bytes"] > 350_000_000:
            batches.append({"files": batch, "bytes": size}); batch = []; size = 0
        batch.append("artifacts/ps2-region-migration/original-covers/" + item["url"].removeprefix("/catalog-covers/ps2/galeria/")); size += item["bytes"]
    if batch:
        batches.append({"files": batch, "bytes": size})
    (ART / "asset-batches.json").write_text(json.dumps(batches, indent=2) + "\n")
    print(json.dumps({"baselineRows": len(catalog), "sourceRows": len(indexes), "pages": len(facts), "archivedImages": len(named), "imageBytes": sum(i["bytes"] for i in named.values()), "batches": len(batches)}))


if __name__ == "__main__":
    main()
