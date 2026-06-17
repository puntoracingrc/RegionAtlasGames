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
    ingest_has_data,
    merge_platform_ingest,
    planned_sources,
    run_collector,
    source_pause_seconds,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"


def write_status(path: Path | None, payload: dict[str, Any]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = load_json(path, {}) if path.exists() else {}
    clean_payload = {key: value for key, value in payload.items() if value is not None}
    save_json(path, {**previous, **clean_payload})


def find_game(catalog_id: str) -> dict[str, Any]:
    catalog = load_json(CATALOG_FILE, [])
    game = next((g for g in catalog if str(g.get("id")) == catalog_id), None)
    if not game:
        raise SystemExit(f"Juego no encontrado: {catalog_id}")
    return game


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
            "exitCode": result.returncode,
            "platformSlug": platform_slug,
            "region": clean_region or None,
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
    planned = planned_sources(platform_slug)
    if not planned:
        write_status(
            status_file,
            {
                "status": "error",
                "error": f"Sin collectors configurados para {platform_slug}",
                "catalogId": catalog_id,
                "finishedAt": now_iso(),
            },
        )
        raise SystemExit(f"Sin collectors para {platform_slug}")

    print(f"=== Admin price collect · {game.get('title')} ({catalog_id}) ===")
    print(f"Plataforma: {platform_slug} · fuentes: {', '.join(s for s, _ in planned)}")

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
                "error": "Ninguna fuente produjo datos para este juego",
                "catalogId": catalog_id,
                "platformSlug": platform_slug,
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
            "exitCode": result.returncode,
            "catalogId": catalog_id,
            "platformSlug": platform_slug,
            "sources": sources_ok,
            "ingestPath": str(merged_path.relative_to(ROOT)),
            "finishedAt": now_iso(),
        },
    )
    return result.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Recolección de precios (admin)")
    parser.add_argument("--platform", help="Slug de plataforma (todos los juegos)")
    parser.add_argument("--region", help="Filtrar región de catálogo")
    parser.add_argument("--catalog-id", help="Id de catálogo (un solo juego)")
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

    target_modes = [bool(args.platform), bool(args.catalog_id), bool(args.targets_json)]
    if sum(1 for mode in target_modes if mode) != 1:
        raise SystemExit("Indica --platform, --catalog-id o --targets-json (uno solo).")

    write_status(
        args.status_file,
        {
            "status": "running",
            "platformSlug": args.platform,
            "region": args.region,
            "catalogId": args.catalog_id,
            "targets": json.loads(args.targets_json) if args.targets_json else None,
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
        else:
            targets = json.loads(args.targets_json)
            if not isinstance(targets, list):
                raise SystemExit("--targets-json debe ser una lista")
            code = collect_targets(targets, status_file=args.status_file)
    except SystemExit as exc:
        if args.status_file and not args.status_file.exists():
            write_status(
                args.status_file,
                {
                    "status": "error",
                    "error": str(exc),
                    "finishedAt": now_iso(),
                },
            )
        raise

    raise SystemExit(code)


if __name__ == "__main__":
    main()
