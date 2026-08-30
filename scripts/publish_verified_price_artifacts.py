#!/usr/bin/env python3
"""Publica artefactos verificados del PC sin ejecutar collectors en GitHub/Vercel."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKER_BASE = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker"
DEFAULT_STATE = ROOT / "data" / "price-artifact-publish-state.json"
ALLOWED_PLATFORMS = {"ps4", "ps5", "switch2"}
WALLAPOP_PLATFORMS = {"ps1", "ps2", "ps3", "ps4", "ps5"}
TCNS_POLICY = "tcns_exact_title_region_used_v1"
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$")


class ArtifactError(RuntimeError):
    """El artefacto remoto no cumple el contrato de publicación."""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def require_dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ArtifactError(f"{label} debe ser un objeto JSON.")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ArtifactError(f"{label} debe ser una lista JSON.")
    return value


def require_safe_id(value: Any, label: str) -> str:
    clean = str(value or "").strip()
    if not SAFE_ID_RE.fullmatch(clean):
        raise ArtifactError(f"{label} no es un identificador seguro.")
    return clean


def fetch_json(
    worker_base: str,
    relative_path: str,
    *,
    max_bytes: int,
    missing_ok: bool = False,
) -> dict[str, Any] | None:
    base = worker_base.rstrip("/") + "/"
    target = urljoin(base, relative_path.lstrip("/"))
    base_parts = urlsplit(base)
    target_parts = urlsplit(target)
    if target_parts.scheme != "https" or target_parts.netloc != base_parts.netloc:
        raise ArtifactError("La ruta remota sale del host permitido.")
    request = Request(target, headers={"User-Agent": "RegionAtlas-Git-Publisher/1.0", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - host validado arriba
            final = urlsplit(response.geturl())
            if final.scheme != "https" or final.netloc != base_parts.netloc:
                raise ArtifactError("El worker redirigió a un host no permitido.")
            raw = response.read(max_bytes + 1)
    except HTTPError as exc:
        if missing_ok and exc.code == 404:
            return None
        raise ArtifactError(f"No se pudo leer {relative_path}: HTTP {exc.code}") from exc
    except ArtifactError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ArtifactError(f"No se pudo leer {relative_path}: {exc}") from exc
    if len(raw) > max_bytes:
        raise ArtifactError(f"{relative_path} supera el tamaño máximo permitido.")
    try:
        return require_dict(json.loads(raw.decode("utf-8-sig")), relative_path)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ArtifactError(f"{relative_path} no contiene JSON UTF-8 válido.") from exc


def trusted_product_url(value: Any, *, hosts: set[str]) -> bool:
    try:
        parsed = urlsplit(str(value or ""))
    except ValueError:
        return False
    return parsed.scheme == "https" and parsed.hostname in hosts and bool(parsed.path and parsed.path != "/")


def positive_price(value: Any) -> bool:
    try:
        return 0 < float(value) < 100_000
    except (TypeError, ValueError):
        return False


def validate_tcns_ingest(payload: dict[str, Any], platform: str, expected_rows: int) -> dict[str, Any]:
    if platform not in ALLOWED_PLATFORMS or payload.get("platformSlug") != platform:
        raise ArtifactError(f"TodoConsolas devolvió una plataforma no permitida: {platform}.")
    if payload.get("source") != "todoconsolas":
        raise ArtifactError("El lote TodoConsolas no declara la fuente esperada.")
    rows = require_list(payload.get("tcns"), "tcns")
    if len(rows) != expected_rows:
        raise ArtifactError(f"TodoConsolas esperaba {expected_rows} filas exactas y recibió {len(rows)}.")
    for index, raw_row in enumerate(rows):
        row = require_dict(raw_row, f"tcns[{index}]")
        catalog_id = str(row.get("catalogId") or "")
        checks = (
            catalog_id.startswith(f"{platform}-"),
            row.get("source") == "todoconsolas",
            row.get("sourceType") == "retail_es_preowned",
            row.get("offerType") == "preowned",
            row.get("condition") == "preowned",
            row.get("regionVerified") is True,
            row.get("autoApproved") is True,
            row.get("acceptancePolicy") == TCNS_POLICY,
            bool(row.get("listingRegion")) and row.get("listingRegion") == row.get("catalogRegion"),
            positive_price(row.get("retailPriceEur") if row.get("retailPriceEur") is not None else row.get("priceEur")),
            trusted_product_url(row.get("productUrl"), hosts={"todoconsolas.com", "www.todoconsolas.com"}),
        )
        if not all(checks):
            raise ArtifactError(f"tcns[{index}] no cumple el contrato exacto título+región.")
    clean = dict(payload)
    clean["regionalCandidates"] = []
    clean["listings"] = []
    clean["tc"] = []
    return clean


def validate_game_ingest(payload: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    platform = str(job.get("platformSlug") or "")
    if platform not in ALLOWED_PLATFORMS or payload.get("platformSlug") != platform:
        raise ArtifactError("El resultado GAME no coincide con la plataforma solicitada.")
    if payload.get("source") != "game-es-preowned" or payload.get("offerType") != "preowned":
        raise ArtifactError("El resultado GAME no es un lote seminuevo permitido.")
    rows = require_list(payload.get("listings"), "listings")
    if len(rows) > 1_000:
        raise ArtifactError("El lote GAME supera 1.000 filas.")
    for index, raw_row in enumerate(rows):
        row = require_dict(raw_row, f"listings[{index}]")
        catalog_id = str(row.get("catalogId") or "")
        checks = (
            catalog_id.startswith(f"{platform}-"),
            row.get("source") == "game-es-preowned",
            row.get("sourceType") == "retail_es_preowned",
            row.get("offerType") == "preowned",
            row.get("condition") == "complete",
            row.get("matchMethod") in {"reference", "title", "ai"},
            positive_price(row.get("retailPriceEur") if row.get("retailPriceEur") is not None else row.get("priceEur")),
            trusted_product_url(row.get("productUrl"), hosts={"game.es", "www.game.es"}),
        )
        if not all(checks):
            raise ArtifactError(f"listings[{index}] no cumple el contrato GAME seminuevo.")
    clean = dict(payload)
    for key in ("cex", "jgo", "chollo", "kaoto", "tcns", "tc", "regionalCandidates"):
        clean[key] = []
    return clean


def require_catalog_ids(value: Any, label: str, *, maximum: int) -> list[str]:
    rows = require_list(value, label)
    if not rows or len(rows) > maximum:
        raise ArtifactError(f"{label} debe contener entre 1 y {maximum} IDs.")
    clean: list[str] = []
    for raw in rows:
        catalog_id = str(raw or "").strip()
        if (
            not catalog_id
            or len(catalog_id) > 240
            or any(ord(character) < 32 or ord(character) == 127 for character in catalog_id)
        ):
            raise ArtifactError(f"{label} contiene un ID no permitido.")
        clean.append(catalog_id)
    if len(set(clean)) != len(clean):
        raise ArtifactError(f"{label} contiene IDs repetidos.")
    return clean


def same_ids(left: list[str], right: list[str]) -> bool:
    return set(left) == set(right) and len(left) == len(right)


def validate_wallapop_artifact(
    manifest: dict[str, Any],
    result: dict[str, Any],
    ingest: dict[str, Any],
    catalog: list[dict[str, Any]],
) -> tuple[str, dict[str, Any], int]:
    job_id = require_safe_id(manifest.get("jobId"), "Wallapop job id")
    platform = str(manifest.get("platformSlug") or "")
    if platform not in WALLAPOP_PLATFORMS:
        raise ArtifactError(f"Wallapop devolvió una plataforma no permitida: {platform}.")
    expected_result_path = f"results/{job_id}/catalog-price-results.json"
    expected_ingest_path = f"results/{job_id}/wallapop-ingest.json"
    if manifest.get("resultPath") != expected_result_path or manifest.get("ingestResultPath") != expected_ingest_path:
        raise ArtifactError(f"Wallapop {job_id} declara rutas de resultado inesperadas.")

    searched = require_catalog_ids(manifest.get("searchedCatalogIds"), "searchedCatalogIds", maximum=20)
    result_ids = require_catalog_ids(manifest.get("resultCatalogIds"), "resultCatalogIds", maximum=100)
    verified = require_catalog_ids(manifest.get("verifiedCatalogIds"), "verifiedCatalogIds", maximum=100)
    if not set(searched).issubset(result_ids) or not set(verified).issubset(result_ids):
        raise ArtifactError(f"Wallapop {job_id} intenta publicar IDs fuera de su tanda.")

    if (
        result.get("schemaVersion") != 1
        or result.get("jobId") != job_id
        or result.get("source") != "wallapop"
        or result.get("platformSlug") != platform
    ):
        raise ArtifactError(f"Wallapop {job_id} no coincide con su manifiesto.")
    result_searched = require_catalog_ids(result.get("searchedCatalogIds"), "result.searchedCatalogIds", maximum=20)
    result_catalog_ids = require_catalog_ids(result.get("catalogIds"), "result.catalogIds", maximum=100)
    result_verified = require_catalog_ids(result.get("verifiedCatalogIds"), "result.verifiedCatalogIds", maximum=100)
    if not (
        same_ids(searched, result_searched)
        and same_ids(result_ids, result_catalog_ids)
        and same_ids(verified, result_verified)
    ):
        raise ArtifactError(f"Wallapop {job_id} cambió el alcance entre manifiesto y resultado.")

    local_by_id = {
        str(game.get("id") or ""): game
        for game in catalog
        if isinstance(game, dict) and game.get("id")
    }
    result_games = [require_dict(game, "result.games[]") for game in require_list(result.get("games"), "result.games")]
    result_game_ids = [str(game.get("id") or "") for game in result_games]
    if not same_ids(result_ids, result_game_ids):
        raise ArtifactError(f"Wallapop {job_id} no contiene exactamente los juegos declarados.")
    result_by_id = {str(game.get("id") or ""): game for game in result_games}
    for catalog_id in verified:
        worker_game = result_by_id.get(catalog_id)
        local_game = local_by_id.get(catalog_id)
        if (
            not worker_game
            or not local_game
            or worker_game.get("priceRegionVerified") is not True
            or worker_game.get("platformSlug") != platform
            or local_game.get("platformSlug") != platform
            or worker_game.get("region") != local_game.get("region")
        ):
            raise ArtifactError(f"Wallapop {job_id} no acredita región y plataforma para {catalog_id}.")

    if ingest.get("source") != "wallapop" or ingest.get("platformSlug") != platform:
        raise ArtifactError(f"El ingest Wallapop {job_id} no coincide con la plataforma.")
    raw_rows = require_list(ingest.get("listings"), "listings")
    if len(raw_rows) > 2_000:
        raise ArtifactError(f"Wallapop {job_id} supera 2.000 anuncios.")
    clean_rows: list[dict[str, Any]] = []
    verified_set = set(verified)
    for index, raw_row in enumerate(raw_rows):
        row = require_dict(raw_row, f"listings[{index}]")
        catalog_id = str(row.get("catalogId") or "")
        if catalog_id not in verified_set:
            continue
        if row.get("regionVerified") is not True:
            continue
        local_game = local_by_id[catalog_id]
        expected_region = str(local_game.get("region") or "")
        if not all(
            (
                row.get("source") == "wallapop",
                str(row.get("listingRegion") or "") == expected_region,
                positive_price(row.get("priceEur")),
                trusted_product_url(
                    row.get("productUrl"),
                    hosts={"wallapop.com", "www.wallapop.com", "es.wallapop.com"},
                ),
            )
        ):
            raise ArtifactError(f"listings[{index}] no cumple el contrato Wallapop verificado.")
        clean_row = {
            key: row[key]
            for key in (
                "catalogId",
                "source",
                "listingType",
                "priceEur",
                "title",
                "listingRegion",
                "regionVerified",
                "regionEvidence",
                "aiConfidence",
                "externalId",
                "matchedReference",
                "productUrl",
                "condition",
                "conditionRaw",
                "conditionBucket",
                "conditionResolvedBy",
                "description",
                "listingDescription",
                "shippingEur",
                "estimatedTotalToSpainEur",
                "manualExpected",
                "originalContentsExpected",
            )
            if key in row
        }
        clean_row["catalogRegion"] = expected_region
        clean_rows.append(clean_row)

    rows_by_id = {str(row.get("catalogId") or "") for row in clean_rows}
    if not verified_set.issubset(rows_by_id):
        raise ArtifactError(f"Wallapop {job_id} declara juegos verificados sin anuncios válidos.")
    clean = {
        "platformSlug": platform,
        "collectedAt": ingest.get("collectedAt"),
        "source": "wallapop",
        "listings": clean_rows,
        "regionalCandidates": [],
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
        "tc": [],
    }
    return platform, clean, len(verified)


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "schemaVersion": 1,
            "todoconsolasCampaigns": [],
            "gameJobs": [],
            "wallapopJobs": [],
            "updatedAt": None,
        }
    try:
        raw = require_dict(json.loads(path.read_text(encoding="utf-8")), str(path))
    except (OSError, json.JSONDecodeError) as exc:
        raise ArtifactError(f"No se pudo leer el estado de publicación: {exc}") from exc
    return {
        "schemaVersion": 1,
        "todoconsolasCampaigns": [str(item) for item in raw.get("todoconsolasCampaigns") or []][-100:],
        "gameJobs": [str(item) for item in raw.get("gameJobs") or []][-500:],
        "wallapopJobs": [str(item) for item in raw.get("wallapopJobs") or []][-1_000:],
        "updatedAt": raw.get("updatedAt"),
    }


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    temporary.replace(path)


def run_sync(
    platform: str,
    payload: dict[str, Any],
    *,
    dry_run_only: bool,
    catalog_ids: list[str] | None = None,
) -> None:
    with tempfile.TemporaryDirectory(prefix="region-atlas-price-publish-") as temporary_dir:
        ingest_path = Path(temporary_dir) / f"{platform}.json"
        ingest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        base = [
            sys.executable,
            str(ROOT / "scripts" / "sync_es_prices.py"),
            "--platform",
            platform,
            "--input",
            str(ingest_path),
            "--no-advance-rotation",
            "--no-vision",
        ]
        if catalog_ids:
            catalog_ids_path = Path(temporary_dir) / "catalog-ids.json"
            catalog_ids_path.write_text(
                json.dumps({"catalogIds": catalog_ids}, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            base.extend(
                [
                    "--catalog-ids-file",
                    str(catalog_ids_path),
                    "--allow-cross-region-catalog-ids",
                ]
            )
        commands = [base + ["--dry-run"]] if dry_run_only else [base + ["--dry-run"], base]
        for command in commands:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=300, shell=False)
            output = (result.stdout + "\n" + result.stderr).strip()
            if output:
                print(output[-8_000:])
            if result.returncode != 0:
                raise ArtifactError(f"sync_es_prices falló para {platform} con código {result.returncode}.")


def process_todoconsolas(
    worker_base: str,
    state: dict[str, Any],
    *,
    dry_run: bool,
) -> list[str]:
    status = fetch_json(worker_base, "cron/todoconsolas-weekly-status.json", max_bytes=1_000_000)
    if status.get("status") != "ready_for_git":
        return []
    campaign_id = require_safe_id(status.get("campaignId"), "campaignId")
    if campaign_id in state["todoconsolasCampaigns"]:
        return []
    ready = fetch_json(
        worker_base,
        f"cron/todoconsolas-weekly/{quote(campaign_id, safe='')}/ready-for-git.json",
        max_bytes=3_000_000,
    )
    if ready.get("status") != "ready_for_git" or ready.get("campaignId") != campaign_id:
        raise ArtifactError("El manifiesto TodoConsolas no coincide con el estado listo.")
    manifests = require_dict(ready.get("platforms"), "ready.platforms")
    processed: list[str] = []
    for platform in sorted(manifests):
        if platform not in ALLOWED_PLATFORMS:
            raise ArtifactError(f"TodoConsolas intentó publicar {platform}.")
        manifest = require_dict(manifests[platform], f"ready.platforms.{platform}")
        expected = int(manifest.get("exactListings") or 0)
        raw_path = str(manifest.get("ingestPath") or "").replace("\\", "/")
        filename = Path(raw_path).name
        if raw_path != f"ingest/{filename}" or filename != f"todoconsolas-{platform}.json":
            raise ArtifactError("El manifiesto TodoConsolas contiene una ruta inesperada.")
        payload = fetch_json(
            worker_base,
            f"cron/todoconsolas-weekly/{quote(campaign_id, safe='')}/ingest/{filename}",
            max_bytes=15_000_000,
        )
        clean = validate_tcns_ingest(payload, platform, expected)
        run_sync(platform, clean, dry_run_only=dry_run)
        processed.append(f"TodoConsolas {platform}: {expected}")
    if not dry_run:
        state["todoconsolasCampaigns"] = [*state["todoconsolasCampaigns"], campaign_id][-100:]
    return processed


def process_game(
    worker_base: str,
    state: dict[str, Any],
    *,
    dry_run: bool,
    max_jobs: int,
) -> list[str]:
    queue = fetch_json(
        worker_base,
        "app/data/admin/local-game-runner-jobs.json",
        max_bytes=8_000_000,
    )
    jobs = []
    for raw_job in require_list(queue.get("jobs"), "jobs"):
        job = require_dict(raw_job, "job")
        if (
            job.get("trigger") == "automatic"
            and job.get("jobType") == "api_collect"
            and job.get("offerType") == "preowned"
            and job.get("status") == "done"
        ):
            jobs.append(job)
    jobs.sort(key=lambda item: str(item.get("finishedAt") or item.get("updatedAt") or ""))
    processed: list[str] = []
    for job in jobs:
        job_id = require_safe_id(job.get("id"), "GAME job id")
        if job_id in state["gameJobs"]:
            continue
        if len(processed) >= max_jobs:
            break
        platform = str(job.get("platformSlug") or "")
        result_path = str(job.get("resultPath") or "")
        expected_path = f"app/data/price-ingest/local-game/{job_id}.json"
        if result_path != expected_path:
            raise ArtifactError(f"GAME {job_id} declara una ruta de resultado inesperada.")
        payload = fetch_json(worker_base, result_path, max_bytes=15_000_000)
        clean = validate_game_ingest(payload, job)
        run_sync(platform, clean, dry_run_only=dry_run)
        processed.append(f"GAME {platform}: {len(clean.get('listings') or [])}")
        if not dry_run:
            state["gameJobs"] = [*state["gameJobs"], job_id][-500:]
    return processed


def process_wallapop(
    worker_base: str,
    state: dict[str, Any],
    *,
    dry_run: bool,
    max_jobs: int,
) -> list[str]:
    manifest_payload = fetch_json(
        worker_base,
        "cron/wallapop-pal-artifacts.json",
        max_bytes=8_000_000,
        missing_ok=True,
    )
    if manifest_payload is None:
        return []
    if manifest_payload.get("schemaVersion") != 1:
        raise ArtifactError("El manifiesto Wallapop tiene una versión no permitida.")
    artifacts = [
        require_dict(item, "wallapop.artifacts[]")
        for item in require_list(manifest_payload.get("artifacts"), "wallapop.artifacts")
    ]
    if len(artifacts) > 500:
        raise ArtifactError("El manifiesto Wallapop supera 500 lotes.")
    artifacts.sort(key=lambda item: str(item.get("finishedAt") or ""))
    catalog = require_list(json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8")), "catalog")
    processed: list[str] = []
    for manifest in artifacts:
        job_id = require_safe_id(manifest.get("jobId"), "Wallapop job id")
        if job_id in state["wallapopJobs"]:
            continue
        if len(processed) >= max_jobs:
            break
        expected_result_path = f"results/{job_id}/catalog-price-results.json"
        expected_ingest_path = f"results/{job_id}/wallapop-ingest.json"
        if manifest.get("resultPath") != expected_result_path or manifest.get("ingestResultPath") != expected_ingest_path:
            raise ArtifactError(f"Wallapop {job_id} declara rutas de resultado inesperadas.")
        result = fetch_json(worker_base, expected_result_path, max_bytes=15_000_000)
        ingest = fetch_json(worker_base, expected_ingest_path, max_bytes=15_000_000)
        platform, clean, verified_count = validate_wallapop_artifact(
            manifest,
            require_dict(result, expected_result_path),
            require_dict(ingest, expected_ingest_path),
            [require_dict(game, "catalog[]") for game in catalog],
        )
        verified_ids = require_catalog_ids(
            manifest.get("verifiedCatalogIds"),
            "verifiedCatalogIds",
            maximum=100,
        )
        run_sync(
            platform,
            clean,
            dry_run_only=dry_run,
            catalog_ids=verified_ids,
        )
        processed.append(f"Wallapop {platform}: {verified_count} verificados")
        if not dry_run:
            state["wallapopJobs"] = [*state["wallapopJobs"], job_id][-1_000:]
    return processed


def write_github_output(changed: bool, summary: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    with Path(output_path).open("a", encoding="utf-8") as handle:
        handle.write(f"changed={'true' if changed else 'false'}\n")
        handle.write(f"summary={summary.replace(chr(10), ' ')[:900]}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Publica lotes verificados del PC mediante Git")
    parser.add_argument("--worker-base", default=DEFAULT_WORKER_BASE)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--max-game-jobs", type=int, default=6)
    parser.add_argument("--max-wallapop-jobs", type=int, default=24)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_game_jobs <= 24:
        raise SystemExit("--max-game-jobs debe estar entre 1 y 24.")
    if not 1 <= args.max_wallapop_jobs <= 48:
        raise SystemExit("--max-wallapop-jobs debe estar entre 1 y 48.")

    state = load_state(args.state)
    processed = [
        *process_todoconsolas(args.worker_base, state, dry_run=args.dry_run),
        *process_game(
            args.worker_base,
            state,
            dry_run=args.dry_run,
            max_jobs=args.max_game_jobs,
        ),
        *process_wallapop(
            args.worker_base,
            state,
            dry_run=args.dry_run,
            max_jobs=args.max_wallapop_jobs,
        ),
    ]
    if processed and not args.dry_run:
        state["updatedAt"] = now_iso()
        save_state(args.state, state)
    summary = " · ".join(processed) if processed else "Sin artefactos nuevos verificados"
    print(summary)
    write_github_output(bool(processed and not args.dry_run), summary)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ArtifactError as exc:
        print(f"ERROR SEGURO: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
