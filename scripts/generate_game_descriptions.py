#!/usr/bin/env python3
"""Genera descripciones originales para fichas del catálogo (Wikipedia + IA / plantilla)."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.catalog_ai_match import ai_available  # noqa: E402
from collectors.game_description_ai import (  # noqa: E402
    REPORT_FILE,
    build_description_for_game,
    description_model,
)
from collectors.game_details_lib import load_json, save_json  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
REQUEST_DELAY = 0.2
SAVE_EVERY = 25


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera descripciones para fichas de juego")
    parser.add_argument("--platforms", help="Slugs separados por coma")
    parser.add_argument("--limit", type=int, help="Máximo de juegos")
    parser.add_argument("--force", action="store_true", help="Regenera aunque exista caché")
    parser.add_argument("--no-ai", action="store_true", help="Solo plantilla factual (sin OpenAI)")
    parser.add_argument("--with-details-only", action="store_true", help="Solo juegos con metadatos")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE, [])
    details: dict[str, dict] = load_json(DETAILS_FILE, {})

    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and (not platform_filter or g["platformSlug"] in platform_filter)
        and (not args.with_details_only or details.get(g["id"]))
    ]
    if args.limit:
        targets = targets[: args.limit]

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "targets": len(targets),
        "aiAvailable": ai_available(),
        "model": description_model() if ai_available() and not args.no_ai else None,
        "generated": 0,
        "ai": 0,
        "template": 0,
        "skipped": 0,
        "errors": 0,
    }

    print(
        f"Descripciones: {len(targets)} juegos · "
        f"IA={'sí' if ai_available() and not args.no_ai else 'no (plantilla)'}"
    )

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        existing = details.get(game_id) or {}

        if existing.get("description") and existing.get("seoMeta") and not args.force:
            report["skipped"] += 1
            continue

        try:
            result = build_description_for_game(
                game,
                details.get(game_id),
                force=args.force,
                use_ai=not args.no_ai,
            )
            if not result:
                report["errors"] += 1
                continue

            if not args.dry_run:
                entry = details.setdefault(game_id, {})
                entry["description"] = result["description"]
                entry["descriptionMeta"] = {
                    "generatedAt": result.get("generatedAt"),
                    "method": result.get("method"),
                    "model": result.get("model"),
                    "referenceUsed": result.get("referenceUsed"),
                    "referenceUrl": result.get("referenceUrl"),
                }
                if result.get("seoMeta"):
                    entry["seoMeta"] = result["seoMeta"]
                if not entry.get("fetchedAt"):
                    entry["fetchedAt"] = result.get("generatedAt")

            report["generated"] += 1
            if result.get("method") == "ai":
                report["ai"] += 1
            else:
                report["template"] += 1
        except Exception:
            report["errors"] += 1

        time.sleep(REQUEST_DELAY)

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_json(DETAILS_FILE, details)
            print(
                f"  [{idx}/{len(targets)}] gen={report['generated']} "
                f"ai={report['ai']} tpl={report['template']} skip={report['skipped']}"
            )

    if not args.dry_run:
        save_json(DETAILS_FILE, details)
        save_json(REPORT_FILE, report)

    print(
        f"\nHecho: {report['generated']} nuevas ({report['ai']} IA, {report['template']} plantilla), "
        f"{report['skipped']} omitidas, {report['errors']} errores"
    )
    if not args.dry_run:
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
