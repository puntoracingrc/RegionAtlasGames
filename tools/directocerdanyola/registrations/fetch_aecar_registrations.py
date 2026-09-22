#!/usr/bin/env python3
"""Capture the public Cerdanyola GT8 pre-registration lists from AECAR.

Only fields needed by the race simulator are retained. Contact, payment and
equipment fields are intentionally excluded from the generated snapshot.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "aecar-cerdanyola-provisional.json"
CATEGORIES = {
    "NITRO": "https://www.aecar.org/inscripciones.php?tipo=ins_rg__63",
    "ECO": "https://www.aecar.org/inscripciones.php?tipo=ins_rg__64",
}


class RegistrationTableParser(HTMLParser):
    TABLES = {
        "tab_insc_nacionales": "confirmed",
        "tab_insc_nacionalesPdte": "unconfirmed",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.status: str | None = None
        self.in_row = False
        self.in_cell = False
        self.cell_parts: list[str] = []
        self.row: list[str] = []
        self.rows: dict[str, list[list[str]]] = {"confirmed": [], "unconfirmed": []}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "tbody" and attributes.get("id") in self.TABLES:
            self.status = self.TABLES[attributes["id"]]
        elif tag == "tr" and self.status:
            self.in_row = True
            self.row = []
        elif tag == "td" and self.in_row:
            self.in_cell = True
            self.cell_parts = []
        elif tag == "br" and self.in_cell:
            self.cell_parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self.in_cell:
            self.row.append(" ".join("".join(self.cell_parts).split()))
            self.in_cell = False
        elif tag == "tr" and self.in_row:
            if self.row and self.status:
                self.rows[self.status].append(self.row)
            self.in_row = False
        elif tag == "tbody" and self.status:
            self.status = None


def fetch(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "RegionAtlas-CerdanyolaSnapshot/1.0 (+https://www.regionatlas.games/)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def entrant(row: list[str], source_status: str) -> dict[str, object]:
    if len(row) < 10:
        raise ValueError(f"Fila AECAR incompleta ({len(row)} columnas): {row!r}")
    rank = int(row[2]) if row[2].isdigit() else None
    return {
        "name": row[1].strip(),
        "rank": rank,
        "zone": row[8].strip(),
        "licenceStatus": row[9].strip(),
        "sourceStatus": source_status,
        "registeredAt": datetime.strptime(row[0], "%d/%m/%Y %H:%M")
        .replace(tzinfo=ZoneInfo("Europe/Madrid"))
        .isoformat(),
        "assumedParticipant": True,
    }


def parse_category(raw: bytes, source_url: str) -> dict[str, object]:
    text = raw.decode("utf-8", errors="replace")
    parser = RegistrationTableParser()
    parser.feed(text)
    confirmed = [entrant(row, "confirmed") for row in parser.rows["confirmed"]]
    unconfirmed = [entrant(row, "unconfirmed") for row in parser.rows["unconfirmed"]]
    if not confirmed and not unconfirmed:
        raise ValueError(f"AECAR no devolvio ninguna fila reconocible para {source_url}")
    close_match = re.search(r"Fin de inscripciones:\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})", text)
    event_match = re.search(r"Fecha:\s*(\d{2}/\d{2}/\d{4})", text)
    if not close_match or not event_match:
        raise ValueError(f"AECAR no devolvio las fechas esperadas para {source_url}")
    close_time = datetime.strptime(" ".join(close_match.groups()), "%d/%m/%Y %H:%M").replace(tzinfo=ZoneInfo("Europe/Madrid"))
    event_date = datetime.strptime(event_match.group(1), "%d/%m/%Y").date().isoformat()
    return {
        "sourceUrl": source_url,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "eventDate": event_date,
        "closesAt": close_time.isoformat(),
        "counts": {
            "total": len(confirmed) + len(unconfirmed),
            "confirmed": len(confirmed),
            "unconfirmed": len(unconfirmed),
        },
        "entrants": confirmed + unconfirmed,
    }


def main() -> None:
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument("--nitro-html", type=Path)
    argument_parser.add_argument("--eco-html", type=Path)
    argument_parser.add_argument("--output", type=Path, default=OUTPUT)
    args = argument_parser.parse_args()

    inputs = {"NITRO": args.nitro_html, "ECO": args.eco_html}
    now = datetime.now(ZoneInfo("Europe/Madrid"))
    categories: dict[str, object] = {}
    for category, url in CATEGORIES.items():
        raw = inputs[category].read_bytes() if inputs[category] else fetch(url)
        categories[category] = parse_category(raw, url)

    closes_at = min(datetime.fromisoformat(item["closesAt"]) for item in categories.values())
    snapshot = {
        "schemaVersion": 1,
        "eventId": "cerdanyola-gt8-2026",
        "eventName": "Cerdanyola 3.ª prueba del Nacional de GT8",
        "organizer": "MODELCAR",
        "status": "open" if now < closes_at else "closed_unverified",
        "capturedAt": now.isoformat(timespec="seconds"),
        "assumption": "Todos los pilotos visibles se incluyen provisionalmente en las simulaciones; sourceStatus no equivale a participación definitiva.",
        "privacy": "Solo se conservan nombre, ranking, zona, estado de licencia, estado visible y fecha de inscripción.",
        "categories": categories,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Guardado {args.output}: "
        + ", ".join(f"{category} {data['counts']['total']}" for category, data in categories.items())
    )


if __name__ == "__main__":
    main()
