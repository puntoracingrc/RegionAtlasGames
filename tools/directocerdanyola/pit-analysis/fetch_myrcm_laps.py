#!/usr/bin/env python3
"""Capture public MyRCM lap tables as a small, auditable JSON fixture."""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

EVENT = "100645"
SECTION = "398202"
REPORTS = [
    ("1135", "qualy", "Clasificatoria 1 · Grupo 1"),
    ("1136", "qualy", "Clasificatoria 2 · Grupo 1"),
    ("1138", "qualy", "Clasificatoria 1 · Grupo 2"),
    ("1139", "qualy", "Clasificatoria 2 · Grupo 2"),
    ("1150", "final", "Final"),
]


class LapTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_cell = False
        self.cell = []
        self.row = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "table" and not self.in_table and "run-lap-table" in values.get("class", ""):
            self.in_table = True
            return
        if not self.in_table:
            return
        if tag == "tr":
            self.row = []
        if tag in ("th", "td"):
            self.in_cell = True
            self.cell = []

    def handle_data(self, data):
        if self.in_cell:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if not self.in_table:
            return
        if tag in ("th", "td") and self.in_cell:
            self.row.append(" ".join("".join(self.cell).split()))
            self.in_cell = False
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None
        elif tag == "table":
            self.in_table = False


def seconds(value: str):
    value = re.sub(r"^\(\d+\)\s*", "", value.strip())
    try:
        parts = [float(item) for item in value.split(":")]
    except (TypeError, ValueError):
        return None
    return parts[-1] + (parts[-2] * 60 if len(parts) > 1 else 0) + (parts[-3] * 3600 if len(parts) > 2 else 0)


def fetch_report(report_key: str, report_type: str):
    query = urlencode({"reportKey": report_key, "reportType": report_type, "cType": "json", "ajax": "true"})
    url = f"https://www.myrcm.ch/en/report/{EVENT}/{SECTION}?{query}"
    request = Request(url, headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest", "User-Agent": "PuntoRacing research capture"})
    with urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8")), url


def parse_report(payload, key, report_type, label, source_url):
    parser = LapTableParser()
    parser.feed("".join(payload.get("DATA", [])))
    if not parser.rows:
        raise RuntimeError(f"MyRCM did not expose a lap table for report {key}")
    names = parser.rows[0][1:]
    drivers = {name: [] for name in names}
    start_offsets = {}
    for row in parser.rows[1:]:
        if not row or not row[0].isdigit():
            continue
        lap = int(row[0])
        for index, name in enumerate(names, 1):
            if index >= len(row):
                continue
            value = seconds(row[index])
            if value and lap == 0:
                start_offsets[name] = round(value, 3)
            elif value:
                drivers[name].append({"lap": lap, "seconds": round(value, 3)})
    return {"reportKey": key, "reportType": report_type, "label": label, "sourceUrl": source_url, "startOffsets": start_offsets, "drivers": drivers}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, help="Read existing myrcm-398202-REPORT.json captures instead of downloading")
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("event-100645-laps.json"))
    args = parser.parse_args()
    reports = []
    for key, report_type, label in REPORTS:
        if args.source_dir:
            payload = json.loads((args.source_dir / f"myrcm-398202-{key}.json").read_text())
            source_url = f"https://www.myrcm.ch/en/report/{EVENT}/{SECTION}?reportKey={key}&reportType={report_type}"
        else:
            payload, source_url = fetch_report(key, report_type)
        reports.append(parse_report(payload, key, report_type, label, source_url))
    output = {
        "schemaVersion": 1,
        "eventKey": EVENT,
        "sectionKey": SECTION,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "status": "public-read-only",
        "note": "Lap 0 start offsets are retained separately and never count as a completed lap. Counted lap times remain the public MyRCM transponder durations; pit/incident labels are inferred elsewhere.",
        "reports": reports,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {args.output} with {len(reports)} reports")


if __name__ == "__main__":
    main()
