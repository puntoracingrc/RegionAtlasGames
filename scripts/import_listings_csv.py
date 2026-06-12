#!/usr/bin/env python3
"""Importa anuncios desde CSV a un JSON de ingest (Fase 1 → 2).

CSV esperado (cabecera obligatoria):
  catalogId,source,priceEur,listingRegion,regionEvidence,listingType,aiConfidence

regionEvidence: códigos separados por | (p. ej. cover_spain|photo_region_mark)
listingType: active|sold (default active)
aiConfidence: opcional

Ejemplo:
  python3 scripts/import_listings_csv.py \\
    --platform ps2 \\
    --input data/price-ingest/manual/ps2-batch1.csv \\
    --output data/price-ingest/pilot-ps2.json \\
    --merge
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402

VALID_SOURCES = {"wallapop", "ebay-es", "vinted-es", "other"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_evidence(raw: str) -> list[str]:
    return [e.strip() for e in raw.split("|") if e.strip()]


def row_to_listing(row: dict[str, str]) -> dict:
    evidence = parse_evidence(row.get("regionEvidence", ""))
    listing: dict = {
        "catalogId": row["catalogId"].strip(),
        "source": row.get("source", "wallapop").strip().lower(),
        "listingType": row.get("listingType", "active").strip() or "active",
        "priceEur": float(row["priceEur"]),
        "listingRegion": row["listingRegion"].strip(),
        "regionVerified": True,
        "regionEvidence": evidence,
    }
    if row.get("aiConfidence", "").strip():
        listing["aiConfidence"] = float(row["aiConfidence"])
    return listing


def load_existing(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {
        "platformSlug": "",
        "collectedAt": now_iso(),
        "listings": [],
        "cex": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="CSV → ingest JSON")
    parser.add_argument("--platform", required=True, help="Slug plataforma")
    parser.add_argument("--input", type=Path, required=True, help="CSV de anuncios")
    parser.add_argument("--output", type=Path, required=True, help="JSON ingest destino")
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Añadir al JSON existente en lugar de reemplazar listings",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"No existe: {args.input}")

    rows: list[dict[str, str]] = []
    with args.input.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        required = {"catalogId", "priceEur", "listingRegion", "regionEvidence"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise SystemExit(f"CSV debe incluir columnas: {', '.join(sorted(required))}")
        for row in reader:
            if not row.get("catalogId", "").strip():
                continue
            src = row.get("source", "wallapop").strip().lower()
            if src not in VALID_SOURCES:
                raise SystemExit(f"source inválido '{src}' en {row['catalogId']}")
            rows.append(row)

    new_listings = [row_to_listing(r) for r in rows]
    payload = load_existing(args.output) if args.merge else {
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "listings": [],
        "cex": [],
    }
    payload["platformSlug"] = args.platform
    payload["collectedAt"] = now_iso()
    if args.merge:
        payload.setdefault("listings", []).extend(new_listings)
    else:
        payload["listings"] = new_listings

    print(f"Filas CSV: {len(rows)} → {len(payload['listings'])} anuncios en JSON")

    if args.dry_run:
        print("Dry-run: no escrito.")
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Escrito: {args.output}")

    code = validate_ingest(args.output)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
