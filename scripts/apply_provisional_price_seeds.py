#!/usr/bin/env python3
"""Aplica lotes curatoriales como precios orientativos de entrada.

Cada rango aporta un unico punto medio. Si ya existe un precio del mismo
estado, ambos valores se promedian una sola vez. Los lotes son idempotentes y
nunca convierten el resultado en precio verificado.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
DEFAULT_INPUT = ROOT / "data" / "provisional-price-seeds.json"

CONDITION_FIELDS = {
    "loose": "estimatedPriceLoose",
    "game_manual": "estimatedPriceGameManual",
    "complete": "estimatedPriceComplete",
    "sealed": "estimatedPriceSealed",
    "new_retail": "estimatedPriceNewRetail",
}
PRIMARY_CONDITION_ORDER = ("complete", "game_manual", "loose", "sealed", "new_retail")
SHIPPING_FIELDS = {
    "loose": "estimatedShippingToSpainLoose",
    "game_manual": "estimatedShippingToSpainGameManual",
    "complete": "estimatedShippingToSpainComplete",
    "sealed": "estimatedShippingToSpainSealed",
}
TOTAL_FIELDS = {
    "loose": "estimatedTotalToSpainLoose",
    "game_manual": "estimatedTotalToSpainGameManual",
    "complete": "estimatedTotalToSpainComplete",
    "sealed": "estimatedTotalToSpainSealed",
}
PROVISIONAL_LABEL = "Estimación provisional"
MONEY_QUANTUM = Decimal("0.01")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def money(value: Any) -> float:
    return float(Decimal(str(value)).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP))


def midpoint(price_range: dict[str, Any]) -> float:
    minimum = Decimal(str(price_range["minimum"]))
    maximum = Decimal(str(price_range.get("maximum", minimum)))
    if minimum <= 0 or maximum <= 0 or maximum < minimum:
        raise ValueError(f"Rango invalido: {price_range!r}")
    return money((minimum + maximum) / 2)


def merge_label(previous: Any, label: str) -> str:
    parts = [part.strip() for part in str(previous or "").replace("/", "·").split("·") if part.strip()]
    parts = [
        label if part.casefold() in {"estimacion provisional", "estimación provisional"} else part
        for part in parts
    ]
    parts = list(dict.fromkeys(parts))
    if label not in parts:
        parts.append(label)
    return " · ".join(parts)


def condition_value(game: dict[str, Any], condition: str) -> float | None:
    field = CONDITION_FIELDS[condition]
    value = game.get(field)
    if value is not None:
        return money(value)

    # Parte del catalogo antiguo solo tenia recommendedPrice. Se considera
    # completo unicamente cuando no existe ningun desglose por estado.
    if condition == "complete" and not any(game.get(name) is not None for name in CONDITION_FIELDS.values()):
        recommended = game.get("recommendedPrice")
        if recommended is not None:
            return money(recommended)
    return None


def selected_price(game: dict[str, Any]) -> float | None:
    for condition in PRIMARY_CONDITION_ORDER:
        value = game.get(CONDITION_FIELDS[condition])
        if value is not None:
            return money(value)
    return None


def update_derived_price_fields(
    game: dict[str, Any],
    *,
    applied_at: str,
    batch_id: str,
    preserve_region_verified: bool = False,
) -> None:
    recommended = selected_price(game)
    condition_values = [
        money(game[field])
        for field in CONDITION_FIELDS.values()
        if game.get(field) is not None
    ]
    game["recommendedPrice"] = recommended
    game["marketMin"] = min(condition_values) if condition_values else None
    game["marketMax"] = max(condition_values) if condition_values else None
    game["hasEsPrice"] = recommended is not None
    game["priceRegionVerified"] = True if preserve_region_verified else False
    game["priceSource"] = merge_label(game.get("priceSource"), PROVISIONAL_LABEL)
    game["priceDataSources"] = merge_label(game.get("priceDataSources"), PROVISIONAL_LABEL)
    game["updatedAt"] = applied_at
    batches = [str(value) for value in (game.get("provisionalPriceBatchIds") or [])]
    if batch_id not in batches:
        batches.append(batch_id)
    game["provisionalPriceBatchIds"] = batches
    game["provisionalPriceUpdatedAt"] = applied_at

    for condition, price_field in CONDITION_FIELDS.items():
        price = game.get(price_field)
        shipping_field = SHIPPING_FIELDS.get(condition)
        if not shipping_field:
            continue
        shipping = game.get(shipping_field)
        if price is None or shipping is None:
            continue
        game[TOTAL_FIELDS[condition]] = money(Decimal(str(price)) + Decimal(str(shipping)))

    pc_ref = game.get("pcRefPrice")
    if recommended is not None and isinstance(pc_ref, (int, float)) and pc_ref:
        game["deltaEsVsPc"] = round(((recommended - float(pc_ref)) / float(pc_ref)) * 100, 1)
    elif recommended is None:
        game["deltaEsVsPc"] = None


def should_preserve_region_verified(before: dict[str, Any], after: dict[str, Any]) -> bool:
    if before.get("priceRegionVerified") is not True:
        return False
    previous = before.get("recommendedPrice")
    current = selected_price(after)
    return previous is not None and current is not None and money(previous) == money(current)


def validate_batch(payload: dict[str, Any]) -> None:
    if payload.get("schemaVersion") != 1:
        raise ValueError("schemaVersion debe ser 1")
    if not str(payload.get("batchId") or "").strip():
        raise ValueError("Falta batchId")
    if not str(payload.get("platformSlug") or "").strip():
        raise ValueError("Falta platformSlug")
    if not str(payload.get("region") or "").strip():
        raise ValueError("Falta region")
    entries = payload.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError("entries debe contener al menos una fila")


def apply_batch(
    catalog: list[dict[str, Any]],
    payload: dict[str, Any],
    *,
    applied_at: str,
) -> dict[str, Any]:
    validate_batch(payload)
    batch_id = str(payload["batchId"])
    platform_slug = str(payload["platformSlug"])
    region = str(payload["region"])
    by_id = {str(game.get("id") or ""): game for game in catalog}
    seen_ids: set[str] = set()
    updated_ids: set[str] = set()
    fields_updated = 0
    derived_rows_reconciled = 0
    accepted_entries = 0
    skipped_entries = 0
    already_applied = 0

    for entry in payload["entries"]:
        if not isinstance(entry, dict):
            raise ValueError("Cada entry debe ser un objeto")
        status = str(entry.get("status") or "accepted")
        catalog_ids = entry.get("catalogIds") or [entry.get("catalogId")]
        catalog_ids = [str(value or "").strip() for value in catalog_ids if str(value or "").strip()]
        if not catalog_ids:
            raise ValueError(f"Entrada sin catalogId: {entry.get('title')}")
        duplicate_ids = seen_ids.intersection(catalog_ids)
        if duplicate_ids:
            raise ValueError(f"IDs repetidos en el lote: {sorted(duplicate_ids)}")
        seen_ids.update(catalog_ids)

        if status != "accepted":
            skipped_entries += 1
            continue

        conditions = entry.get("conditions") or {}
        if not isinstance(conditions, dict) or not conditions:
            raise ValueError(f"Entrada aceptada sin condiciones: {entry.get('title')}")
        unknown = set(conditions) - set(CONDITION_FIELDS)
        if unknown:
            raise ValueError(f"Estados desconocidos en {entry.get('title')}: {sorted(unknown)}")

        games: list[dict[str, Any]] = []
        for catalog_id in catalog_ids:
            game = by_id.get(catalog_id)
            if not game:
                raise ValueError(f"catalogId desconocido: {catalog_id}")
            if game.get("platformSlug") != platform_slug or game.get("region") != region:
                raise ValueError(
                    f"{catalog_id} no pertenece a {platform_slug} / {region}"
                )
            games.append(game)

        if all(batch_id in (game.get("provisionalPriceBatchIds") or []) for game in games):
            already_applied += 1
            continue

        accepted_entries += 1
        before_by_id = {str(game["id"]): dict(game) for game in games}

        if "complete" not in conditions:
            for game in games:
                has_typed_price = any(
                    game.get(field) is not None for field in CONDITION_FIELDS.values()
                )
                legacy_price = game.get("recommendedPrice")
                if not has_typed_price and legacy_price is not None:
                    game[CONDITION_FIELDS["complete"]] = money(legacy_price)
                    fields_updated += 1

        for condition, raw_range in conditions.items():
            provisional = midpoint(raw_range)
            previous_values = [
                value
                for game in games
                if (value := condition_value(game, condition)) is not None
            ]
            components = previous_values + [provisional]
            blended = money(
                sum((Decimal(str(value)) for value in components), start=Decimal("0"))
                / Decimal(len(components))
            )
            field = CONDITION_FIELDS[condition]
            for game in games:
                if game.get(field) != blended:
                    game[field] = blended
                    fields_updated += 1

        for game in games:
            before = before_by_id[str(game["id"])]
            update_derived_price_fields(
                game,
                applied_at=applied_at,
                batch_id=batch_id,
                preserve_region_verified=should_preserve_region_verified(before, game),
            )
            updated_ids.add(str(game["id"]))

    # Permite corregir campos derivados de un lote ya aplicado sin volver a
    # promediar sus rangos. Es util si evoluciona el calculo de totales o labels.
    for game in catalog:
        if batch_id not in (game.get("provisionalPriceBatchIds") or []):
            continue
        before = dict(game)
        update_derived_price_fields(
            game,
            applied_at=applied_at,
            batch_id=batch_id,
            preserve_region_verified=should_preserve_region_verified(before, game),
        )
        if game != before:
            updated_ids.add(str(game["id"]))
            derived_rows_reconciled += 1

    return {
        "batchId": batch_id,
        "entries": len(payload["entries"]),
        "acceptedEntriesApplied": accepted_entries,
        "skippedEntries": skipped_entries,
        "alreadyAppliedEntries": already_applied,
        "derivedRowsReconciled": derived_rows_reconciled,
        "catalogRowsUpdated": len(updated_ids),
        "priceFieldsUpdated": fields_updated,
        "updatedCatalogIds": sorted(updated_ids),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Aplica precios provisionales curatoriales")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE)
    payload = load_json(args.input)
    applied_at = str(payload.get("collectedAt") or now_iso())
    result = apply_batch(catalog, payload, applied_at=applied_at)

    print(f"Lote: {result['batchId']}")
    print(f"  Entradas: {result['entries']}")
    print(f"  Entradas aceptadas aplicadas: {result['acceptedEntriesApplied']}")
    print(f"  Entradas descartadas/documentales: {result['skippedEntries']}")
    print(f"  Entradas ya aplicadas: {result['alreadyAppliedEntries']}")
    print(f"  Filas derivadas reconciliadas: {result['derivedRowsReconciled']}")
    print(f"  Filas de catalogo actualizadas: {result['catalogRowsUpdated']}")
    print(f"  Precios por estado actualizados: {result['priceFieldsUpdated']}")

    if args.dry_run:
        print("Dry-run: no se escriben archivos.")
        return

    if result["catalogRowsUpdated"] == 0:
        print("Sin cambios: el lote ya estaba aplicado.")
        return

    save_json(CATALOG_FILE, catalog)

    sys_path_added = False
    try:
        import sys

        scripts_path = str(ROOT / "scripts")
        if scripts_path not in sys.path:
            sys.path.insert(0, scripts_path)
            sys_path_added = True
        from collectors.price_history import record_platform_snapshots

        updated = set(result["updatedCatalogIds"])
        record_platform_snapshots(
            [game for game in catalog if str(game.get("id") or "") in updated],
            synced_at=applied_at,
        )
    finally:
        if sys_path_added:
            sys.path.remove(str(ROOT / "scripts"))

    if META_FILE.exists():
        meta = load_json(META_FILE)
        meta["lastProvisionalPriceSeedAt"] = applied_at
        meta["lastProvisionalPriceSeedBatch"] = result["batchId"]
        save_json(META_FILE, meta)


if __name__ == "__main__":
    main()
