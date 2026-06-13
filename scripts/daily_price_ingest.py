#!/usr/bin/env python3
"""Rotación diaria: collectors por plataforma → merge ingest → sync catálogo.

Lee ``nextPlatformSlug`` de ``data/price-sync-state.json``. Los lotes mini
(``batch:*`` en ``data/price-sync-batches.json``) procesan varias consolas el
mismo día y avanzan la rotación una sola vez.

  python3 scripts/daily_price_ingest.py
  python3 scripts/daily_price_ingest.py --platform n64
  python3 scripts/daily_price_ingest.py --platform batch:mini-neo-sega --dry-run
  python3 scripts/daily_price_ingest.py --collect-only
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.cex_client import cex_sources_for_platform  # noqa: E402
from collectors.chollo_match import CHOLLO_PLATFORM_CATEGORIES  # noqa: E402
from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.jgo_match import JGO_PLATFORM_CATEGORIES  # noqa: E402
from collectors.kaoto_match import KAOTO_PLATFORM_COLLECTIONS  # noqa: E402
from collectors.tc_client import tc_sources_for_platform  # noqa: E402
from collectors.tcns_client import tcns_sources_for_platform  # noqa: E402
from collectors.vinted_client import vinted_sources_for_platform  # noqa: E402
from collectors.wallapop_client import wallapop_sources_for_platform  # noqa: E402

STATE_FILE = ROOT / "data" / "price-sync-state.json"
BATCHES_FILE = ROOT / "data" / "price-sync-batches.json"
INGEST_DIR = ROOT / "data" / "price-ingest"
PYTHON = sys.executable

LIST_KEYS = ("listings", "cex", "jgo", "chollo", "kaoto", "tcns")


def load_batches() -> dict[str, dict[str, Any]]:
    raw = load_json(BATCHES_FILE, {}).get("batches") or {}
    batches: dict[str, dict[str, Any]] = {}
    for key, value in raw.items():
        if isinstance(value, dict):
            batches[key] = value
        elif isinstance(value, list):
            batches[key] = {"label": key, "platforms": value}
    return batches


def expand_rotation_step(step: str) -> tuple[str, list[str], str | None]:
    batches = load_batches()
    batch = batches.get(step)
    if batch:
        platforms = [str(p) for p in batch.get("platforms") or []]
        label = str(batch.get("label") or step)
        return step, platforms, label
    return step, [step], None


def ebay_configured() -> bool:
    if os.environ.get("EBAY_APP_ID", "").strip():
        return True
    return bool(
        os.environ.get("EBAY_CLIENT_ID", "").strip()
        and os.environ.get("EBAY_CLIENT_SECRET", "").strip()
    )


def source_pause_seconds() -> float:
    raw = os.environ.get("DAILY_SOURCE_PAUSE_SEC", "5")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 5.0


def platform_pause_seconds() -> float:
    raw = os.environ.get("DAILY_PLATFORM_PAUSE_SEC", "8")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 8.0


def ebay_game_limit() -> int:
    raw = os.environ.get("DAILY_EBAY_GAME_LIMIT", "25")
    try:
        return max(1, int(raw))
    except ValueError:
        return 25


def wallapop_game_limit() -> int:
    raw = os.environ.get("DAILY_WALLAPOP_GAME_LIMIT", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    from collectors.wallapop_client import wallapop_game_limit as _default_limit

    return _default_limit()


def planned_sources(platform_slug: str) -> list[tuple[str, Path]]:
    planned: list[tuple[str, Path]] = []

    if tc_sources_for_platform(platform_slug):
        planned.append(("todocoleccion", INGEST_DIR / f"{platform_slug}-todocoleccion.json"))
    if wallapop_sources_for_platform(platform_slug):
        planned.append(("wallapop", INGEST_DIR / f"{platform_slug}-wallapop.json"))
    if vinted_sources_for_platform(platform_slug):
        planned.append(("vinted", INGEST_DIR / f"{platform_slug}-vinted.json"))
    if tcns_sources_for_platform(platform_slug):
        planned.append(("todoconsolas", INGEST_DIR / f"{platform_slug}-todoconsolas.json"))
    if platform_slug in CHOLLO_PLATFORM_CATEGORIES:
        planned.append(("chollo", INGEST_DIR / f"{platform_slug}-chollo.json"))
    if platform_slug in JGO_PLATFORM_CATEGORIES:
        planned.append(("jgo", INGEST_DIR / f"{platform_slug}-jgo.json"))
    if platform_slug in KAOTO_PLATFORM_COLLECTIONS:
        planned.append(("kaoto", INGEST_DIR / f"{platform_slug}-kaoto.json"))
    if cex_sources_for_platform(platform_slug):
        planned.append(("cex", INGEST_DIR / f"{platform_slug}-cex.json"))
    if ebay_configured():
        planned.append(("ebay", INGEST_DIR / f"{platform_slug}-ebay.json"))

    return planned


def collector_match_args() -> list[str]:
    extra: list[str] = []
    if os.environ.get("DAILY_NO_AI", "").strip():
        extra.append("--no-ai")
    if os.environ.get("DAILY_NO_MATCH_CACHE", "").strip():
        extra.append("--no-match-cache")
    return extra


def collector_command(source: str, platform_slug: str, output: Path) -> list[str]:
    scripts = ROOT / "scripts"
    script_map = {
        "todocoleccion": scripts / "collect_todocoleccion.py",
        "wallapop": scripts / "collect_wallapop.py",
        "vinted": scripts / "collect_vinted.py",
        "todoconsolas": scripts / "collect_todoconsolas.py",
        "chollo": scripts / "collect_chollogames.py",
        "jgo": scripts / "collect_japangameonline.py",
        "kaoto": scripts / "collect_kaotostore.py",
        "cex": scripts / "collect_cex.py",
        "ebay": scripts / "collect_ebay_es.py",
    }
    script = script_map.get(source)
    if script is None:
        raise ValueError(f"Fuente desconocida: {source}")

    if source == "ebay":
        return [
            PYTHON,
            str(script),
            "--platform",
            platform_slug,
            "--limit",
            str(ebay_game_limit()),
            "--sold",
            "--active",
            "--output",
            str(output),
        ]

    if source == "wallapop":
        cmd = [
            PYTHON,
            str(script),
            "--platform",
            platform_slug,
            "--limit",
            str(wallapop_game_limit()),
            "--output",
            str(output),
        ]
        cmd.extend(collector_match_args())
        return cmd

    cmd = [
        PYTHON,
        str(script),
        "--platform",
        platform_slug,
        "--output",
        str(output),
    ]
    cmd.extend(collector_match_args())
    return cmd


def run_collector(source: str, platform_slug: str, output: Path, *, dry_run: bool) -> bool:
    cmd = collector_command(source, platform_slug, output)
    if dry_run:
        print(f"  [dry-run] {' '.join(cmd)}")
        return True

    print(f"\n--- Collector: {source} ---")
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        print(f"  AVISO: {source} terminó con código {result.returncode}")
        return False
    if not output.exists():
        print(f"  AVISO: {source} no generó {output}")
        return False
    return True


def ingest_has_data(payload: dict[str, Any]) -> bool:
    for key in LIST_KEYS:
        if payload.get(key):
            return True
    return False


def merge_platform_ingest(platform_slug: str, partial_paths: list[Path], sources_ok: list[str]) -> dict[str, Any]:
    merged: dict[str, Any] = {
        "platformSlug": platform_slug,
        "collectedAt": now_iso(),
        "notes": f"Daily ingest — fuentes: {', '.join(sources_ok) or 'ninguna'}",
    }
    for key in LIST_KEYS:
        merged[key] = []

    for path in partial_paths:
        if not path.exists():
            continue
        partial = load_json(path, {})
        if partial.get("platformSlug") and partial["platformSlug"] != platform_slug:
            print(f"  AVISO: omitiendo {path.name} (plataforma distinta)")
            continue
        for key in LIST_KEYS:
            merged[key].extend(partial.get(key) or [])

    return merged


def resolve_rotation(args: argparse.Namespace) -> tuple[str, list[str], str | None]:
    if args.platform:
        return expand_rotation_step(args.platform)
    state = load_json(STATE_FILE, {})
    step = str(state.get("nextPlatformSlug") or "nes")
    return expand_rotation_step(step)


def ingest_platform(
    platform_slug: str,
    *,
    dry_run: bool,
    collect_only: bool,
    rotation_step: str,
    advance_rotation: bool,
) -> bool:
    merged_path = INGEST_DIR / f"{platform_slug}.json"
    planned = planned_sources(platform_slug)

    print(f"\n=== Plataforma: {platform_slug} ===")
    print(f"Merge: {merged_path}")
    print(f"Fuentes: {', '.join(name for name, _ in planned) or 'ninguna'}")

    if not planned:
        print(f"  AVISO: sin collectors para {platform_slug}, omitida.")
        return False

    sources_ok: list[str] = []
    partial_paths: list[Path] = []
    pause = source_pause_seconds()

    for index, (source, output) in enumerate(planned):
        if index > 0 and pause > 0 and not dry_run:
            time.sleep(pause)
        if run_collector(source, platform_slug, output, dry_run=dry_run):
            sources_ok.append(source)
            partial_paths.append(output)

    if dry_run:
        return True

    merged = merge_platform_ingest(platform_slug, partial_paths, sources_ok)
    if not ingest_has_data(merged):
        print(f"  AVISO: ninguna fuente produjo datos para {platform_slug}.")
        return False

    INGEST_DIR.mkdir(parents=True, exist_ok=True)
    save_json(merged_path, merged)
    print(f"  Merge guardado: {merged_path}")
    print(
        "  "
        + " · ".join(f"{key}: {len(merged.get(key) or [])}" for key in LIST_KEYS if merged.get(key))
    )

    if collect_only:
        return True

    sync_cmd = [
        PYTHON,
        str(ROOT / "scripts" / "sync_es_prices.py"),
        "--platform",
        platform_slug,
        "--input",
        str(merged_path),
        "--rotation-step",
        rotation_step,
    ]
    if not advance_rotation:
        sync_cmd.append("--no-advance-rotation")

    print("\n--- Sync catálogo ---")
    subprocess.run(sync_cmd, cwd=ROOT, check=True)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest diario por rotación de plataforma")
    parser.add_argument(
        "--platform",
        help="Forzar plataforma o batch (p. ej. batch:mini-neo-sega)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo listar pasos, sin red ni escritura")
    parser.add_argument(
        "--collect-only",
        action="store_true",
        help="Collect + merge; no sync ni avance de rotación",
    )
    args = parser.parse_args()

    rotation_step, platform_slugs, batch_label = resolve_rotation(args)

    print(f"=== Daily price ingest {now_iso()} ===")
    print(f"Paso rotación: {rotation_step}")
    if batch_label:
        print(f"Lote: {batch_label}")
        print(f"Consolas: {', '.join(platform_slugs)}")
    else:
        print(f"Plataforma: {platform_slugs[0]}")
    if not ebay_configured():
        print("eBay: omitido (sin EBAY_APP_ID ni EBAY_CLIENT_ID/SECRET en el entorno)")

    synced = 0
    platform_pause = platform_pause_seconds()

    for index, platform_slug in enumerate(platform_slugs):
        if index > 0 and platform_pause > 0 and not args.dry_run:
            time.sleep(platform_pause)
        advance = index == len(platform_slugs) - 1 and not args.collect_only
        if ingest_platform(
            platform_slug,
            dry_run=args.dry_run,
            collect_only=args.collect_only,
            rotation_step=rotation_step,
            advance_rotation=advance,
        ):
            synced += 1

    if args.dry_run:
        print("\nDry-run: fin.")
        return

    if synced == 0:
        raise SystemExit(
            f"Ninguna plataforma produjo datos en {rotation_step}. Rotación no avanzada."
        )

    if args.collect_only:
        print("\nCollect-only: rotación no avanzada.")
        return

    state = load_json(STATE_FILE, {})
    print(f"\nProcesadas: {synced}/{len(platform_slugs)}")
    print(f"Siguiente paso rotación: {state.get('nextPlatformSlug')}")


if __name__ == "__main__":
    main()
