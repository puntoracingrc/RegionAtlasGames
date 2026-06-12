#!/usr/bin/env python3
"""Genera plantillas JSON para ingest manual de precios ES (Fase 1).

Uso:
  python3 scripts/build_ingest_template.py --platform ps4 --limit 25
  python3 scripts/build_ingest_template.py --platform ps2 --validate data/price-ingest/pilot-ps2.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
INGEST_DIR = ROOT / "data" / "price-ingest"

ES_MARKET_EXCLUDE = {"usa", "japón", "japan", "australia", "pal uk/eng", "pal alemania"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_catalog() -> list[dict[str, Any]]:
    return json.loads(CATALOG_FILE.read_text(encoding="utf-8"))


def es_market_games(platform_slug: str, region: str | None = None) -> list[dict[str, Any]]:
    games = [
        g
        for g in load_catalog()
        if g.get("platformSlug") == platform_slug
        and g.get("listingStatus") != "excluded"
        and (g.get("region") or "").strip().lower() not in ES_MARKET_EXCLUDE
    ]
    if region:
        games = [g for g in games if g.get("region") == region]
    return sorted(games, key=lambda g: g["title"].lower())


def placeholder_listing(game: dict[str, Any]) -> dict[str, Any]:
    region = game.get("region") or "PAL España"
    evidence = ["cover_spain"] if region == "PAL España" else ["cover_pal_eu"]
    return {
        "catalogId": game["id"],
        "source": "wallapop",
        "listingType": "active",
        "priceEur": None,
        "listingRegion": region,
        "regionVerified": True,
        "regionEvidence": evidence,
        "notes": f"Rellenar precio manual — {game['title']}",
    }


def build_template(platform_slug: str, limit: int | None, region: str | None) -> dict[str, Any]:
    games = es_market_games(platform_slug, region)
    if limit:
        games = games[:limit]
    return {
        "platformSlug": platform_slug,
        "collectedAt": now_iso(),
        "notes": "Plantilla Fase 1 — sustituir priceEur: null por precios reales y añadir más anuncios.",
        "listings": [placeholder_listing(g) for g in games],
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
    }


def validate_ingest(path: Path) -> int:
    ingest = json.loads(path.read_text(encoding="utf-8"))
    platform_slug = ingest.get("platformSlug", "")
    catalog_by_id = {g["id"]: g for g in load_catalog()}
    errors: list[str] = []

    for idx, row in enumerate(ingest.get("listings") or [], start=1):
        cid = str(row.get("catalogId", "")).strip()
        if not cid:
            errors.append(f"listings[{idx}]: falta catalogId")
            continue
        game = catalog_by_id.get(cid)
        if not game:
            errors.append(f"listings[{idx}]: catalogId desconocido '{cid}'")
            continue
        if game.get("platformSlug") != platform_slug:
            errors.append(f"listings[{idx}]: {cid} es {game.get('platformSlug')}, no {platform_slug}")
        if row.get("priceEur") is None:
            errors.append(f"listings[{idx}]: {cid} sin priceEur")
        if row.get("regionVerified") is not True:
            errors.append(f"listings[{idx}]: {cid} regionVerified != true")
            continue
        evidence = [str(e) for e in (row.get("regionEvidence") or [])]
        catalog_region = str(game.get("region") or "")
        ai = row.get("aiConfidence")
        ai_val = float(ai) if ai is not None else None
        ok, reason = check_listing_evidence_meets_rules(
            platform_slug, catalog_region, evidence, ai_val
        )
        if not ok:
            errors.append(f"listings[{idx}]: {cid} evidencia rechazada ({reason})")

    for idx, row in enumerate(ingest.get("cex") or [], start=1):
        cid = str(row.get("catalogId", "")).strip()
        game = catalog_by_id.get(cid)
        if not game:
            errors.append(f"cex[{idx}]: catalogId desconocido '{cid}'")

    ids_in_listings = {str(r.get("catalogId")) for r in ingest.get("listings") or []}
    print(f"Archivo: {path.name}")
    print(f"  Plataforma: {platform_slug}")
    print(f"  Anuncios: {len(ingest.get('listings') or [])}")
    print(f"  Juegos únicos P2P: {len(ids_in_listings)}")
    print(f"  CeX: {len(ingest.get('cex') or [])}")

    if errors:
        print(f"\n  Errores ({len(errors)}):")
        for err in errors[:20]:
            print(f"    - {err}")
        if len(errors) > 20:
            print(f"    ... y {len(errors) - 20} más")
        return 1

    print("\n  OK — listo para sync_es_prices.py")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Plantillas y validación ingest precios ES")
    parser.add_argument("--platform", help="Slug plataforma (ps4, ps2, dreamcast…)")
    parser.add_argument("--region", help="Filtrar región catálogo (p. ej. PAL España)")
    parser.add_argument("--limit", type=int, default=25, help="Máximo juegos en plantilla")
    parser.add_argument("--output", type=Path, help="Ruta salida JSON")
    parser.add_argument("--validate", type=Path, help="Validar ingest existente")
    args = parser.parse_args()

    if args.validate:
        raise SystemExit(validate_ingest(args.validate))

    if not args.platform:
        parser.error("Indica --platform o --validate")

    INGEST_DIR.mkdir(parents=True, exist_ok=True)
    out = args.output or INGEST_DIR / f"template-{args.platform}.json"
    payload = build_template(args.platform, args.limit, args.region)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Plantilla: {out} ({len(payload['listings'])} juegos)")


if __name__ == "__main__":
    main()
