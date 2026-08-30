#!/usr/bin/env python3
"""Recolección de precios lanzada desde el admin (un juego, plataforma o lote).

  python3 scripts/admin_price_collect.py --platform dreamcast
  python3 scripts/admin_price_collect.py --platform dreamcast --region "PAL España"
  python3 scripts/admin_price_collect.py --catalog-id dreamcast-sonic-pal
  python3 scripts/admin_price_collect.py --platform saturn --status-file data/admin/price-jobs/job.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, load_local_env, now_iso, save_json  # noqa: E402

load_local_env()

from daily_price_ingest import (  # noqa: E402
    INGEST_DIR,
    LIST_KEYS,
    PYTHON,
    collector_command,
    daily_skip_sources,
    ingest_has_data,
    merge_platform_ingest,
    planned_sources,
    run_collector,
    source_pause_seconds,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
RESULTS_DIR = ROOT / "data" / "worker-runtime" / "results"
MAX_WALLAPOP_BATCH_GAMES = 20
SCOPED_PRICE_MUTATION_FILES = (
    CATALOG_FILE,
    ROOT / "data" / "meta.json",
    ROOT / "data" / "price-history.json",
    ROOT / "data" / "price-sync-state.json",
)
PRICE_RESULT_FIELDS = (
    "recommendedPrice",
    "estimatedPriceLoose",
    "estimatedPriceGameManual",
    "estimatedPriceComplete",
    "estimatedPriceSealed",
    "estimatedShippingToSpainLoose",
    "estimatedShippingToSpainGameManual",
    "estimatedShippingToSpainComplete",
    "estimatedShippingToSpainSealed",
    "estimatedTotalToSpainLoose",
    "estimatedTotalToSpainGameManual",
    "estimatedTotalToSpainComplete",
    "estimatedTotalToSpainSealed",
    "marketMin",
    "marketMax",
    "priceSource",
    "priceDataSources",
    "hasEsPrice",
    "priceRegionVerified",
)


def write_status(path: Path | None, payload: dict[str, Any]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = load_json(path, {}) if path.exists() else {}
    clean_payload = {key: value for key, value in payload.items() if value is not None}
    save_json(path, {**previous, **clean_payload})


def status_job_id(path: Path | None) -> str | None:
    if path is None:
        return None
    return path.stem or None


def collect_trigger() -> str:
    trigger = os.environ.get("PRICE_COLLECT_TRIGGER", "manual").strip().lower()
    return "automatic" if trigger == "automatic" else "manual"


def find_game(catalog_id: str) -> dict[str, Any]:
    catalog = load_json(CATALOG_FILE, [])
    game = next((g for g in catalog if str(g.get("id")) == catalog_id), None)
    if not game:
        raise SystemExit(f"Juego no encontrado: {catalog_id}")
    return game


def normalize_catalog_ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise SystemExit("--catalog-ids-json debe ser una lista JSON")
    selected: list[str] = []
    seen: set[str] = set()
    for raw in value:
        catalog_id = str(raw or "").strip()
        if not catalog_id or catalog_id in seen:
            continue
        if len(catalog_id) > 240 or any(ord(character) < 32 or ord(character) == 127 for character in catalog_id):
            raise SystemExit(f"ID de catálogo no permitido: {catalog_id}")
        seen.add(catalog_id)
        selected.append(catalog_id)
    if not selected:
        raise SystemExit("La tanda Wallapop no contiene juegos")
    if len(selected) > MAX_WALLAPOP_BATCH_GAMES:
        raise SystemExit(f"La tanda Wallapop admite como máximo {MAX_WALLAPOP_BATCH_GAMES} juegos")
    return selected


def find_games(catalog_ids: list[str]) -> list[dict[str, Any]]:
    catalog = load_json(CATALOG_FILE, [])
    by_id = {str(game.get("id") or ""): game for game in catalog if game.get("id")}
    missing = [catalog_id for catalog_id in catalog_ids if catalog_id not in by_id]
    if missing:
        raise SystemExit(f"Juego(s) no encontrado(s): {', '.join(missing)}")
    games = [by_id[catalog_id] for catalog_id in catalog_ids]
    platforms = {str(game.get("platformSlug") or "").strip() for game in games}
    if "" in platforms or len(platforms) != 1:
        raise SystemExit("Todos los juegos de la tanda deben pertenecer a la misma plataforma")
    return games


def wallapop_result_path(status_file: Path | None) -> Path:
    job_id = status_job_id(status_file) or "manual-wallapop-batch"
    return RESULTS_DIR / job_id / "catalog-price-results.json"


def write_wallapop_result(
    path: Path,
    *,
    job_id: str | None,
    platform_slug: str,
    searched_catalog_ids: list[str],
    result_catalog_ids: list[str],
    verified_catalog_ids: list[str],
) -> None:
    catalog = load_json(CATALOG_FILE, [])
    selected = set(result_catalog_ids)
    games = [game for game in catalog if str(game.get("id") or "") in selected]
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(
        path,
        {
            "schemaVersion": 1,
            "jobId": job_id,
            "source": "wallapop",
            "platformSlug": platform_slug,
            "generatedAt": now_iso(),
            "searchedCatalogIds": searched_catalog_ids,
            "catalogIds": result_catalog_ids,
            "verifiedCatalogIds": verified_catalog_ids,
            "games": games,
        },
    )


def snapshot_scoped_price_files() -> dict[Path, bytes | None]:
    return {
        path: path.read_bytes() if path.exists() else None
        for path in SCOPED_PRICE_MUTATION_FILES
    }


def restore_scoped_price_files(snapshot: dict[Path, bytes | None]) -> None:
    for path, original in snapshot.items():
        if original is None:
            path.unlink(missing_ok=True)
            continue
        path.write_bytes(original)


def verified_changed_catalog_ids(
    before_catalog: list[dict[str, Any]],
    after_catalog: list[dict[str, Any]],
    scope_ids: list[str],
) -> list[str]:
    before_by_id = {str(game.get("id") or ""): game for game in before_catalog if game.get("id")}
    after_by_id = {str(game.get("id") or ""): game for game in after_catalog if game.get("id")}
    verified: list[str] = []
    for catalog_id in scope_ids:
        before = before_by_id.get(catalog_id, {})
        after = after_by_id.get(catalog_id)
        if not after or after.get("priceRegionVerified") is not True:
            continue
        if any(before.get(field) != after.get(field) for field in PRICE_RESULT_FIELDS):
            verified.append(catalog_id)
    return verified


def region_slug(region: str | None) -> str:
    if not region:
        return ""
    return re.sub(r"[^a-zA-Z0-9]+", "-", region).strip("-").lower()


def collect_platform(
    platform_slug: str,
    *,
    region: str | None = None,
    status_file: Path | None,
    advance_rotation: bool = False,
) -> int:
    cmd = [
        PYTHON,
        str(ROOT / "scripts" / "daily_price_ingest.py"),
        "--platform",
        platform_slug,
    ]
    if not advance_rotation:
        cmd.append("--no-advance-rotation")
    clean_region = (region or "").strip()
    if clean_region:
        cmd.extend(["--region", clean_region])
        os.environ["PRICE_COLLECT_REGION"] = clean_region
    else:
        os.environ.pop("PRICE_COLLECT_REGION", None)
    print(f"=== Admin price collect · plataforma {platform_slug} ===")
    if clean_region:
        print(f"Región: {clean_region}")
    result = subprocess.run(cmd, cwd=ROOT)
    write_status(
        status_file,
        {
            "status": "done" if result.returncode == 0 else "error",
            "jobId": status_job_id(status_file),
            "exitCode": result.returncode,
            "platformSlug": platform_slug,
            "region": clean_region or None,
            "trigger": collect_trigger(),
            "finishedAt": now_iso(),
        },
    )
    return result.returncode


def collect_targets(targets: list[dict[str, Any]], *, status_file: Path | None) -> int:
    print(f"=== Admin price collect · lote de {len(targets)} objetivos ===")
    completed: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for index, target in enumerate(targets, start=1):
        platform_slug = str(target.get("platformSlug") or "").strip()
        region = str(target.get("region") or "").strip()
        if not platform_slug:
            failed.append({"target": target, "error": "platformSlug vacío"})
            continue
        print(f"\n[{index}/{len(targets)}] {platform_slug}{f' · {region}' if region else ''}")
        code = collect_platform(platform_slug, region=region or None, status_file=None)
        item = {"platformSlug": platform_slug, "region": region or None, "exitCode": code}
        if code == 0:
            completed.append(item)
        else:
            failed.append(item)
        write_status(
            status_file,
            {
                "status": "running" if index < len(targets) else ("error" if failed else "done"),
                "jobId": status_job_id(status_file),
                "trigger": collect_trigger(),
                "targets": targets,
                "completedTargets": completed,
                "failedTargets": failed,
                "finishedAt": now_iso() if index == len(targets) else None,
            },
        )
    return 1 if failed else 0


def collect_game(catalog_id: str, *, status_file: Path | None) -> int:
    game = find_game(catalog_id)
    platform_slug = str(game.get("platformSlug") or "").strip()
    if not platform_slug:
        raise SystemExit(f"Juego sin plataforma: {catalog_id}")

    os.environ["PRICE_COLLECT_CATALOG_ID"] = catalog_id
    skipped_sources = daily_skip_sources()
    planned = [(source, output) for source, output in planned_sources(platform_slug) if source not in skipped_sources]
    if not planned:
        write_status(
            status_file,
            {
                "status": "error",
                "jobId": status_job_id(status_file),
                "error": f"Sin collectors configurados para {platform_slug}",
                "catalogId": catalog_id,
                "trigger": collect_trigger(),
                "finishedAt": now_iso(),
            },
        )
        raise SystemExit(f"Sin collectors para {platform_slug}")

    print(f"=== Admin price collect · {game.get('title')} ({catalog_id}) ===")
    print(f"Plataforma: {platform_slug} · fuentes: {', '.join(s for s, _ in planned)}")
    if skipped_sources:
        print(f"Fuentes omitidas: {', '.join(sorted(skipped_sources))}")

    sources_ok: list[str] = []
    partial_paths: list[Path] = []
    pause = source_pause_seconds()

    for index, (source, output) in enumerate(planned):
        if index > 0 and pause > 0:
            import time

            time.sleep(pause)
        if run_collector(source, platform_slug, output, dry_run=False):
            sources_ok.append(source)
            partial_paths.append(output)

    merged = merge_platform_ingest(platform_slug, partial_paths, sources_ok)
    if not ingest_has_data(merged):
        write_status(
            status_file,
            {
                "status": "error",
                "jobId": status_job_id(status_file),
                "error": "Ninguna fuente produjo datos para este juego",
                "catalogId": catalog_id,
                "platformSlug": platform_slug,
                "trigger": collect_trigger(),
                "finishedAt": now_iso(),
            },
        )
        raise SystemExit("Ninguna fuente produjo datos.")

    merged_path = INGEST_DIR / f"{platform_slug}-admin-{catalog_id}.json"
    INGEST_DIR.mkdir(parents=True, exist_ok=True)
    save_json(merged_path, merged)
    print(f"Merge guardado: {merged_path}")
    print(
        "  "
        + " · ".join(f"{key}: {len(merged.get(key) or [])}" for key in LIST_KEYS if merged.get(key))
    )

    sync_cmd = [
        PYTHON,
        str(ROOT / "scripts" / "sync_es_prices.py"),
        "--platform",
        platform_slug,
        "--input",
        str(merged_path),
        "--no-advance-rotation",
    ]
    print("\n--- Sync catálogo ---")
    result = subprocess.run(sync_cmd, cwd=ROOT)
    write_status(
        status_file,
        {
            "status": "done" if result.returncode == 0 else "error",
            "jobId": status_job_id(status_file),
            "exitCode": result.returncode,
            "catalogId": catalog_id,
            "platformSlug": platform_slug,
            "sources": sources_ok,
            "trigger": collect_trigger(),
            "ingestPath": str(merged_path.relative_to(ROOT)),
            "finishedAt": now_iso(),
        },
    )
    return result.returncode


def collect_wallapop_batch(catalog_ids: list[str], *, status_file: Path | None) -> int:
    games = find_games(catalog_ids)
    platform_slug = str(games[0].get("platformSlug") or "").strip()
    job_id = status_job_id(status_file)
    output = INGEST_DIR / f"{platform_slug}-wallapop-batch-{job_id or 'manual'}.json"
    result_path = wallapop_result_path(status_file)

    os.environ.pop("PRICE_COLLECT_CATALOG_ID", None)
    os.environ.pop("PRICE_COLLECT_REGION", None)
    os.environ["PRICE_COLLECT_CATALOG_IDS"] = json.dumps(catalog_ids, ensure_ascii=False)
    os.environ["DAILY_WALLAPOP_GAME_LIMIT"] = str(len(catalog_ids))
    os.environ["DAILY_USE_CACHE"] = "0"

    print(f"=== Wallapop · tanda segura de {len(catalog_ids)} juegos ===")
    print(f"Plataforma: {platform_slug} · IA visual: habilitada si hay credenciales")
    for index, game in enumerate(games, start=1):
        print(f"  {index:02d}. {game.get('title')} · {game.get('region')} · {game.get('id')}")

    if not run_collector("wallapop", platform_slug, output, dry_run=False):
        write_status(
            status_file,
            {
                "status": "error",
                "jobId": job_id,
                "error": "Wallapop no produjo un artefacto válido para la tanda",
                "catalogIds": catalog_ids,
                "source": "wallapop",
                "platformSlug": platform_slug,
                "trigger": collect_trigger(),
                "finishedAt": now_iso(),
            },
        )
        return 1

    ingest = load_json(output, {})
    routed_ids = {
        str(row.get("catalogId") or "").strip()
        for key in ("listings", "regionalCandidates")
        for row in (ingest.get(key) or [])
        if isinstance(row, dict) and str(row.get("catalogId") or "").strip()
    }
    catalog_by_id = {
        str(game.get("id") or ""): game
        for game in load_json(CATALOG_FILE, [])
        if game.get("id")
    }
    result_catalog_ids = list(catalog_ids)
    for routed_id in sorted(routed_ids):
        routed_game = catalog_by_id.get(routed_id)
        if (
            routed_id not in result_catalog_ids
            and routed_game
            and str(routed_game.get("platformSlug") or "") == platform_slug
        ):
            result_catalog_ids.append(routed_id)

    scope_file = result_path.parent / "catalog-ids.json"
    scope_file.parent.mkdir(parents=True, exist_ok=True)
    save_json(scope_file, {"catalogIds": result_catalog_ids})
    sync_cmd = [
        PYTHON,
        str(ROOT / "scripts" / "sync_es_prices.py"),
        "--platform",
        platform_slug,
        "--input",
        str(output),
        "--catalog-ids-file",
        str(scope_file),
        "--allow-cross-region-catalog-ids",
        "--no-advance-rotation",
    ]
    print("\n--- Sync limitado a juegos buscados y variantes regionales detectadas ---")
    snapshot = snapshot_scoped_price_files()
    before_catalog = json.loads((snapshot.get(CATALOG_FILE) or b"[]").decode("utf-8"))
    verified_catalog_ids: list[str] = []
    try:
        result = subprocess.run(sync_cmd, cwd=ROOT)
        if result.returncode == 0:
            after_catalog = load_json(CATALOG_FILE, [])
            verified_catalog_ids = verified_changed_catalog_ids(
                before_catalog,
                after_catalog,
                result_catalog_ids,
            )
            write_wallapop_result(
                result_path,
                job_id=job_id,
                platform_slug=platform_slug,
                searched_catalog_ids=catalog_ids,
                result_catalog_ids=result_catalog_ids,
                verified_catalog_ids=verified_catalog_ids,
            )
    finally:
        restore_scoped_price_files(snapshot)

    stats = ingest.get("stats") if isinstance(ingest.get("stats"), dict) else {}
    write_status(
        status_file,
        {
            "status": "done" if result.returncode == 0 else "error",
            "jobId": job_id,
            "exitCode": result.returncode,
            "catalogIds": catalog_ids,
            "resultCatalogIds": result_catalog_ids,
            "verifiedCatalogIds": verified_catalog_ids,
            "source": "wallapop",
            "platformSlug": platform_slug,
            "sources": ["wallapop"],
            "trigger": collect_trigger(),
            "ingestPath": str(output.relative_to(ROOT)),
            "resultLocalPath": str(result_path.relative_to(ROOT)) if result.returncode == 0 else None,
            "collectorStats": stats,
            "finishedAt": now_iso(),
        },
    )
    return result.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Recolección de precios (admin)")
    parser.add_argument("--platform", help="Slug de plataforma (todos los juegos)")
    parser.add_argument("--region", help="Filtrar región de catálogo")
    parser.add_argument("--catalog-id", help="Id de catálogo (un solo juego)")
    parser.add_argument("--catalog-ids-json", help="Tanda Wallapop JSON de hasta 20 IDs")
    parser.add_argument("--targets-json", help="Lote JSON [{ platformSlug, region? }]")
    parser.add_argument(
        "--advance-rotation",
        action="store_true",
        help="Permite avanzar nextPlatformSlug al terminar correctamente (solo cron automático).",
    )
    parser.add_argument(
        "--status-file",
        type=Path,
        help="JSON de estado al terminar (para jobs en segundo plano)",
    )
    args = parser.parse_args()

    target_modes = [
        bool(args.platform),
        bool(args.catalog_id),
        bool(args.catalog_ids_json),
        bool(args.targets_json),
    ]
    if sum(1 for mode in target_modes if mode) != 1:
        raise SystemExit("Indica --platform, --catalog-id, --catalog-ids-json o --targets-json (uno solo).")

    batch_catalog_ids = normalize_catalog_ids(json.loads(args.catalog_ids_json)) if args.catalog_ids_json else None

    write_status(
        args.status_file,
        {
            "status": "running",
            "jobId": status_job_id(args.status_file),
            "platformSlug": args.platform,
            "region": args.region,
            "catalogId": args.catalog_id,
            "catalogIds": batch_catalog_ids,
            "source": "wallapop" if batch_catalog_ids else None,
            "targets": json.loads(args.targets_json) if args.targets_json else None,
            "trigger": collect_trigger(),
            "startedAt": now_iso(),
        },
    )

    try:
        if args.platform:
            code = collect_platform(
                args.platform.strip(),
                region=args.region,
                status_file=args.status_file,
                advance_rotation=args.advance_rotation,
            )
        elif args.catalog_id:
            code = collect_game(args.catalog_id.strip(), status_file=args.status_file)
        elif batch_catalog_ids:
            code = collect_wallapop_batch(batch_catalog_ids, status_file=args.status_file)
        else:
            targets = json.loads(args.targets_json)
            if not isinstance(targets, list):
                raise SystemExit("--targets-json debe ser una lista")
            code = collect_targets(targets, status_file=args.status_file)
    except SystemExit as exc:
        if args.status_file:
            write_status(
                args.status_file,
                {
                    "status": "error",
                    "jobId": status_job_id(args.status_file),
                    "platformSlug": args.platform,
                    "region": args.region,
                    "catalogId": args.catalog_id,
                    "catalogIds": batch_catalog_ids,
                    "source": "wallapop" if batch_catalog_ids else None,
                    "targets": json.loads(args.targets_json) if args.targets_json else None,
                    "trigger": collect_trigger(),
                    "error": str(exc),
                    "finishedAt": now_iso(),
                },
            )
        raise
    except Exception as exc:
        if args.status_file:
            write_status(
                args.status_file,
                {
                    "status": "error",
                    "jobId": status_job_id(args.status_file),
                    "platformSlug": args.platform,
                    "region": args.region,
                    "catalogId": args.catalog_id,
                    "catalogIds": batch_catalog_ids,
                    "source": "wallapop" if batch_catalog_ids else None,
                    "targets": json.loads(args.targets_json) if args.targets_json else None,
                    "trigger": collect_trigger(),
                    "error": str(exc),
                    "finishedAt": now_iso(),
                },
            )
        raise

    raise SystemExit(code)


if __name__ == "__main__":
    main()
