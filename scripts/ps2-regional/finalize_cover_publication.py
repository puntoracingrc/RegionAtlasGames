"""Seal a complete public-download verification journal; never upload anything."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts/ps2-region-migration"
ORIGIN = "https://rcu58incyx2s3rib.public.blob.vercel-storage.com"
PREFIX = "/catalog-covers/ps2/galeria/"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--journal", type=Path, required=True)
    args = parser.parse_args()
    content = gzip.decompress((ART / "assets.json.gz").read_bytes())
    assets = json.loads(content)
    journal = [json.loads(line) for line in args.journal.read_text().splitlines() if line]
    by_path = {row["pathname"]: row for row in journal}
    expected = {a["url"].lstrip("/") for a in assets}
    assert len(assets) == len(expected) == 8811
    assert set(by_path) == expected, "The publication journal must contain exactly the complete PS2 archive"
    receipts = []
    for asset in assets:
        assert asset["url"].startswith(PREFIX) and ".." not in asset["url"]
        row = by_path[asset["url"].lstrip("/")]
        assert row["status"] == "verified" and row["url"] == ORIGIN + asset["url"]
        assert row["sha256"] == asset["sha256"] and row["bytes"] == asset["bytes"]
        assert row["etag"] and row["verifiedAt"]
        receipts.append(row)
    hosting = {"schemaVersion": 1, "storeId": "store_rcu58iNCyX2S3RIb", "access": "public", "region": "dub1",
               "origin": ORIGIN, "publicPathPrefix": PREFIX,
               "archivePath": "artifacts/ps2-region-migration/original-covers",
               "count": len(assets), "bytes": sum(a["bytes"] for a in assets),
               "assetManifestSha256": hashlib.sha256(content).hexdigest(),
               "verificationMethod": "public_download_sha256",
               "verifiedAt": max(row["verifiedAt"] for row in receipts)}
    (ROOT / "data/ps2-cover-hosting.json").write_text(json.dumps(hosting, indent=2) + "\n")
    (ART / "cover-publication.json.gz").write_bytes(gzip.compress(json.dumps(receipts, separators=(",", ":")).encode(), mtime=0))
    print(json.dumps(hosting))


if __name__ == "__main__":
    main()
