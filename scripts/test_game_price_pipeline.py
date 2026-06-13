#!/usr/bin/env python3
"""Prueba end-to-end de precios por estado para un juego concreto."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.condition_buckets import BUCKET_LABELS_ES, mean_by_bucket, source_weight  # noqa: E402
from collectors.condition_resolve import reset_vision_stats, resolve_condition_bucket, vision_stats  # noqa: E402
from collectors.condition_vision import vision_available  # noqa: E402
from sync_es_prices import (  # noqa: E402
    apply_condition_price_estimates,
    collect_condition_observations,
    group_by_catalog_id,
    pick_best_tc_rows,
)


def load_ingest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def rows_for_game(ingest: dict[str, Any], catalog_id: str) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for row in ingest.get("listings") or []:
        if str(row.get("catalogId") or "") == catalog_id:
            out.append(("listings/P2P", row))
    for key in ("cex", "jgo", "chollo", "kaoto", "tcns"):
        for row in ingest.get(key) or []:
            if str(row.get("catalogId") or "") == catalog_id:
                out.append((key, row))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Prueba pipeline precio por juego")
    parser.add_argument("--platform", default="dreamcast")
    parser.add_argument("--catalog-id", required=True)
    parser.add_argument("--input", type=Path, help="JSON ingest mergeado")
    parser.add_argument("--no-vision", action="store_true")
    args = parser.parse_args()

    ingest_path = args.input or ROOT / "data" / "price-ingest" / f"{args.platform}.json"
    if not ingest_path.exists():
        raise SystemExit(f"No existe {ingest_path}")

    catalog = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))
    game = next((g for g in catalog if g.get("id") == args.catalog_id), None)
    if not game:
        raise SystemExit(f"Juego no encontrado: {args.catalog_id}")

    ingest = load_ingest(ingest_path)
    use_vision = not args.no_vision and vision_available()

    print(f"=== {game['title']} ({game['region']}) ===")
    print(f"ID: {args.catalog_id}")
    print(f"Visión IA: {'sí' if use_vision else 'no (export OPENAI_API_KEY)'}")
    print()

    reset_vision_stats()
    platform_slug = args.platform
    catalog_region = str(game.get("region") or "")

    for label, row in rows_for_game(ingest, args.catalog_id):
        bucket, method = resolve_condition_bucket(
            row,
            platform_slug=platform_slug,
            use_vision=use_vision,
            fetch_images=True,
        )
        price = row.get("priceEur") or row.get("sellPriceEur") or row.get("retailPriceEur")
        src = str(row.get("source") or label).lower()
        w = source_weight(src)
        print(f"[{src}] {price} € · peso {w} · estado={bucket or '?'} ({method})")
        print(f"  {(row.get('title') or '')[:80]}")
        if row.get("imageUrls"):
            print(f"  imgs: {len(row['imageUrls'])}")
        print()

    grouped = group_by_catalog_id(ingest.get("listings") or [])
    cex_by_id = {str(r["catalogId"]): r for r in (ingest.get("cex") or []) if r.get("catalogId")}
    jgo_by_id = {str(r["catalogId"]): r for r in (ingest.get("jgo") or []) if r.get("catalogId")}
    chollo_by_id = {str(r["catalogId"]): r for r in (ingest.get("chollo") or []) if r.get("catalogId")}
    kaoto_by_id = {str(r["catalogId"]): r for r in (ingest.get("kaoto") or []) if r.get("catalogId")}
    tcns_by_id = {str(r["catalogId"]): r for r in (ingest.get("tcns") or []) if r.get("catalogId")}
    tc_by_id = pick_best_tc_rows(grouped)

    observations = collect_condition_observations(
        args.catalog_id,
        catalog_region,
        platform_slug,
        grouped=grouped,
        cex_by_id=cex_by_id,
        jgo_by_id=jgo_by_id,
        chollo_by_id=chollo_by_id,
        kaoto_by_id=kaoto_by_id,
        tcns_by_id=tcns_by_id,
        tc_by_id=tc_by_id,
        use_vision=use_vision,
    )
    estimates, sources = mean_by_bucket(observations)

    print("=== Observaciones usadas ===")
    for price, bucket, source in observations:
        print(f"  {BUCKET_LABELS_ES[bucket]}: {price} € ({source}, peso {source_weight(source)})")

    print("\n=== Medias ponderadas ===")
    for bucket in ("loose", "complete", "sealed"):
        val = estimates.get(bucket)
        if val is not None:
            print(f"  {BUCKET_LABELS_ES[bucket]}: {val} €")

    if not any(estimates.get(b) is not None for b in ("loose", "complete", "sealed")):
        print("  (ninguna — faltan condición o región verificada)")

    print(f"\nFuentes: {' · '.join(sorted(sources))}")
    print(f"Visión: {vision_stats()}")

    dry_game = dict(game)
    if apply_condition_price_estimates(
        dry_game,
        observations,
        synced_at="test",
        pc_ref=game.get("pcRefPrice"),
    ):
        print("\n=== Campos catálogo (simulado) ===")
        print(f"  estimatedPriceLoose: {dry_game.get('estimatedPriceLoose')}")
        print(f"  estimatedPriceComplete: {dry_game.get('estimatedPriceComplete')}")
        print(f"  estimatedPriceSealed: {dry_game.get('estimatedPriceSealed')}")
        print(f"  recommendedPrice: {dry_game.get('recommendedPrice')}")
        print(f"  priceDataSources: {dry_game.get('priceDataSources')}")


if __name__ == "__main__":
    main()
