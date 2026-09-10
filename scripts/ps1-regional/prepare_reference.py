"""Freeze factual research inputs; never modify the historical extraction package."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/ps1-region-migration/sources"


def write_gzip(name, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    (OUT / name).write_bytes(gzip.compress(raw, mtime=0))
    return {"file": name, "sha256": hashlib.sha256(raw).hexdigest(), "uncompressedBytes": len(raw)}


class IndexCells(HTMLParser):
    """Classed cells are authoritative even when the old HTML omits <tr>."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.cells = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "td" and re.fullmatch(r"col[1-8]", attrs.get("class", "")):
            self.current = {"class": attrs["class"], "parts": [], "links": []}
            self.cells.append(self.current)
        elif tag == "a" and self.current is not None and attrs.get("href"):
            self.current["links"].append(attrs["href"])
        elif tag == "br" and self.current is not None:
            self.current["parts"].append(" ")

    def handle_endtag(self, tag):
        if tag == "td":
            self.current = None

    def handle_data(self, value):
        if self.current is not None:
            self.current["parts"].append(value)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--research", required=True, type=Path)
    args = cli.parse_args()
    source = args.research
    OUT.mkdir(parents=True, exist_ok=True)
    provenance = []
    facts = [json.loads(x) for x in (source / "game-facts.jsonl").open()]
    provenance.append(write_gzip("psx-facts.json.gz", facts))
    relations = [json.loads(x) for x in (source / "regional-relationships.jsonl").open()]
    provenance.append(write_gzip("psx-relationships.json.gz", relations))
    assets = []
    for line in (source / "graphic-assets.jsonl").open():
        row = json.loads(line)
        if set(row["types"]) & {"front_cover", "back_cover", "disc_label", "page_identity_cover", "manual_page", "interior_or_inlay", "spine_card", "box_paper_scan"}:
            assets.append(row)
    provenance.append(write_gzip("psx-assets.json.gz", assets))
    provenance.append(write_gzip("psx-manuals-index.json.gz", json.loads((source / "manuals-index.json").read_text())))
    index_rows = []
    comparison = []
    for family in ["pal", "ntsc-u", "ntsc-j"]:
        old = json.loads((source / (family + "-index.json")).read_text())
        url = old["source"]["url"]
        raw = (source / ".source-cache" / (hashlib.sha256(url.encode()).hexdigest() + ".html")).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == old["source"]["sha256"]
        parser = IndexCells()
        parser.feed(raw.decode(old["source"]["encoding"]))
        assert len(parser.cells) % 4 == 0
        rows = []
        for pos in range(0, len(parser.cells), 4):
            cells = parser.cells[pos:pos + 4]
            assert [c["class"] for c in cells] in [["col1", "col2", "col3", "col4"], ["col5", "col6", "col7", "col8"]]
            text = [" ".join(" ".join(c["parts"]).split()) for c in cells]
            urls = sorted({urljoin(url, link) for c in cells for link in c["links"] if re.search(r"games/.*\.html?$", link, re.I)})
            row = {"row": len(rows) + 1, "family": family, "serialText": text[1], "title": text[2], "languageTags": re.findall(r"\[([^]]+)\]", text[3]), "languageText": text[3], "infoUrls": urls, "sourceUrl": url, "sourceHash": old["source"]["sha256"]}
            rows.append(row)
        index_rows.extend(rows)
        old_keys = {(r["serialText"], r["title"]) for r in old["records"]}
        comparison.append({"family": family, "previousRows": len(old["records"]), "auditedRows": len(rows), "recoveredRows": [r for r in rows if (r["serialText"], r["title"]) not in old_keys], "spanishRows": sum("S" in r["languageTags"] for r in rows)})
    provenance.append(write_gzip("psx-index.json.gz", index_rows))
    (OUT / "psx-source-integrity.json").write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + "\n")
    (OUT / "psx-input-manifest.json").write_text(json.dumps({"historicalPackage": str(source), "inputs": provenance}, indent=2) + "\n")
    print(json.dumps({"facts": len(facts), "assets": len(assets), "indexes": comparison}, ensure_ascii=False))


if __name__ == "__main__":
    main()
