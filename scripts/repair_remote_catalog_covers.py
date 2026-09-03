#!/usr/bin/env python3
"""Repara referencias de portada cuyo archivo falta en el hosting.

El catálogo conserva la ruta pública existente. Este comando compara esas rutas
con el almacenamiento remoto, resuelve la imagen usando el ``pcPath`` regional
exacto, la rasteriza de nuevo a 1000x1400 sin metadatos y sube únicamente los
archivos ausentes.

Ejemplos:
  python3 scripts/repair_remote_catalog_covers.py \
    --platform ps4 --regions USA,Japón --env-file /ruta/.env.local --dry-run
  python3 scripts/repair_remote_catalog_covers.py \
    --platform ps4 --regions USA,Japón --env-file /ruta/.env.local --limit 1

El directorio de trabajo es reanudable: las imágenes limpias y los mapas de
origen se reutilizan en ejecuciones posteriores.
"""

from __future__ import annotations

import argparse
import ftplib
import html
import json
import os
import posixpath
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from check_covers_upload import DEFAULT_BASE_URL  # noqa: E402
from import_pricecharting_software_list import (  # noqa: E402
    CoverTask,
    download_one_cover,
)
from seed_covers import scrape_pc_map  # noqa: E402
from upload_covers_ftp import (  # noqa: E402
    connect_ftp,
    connect_sftp,
    ensure_remote_dir,
    ensure_remote_dir_sftp,
    ftp_config,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
DEFAULT_WORK_DIR = Path("/tmp/regionatlas-cover-hosting-repair")
COVER_PREFIX = "/covers/"
CACHE_MAX_AGE_SECONDS = 6 * 60 * 60
USER_AGENT = "RegionAtlas-CoverRepair/1.0"
PC_BASE_URL = "https://www.pricecharting.com"
PC_IMAGE_RE = re.compile(
    r"https://storage\.googleapis\.com/images\.pricecharting\.com/[^\"' <]+",
    re.IGNORECASE,
)

# Alias históricos que representan el mismo lanzamiento físico regional. La
# ruta de destino no cambia; únicamente se reutiliza la fuente canónica.
REGIONAL_PC_PATH_ALIASES: dict[str, str] = {
    "/game/playstation-4/zanki-zero": (
        "/game/playstation-4/zanki-zero-last-beginning"
    ),
}

# Ediciones físicas verificadas que ya no tienen una ficha individual activa
# en el índice. Deben conservar la clasificación regional visible en portada.
EXACT_COVER_SOURCE_OVERRIDES: dict[str, str] = {
    "/game/playstation-4/mass-effect-andromeda-pathfinder-collector%27s-edition": (
        "https://i.ebayimg.com/images/g/rC8AAeSwXUhpbuSl/s-l1600.webp"
    ),
    "/game/playstation-4/my-hero-one%27s-justice-2-collector%27s-edition": (
        "https://i.ebayimg.com/00/s/MTYwMFgxMjAw/z/HOgAAOSwsalmjIwG/"
        "%24_57.PNG?set_id=880000500F"
    ),
    "/game/playstation-4/zanki-zero-last-beginning-day-one-edition": (
        "https://gamestation.hn/wp-content/uploads/2019/04/"
        "PS4-Zanki-Zero-Last-Beginning-game.jpg"
    ),
}


@dataclass(frozen=True)
class RepairTarget:
    catalog_id: str
    title: str
    region: str
    pc_path: str
    pc_console_path: str
    remote_key: str


def load_env_file(path: Path) -> None:
    """Carga únicamente configuración del hosting, sin ejecutar el archivo."""

    if not path.is_file():
        raise SystemExit(f"No existe --env-file: {path}")
    allowed = {"NEXT_PUBLIC_COVERS_BASE_URL"}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not (key.startswith("COVERS_FTP_") or key in allowed):
            continue
        if key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def parse_regions(raw: str) -> set[str]:
    regions = {region.strip() for region in raw.split(",") if region.strip()}
    if not regions:
        raise ValueError("debe indicarse al menos una región")
    return regions


def remote_key_from_cover_url(cover_url: Any, platform: str) -> str | None:
    value = str(cover_url or "").strip()
    expected_prefix = f"{COVER_PREFIX}{platform}/"
    if not value.startswith(expected_prefix):
        return None
    key = urllib.parse.unquote(value[len(COVER_PREFIX) :]).replace("\\", "/")
    normalized = posixpath.normpath(key).lstrip("/")
    if normalized != key or normalized.startswith("../"):
        return None
    if not normalized.startswith(f"{platform}/") or normalized.endswith("/"):
        return None
    return normalized


def pc_console_path(pc_path: str) -> str | None:
    match = re.fullmatch(r"/game/([^/]+)/[^/]+", str(pc_path or "").strip())
    return match.group(1) if match else None


def collect_repair_targets(
    catalog: Iterable[dict[str, Any]],
    *,
    platform: str,
    regions: set[str],
    remote_keys: set[str],
) -> tuple[list[RepairTarget], dict[str, int]]:
    stats = {
        "catalogRows": 0,
        "withRemoteCoverReference": 0,
        "alreadyPresent": 0,
        "withoutCoverReference": 0,
        "withoutExactPcPath": 0,
        "sharedRemoteReferences": 0,
    }
    by_remote_key: dict[str, RepairTarget] = {}

    for game in catalog:
        if game.get("platformSlug") != platform or game.get("region") not in regions:
            continue
        if game.get("listingStatus") == "excluded":
            continue
        stats["catalogRows"] += 1
        remote_key = remote_key_from_cover_url(game.get("coverUrl"), platform)
        if not remote_key:
            stats["withoutCoverReference"] += 1
            continue
        stats["withRemoteCoverReference"] += 1
        if remote_key in remote_keys:
            stats["alreadyPresent"] += 1
            continue
        path = str(game.get("pcPath") or "").strip()
        console_path = pc_console_path(path)
        if not console_path:
            stats["withoutExactPcPath"] += 1
            continue
        target = RepairTarget(
            catalog_id=str(game.get("id") or ""),
            title=str(game.get("title") or game.get("name") or game.get("id") or "Juego"),
            region=str(game.get("region") or ""),
            pc_path=path,
            pc_console_path=console_path,
            remote_key=remote_key,
        )
        existing = by_remote_key.get(remote_key)
        if existing:
            stats["sharedRemoteReferences"] += 1
            if existing.pc_path != target.pc_path:
                raise ValueError(
                    f"La ruta remota {remote_key} se comparte entre "
                    f"{existing.pc_path} y {target.pc_path}"
                )
            continue
        by_remote_key[remote_key] = target

    return sorted(by_remote_key.values(), key=lambda item: item.remote_key), stats


def _remote_platform_dir(remote_root: str, platform: str) -> str:
    return f"{str(remote_root).strip('/')}/{platform}".strip("/")


def list_remote_keys_sftp(sftp: Any, remote_root: str, platform: str) -> set[str]:
    base = _remote_platform_dir(remote_root, platform)
    keys: set[str] = set()

    def visit(remote_dir: str, relative_dir: str = "") -> None:
        for entry in sftp.listdir_attr(remote_dir):
            if entry.filename.startswith("._") or entry.filename == ".DS_Store":
                continue
            remote_path = f"{remote_dir}/{entry.filename}"
            relative_path = f"{relative_dir}/{entry.filename}".strip("/")
            if stat.S_ISDIR(entry.st_mode):
                visit(remote_path, relative_path)
            else:
                keys.add(f"{platform}/{relative_path}")

    visit(base)
    return keys


def list_remote_keys_ftp(ftp: ftplib.FTP, remote_root: str, platform: str) -> set[str]:
    base = f"/{_remote_platform_dir(remote_root, platform)}"
    keys: set[str] = set()
    for item in ftp.nlst(base):
        name = posixpath.basename(item.rstrip("/"))
        if not name or name.startswith("._") or name == ".DS_Store":
            continue
        keys.add(f"{platform}/{name}")
    return keys


def list_remote_keys(cfg: dict[str, Any], platform: str) -> set[str]:
    if str(cfg["protocol"]) == "sftp":
        ssh_client, sftp = connect_sftp(cfg)
        try:
            return list_remote_keys_sftp(sftp, str(cfg["remote_root"]), platform)
        finally:
            sftp.close()
            ssh_client.close()
    ftp = connect_ftp(cfg)
    try:
        return list_remote_keys_ftp(ftp, str(cfg["remote_root"]), platform)
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


def _source_cache_path(work_dir: Path, console_path: str) -> Path:
    safe_name = re.sub(r"[^a-z0-9-]+", "-", console_path.lower()).strip("-")
    return work_dir / "source-maps" / f"{safe_name}.json"


def load_source_map(
    console_path: str,
    *,
    work_dir: Path,
    refresh: bool,
) -> dict[str, str]:
    cache_path = _source_cache_path(work_dir, console_path)
    if cache_path.is_file() and not refresh:
        age = time.time() - cache_path.stat().st_mtime
        if age <= CACHE_MAX_AGE_SECONDS:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if isinstance(cached, dict):
                print(f"  {console_path}: {len(cached)} portadas (caché)", flush=True)
                return {str(key): str(value) for key, value in cached.items()}

    print(f"  {console_path}: consultando índice regional...", flush=True)
    source_map = scrape_pc_map(console_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(source_map, ensure_ascii=True, sort_keys=True),
        encoding="utf-8",
    )
    print(f"  {console_path}: {len(source_map)} portadas encontradas", flush=True)
    return source_map


def resolve_sources(
    targets: Iterable[RepairTarget], source_maps: dict[str, dict[str, str]]
) -> tuple[list[tuple[RepairTarget, str]], list[RepairTarget]]:
    resolved: list[tuple[RepairTarget, str]] = []
    unresolved: list[RepairTarget] = []
    for target in targets:
        regional_map = source_maps.get(target.pc_console_path, {})
        source_url = regional_map.get(target.pc_path)
        if not source_url:
            # Las semillas multirregión antiguas guardaron algunos + y & como
            # entidades HTML, mientras que el índice actual devuelve la ruta
            # canónica ya decodificada.
            source_url = regional_map.get(html.unescape(target.pc_path))
        if not source_url:
            alias_path = REGIONAL_PC_PATH_ALIASES.get(target.pc_path)
            if alias_path and pc_console_path(alias_path) == target.pc_console_path:
                source_url = regional_map.get(alias_path)
        if not source_url:
            source_url = EXACT_COVER_SOURCE_OVERRIDES.get(target.pc_path)
        if source_url:
            resolved.append((target, source_url))
        else:
            unresolved.append(target)
    return resolved, unresolved


def parse_pc_page_cover(page_html: str) -> str | None:
    candidates = list(dict.fromkeys(PC_IMAGE_RE.findall(page_html)))
    if not candidates:
        return None
    for candidate in candidates:
        if re.search(r"/1600\.jpg(?:\?.*)?$", candidate, re.IGNORECASE):
            return candidate
    return re.sub(r"/\d+\.jpg(?:\?.*)?$", "/1600.jpg", candidates[0])


def fetch_exact_pc_page_cover(target: RepairTarget) -> str | None:
    requested_path = html.unescape(target.pc_path)
    url = f"{PC_BASE_URL}{requested_path}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            final_path = urllib.parse.urlparse(response.url).path
            if urllib.parse.unquote(final_path) != urllib.parse.unquote(requested_path):
                return None
            page_html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return None
    return parse_pc_page_cover(page_html)


def resolve_exact_pc_pages(
    targets: list[RepairTarget], workers: int
) -> tuple[list[tuple[RepairTarget, str]], list[RepairTarget]]:
    resolved: list[tuple[RepairTarget, str]] = []
    unresolved: list[RepairTarget] = []
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 6))) as pool:
        futures = {pool.submit(fetch_exact_pc_page_cover, target): target for target in targets}
        for future in as_completed(futures):
            target = futures[future]
            try:
                source_url = future.result()
            except Exception:
                source_url = None
            if source_url:
                resolved.append((target, source_url))
            else:
                unresolved.append(target)
    return (
        sorted(resolved, key=lambda item: item[0].remote_key),
        sorted(unresolved, key=lambda item: item.remote_key),
    )


def download_targets(
    resolved: list[tuple[RepairTarget, str]], work_dir: Path, workers: int
) -> tuple[list[tuple[RepairTarget, Path]], list[dict[str, str]]]:
    downloaded: list[tuple[RepairTarget, Path]] = []
    failures: list[dict[str, str]] = []
    tasks: list[tuple[RepairTarget, CoverTask]] = []
    for target, source_url in resolved:
        destination = work_dir / "covers" / target.remote_key
        tasks.append(
            (
                target,
                CoverTask(
                    catalog_id=target.catalog_id,
                    title=target.title,
                    source_url=source_url,
                    destination=destination,
                ),
            )
        )

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(download_one_cover, task): (target, task) for target, task in tasks}
        for index, future in enumerate(as_completed(futures), start=1):
            target, task = futures[future]
            try:
                _, error, _ = future.result()
            except Exception as exc:  # noqa: BLE001 - un archivo no cancela el lote
                error = f"{type(exc).__name__}: {exc}"
            if error:
                failures.append(
                    {
                        "catalogId": target.catalog_id,
                        "remoteKey": target.remote_key,
                        "error": error,
                    }
                )
            else:
                downloaded.append((target, task.destination))
            if index % 100 == 0 or index == len(tasks):
                print(
                    f"  descargas {index}/{len(tasks)} "
                    f"({len(downloaded)} OK, {len(failures)} fallos)",
                    flush=True,
                )
    return sorted(downloaded, key=lambda item: item[0].remote_key), failures


def _remote_path(remote_root: str, remote_key: str) -> str:
    return f"{str(remote_root).strip('/')}/{remote_key}".strip("/")


def upload_targets_sftp(
    sftp: Any,
    remote_root: str,
    files: list[tuple[RepairTarget, Path]],
) -> tuple[list[str], list[dict[str, str]]]:
    uploaded: list[str] = []
    failures: list[dict[str, str]] = []
    for index, (target, local_path) in enumerate(files, start=1):
        remote_path = _remote_path(remote_root, target.remote_key)
        temporary = f"{remote_path}.uploading-{os.getpid()}"
        try:
            ensure_remote_dir_sftp(sftp, posixpath.dirname(remote_path))
            sftp.put(str(local_path), temporary)
            sftp.rename(temporary, remote_path)
            sftp.stat(remote_path)
            uploaded.append(target.remote_key)
        except Exception as exc:  # noqa: BLE001 - se informa por archivo
            try:
                sftp.remove(temporary)
            except Exception:
                pass
            failures.append({"remoteKey": target.remote_key, "error": str(exc)})
        if index % 50 == 0 or index == len(files):
            print(
                f"  subidas {index}/{len(files)} "
                f"({len(uploaded)} OK, {len(failures)} fallos)",
                flush=True,
            )
    return uploaded, failures


def upload_targets_ftp(
    ftp: ftplib.FTP,
    remote_root: str,
    files: list[tuple[RepairTarget, Path]],
) -> tuple[list[str], list[dict[str, str]]]:
    uploaded: list[str] = []
    failures: list[dict[str, str]] = []
    for index, (target, local_path) in enumerate(files, start=1):
        remote_path = _remote_path(remote_root, target.remote_key)
        temporary = f"{remote_path}.uploading-{os.getpid()}"
        try:
            ensure_remote_dir(ftp, posixpath.dirname(remote_path))
            with local_path.open("rb") as handle:
                ftp.storbinary(f"STOR /{temporary}", handle)
            ftp.rename(f"/{temporary}", f"/{remote_path}")
            ftp.size(f"/{remote_path}")
            uploaded.append(target.remote_key)
        except Exception as exc:  # noqa: BLE001 - se informa por archivo
            try:
                ftp.delete(f"/{temporary}")
            except Exception:
                pass
            failures.append({"remoteKey": target.remote_key, "error": str(exc)})
        if index % 50 == 0 or index == len(files):
            print(
                f"  subidas {index}/{len(files)} "
                f"({len(uploaded)} OK, {len(failures)} fallos)",
                flush=True,
            )
    return uploaded, failures


def upload_targets(
    cfg: dict[str, Any], files: list[tuple[RepairTarget, Path]]
) -> tuple[list[str], list[dict[str, str]]]:
    if str(cfg["protocol"]) == "sftp":
        ssh_client, sftp = connect_sftp(cfg)
        try:
            return upload_targets_sftp(sftp, str(cfg["remote_root"]), files)
        finally:
            sftp.close()
            ssh_client.close()
    ftp = connect_ftp(cfg)
    try:
        return upload_targets_ftp(ftp, str(cfg["remote_root"]), files)
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


def public_url(base_url: str, remote_key: str, cache_buster: str | None = None) -> str:
    url = f"{base_url.rstrip('/')}/{urllib.parse.quote(remote_key, safe='/')}"
    return f"{url}?repair={cache_buster}" if cache_buster else url


def http_file_ok(url: str, timeout: float = 30.0) -> bool:
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": USER_AGENT, "Range": "bytes=0-511"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content_type = str(response.headers.get("Content-Type") or "").lower()
            return response.status in {200, 206} and content_type.startswith("image/")
    except urllib.error.HTTPError as exc:
        return exc.code == 206 and str(exc.headers.get("Content-Type") or "").startswith("image/")
    except Exception:
        return False


def verify_public_files(
    base_url: str, remote_keys: list[str], workers: int
) -> tuple[list[str], list[str]]:
    verified: list[str] = []
    failed: list[str] = []
    cache_buster = str(int(time.time()))
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(http_file_ok, public_url(base_url, key, cache_buster)): key
            for key in remote_keys
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                ok = future.result()
            except Exception:
                ok = False
            (verified if ok else failed).append(key)
    return sorted(verified), sorted(failed)


def evenly_spaced_sample(values: list[str], limit: int) -> list[str]:
    ordered = sorted(set(values))
    if limit <= 0 or not ordered:
        return []
    if len(ordered) <= limit:
        return ordered
    if limit == 1:
        return [ordered[0]]
    indexes = {
        round(index * (len(ordered) - 1) / (limit - 1)) for index in range(limit)
    }
    return [ordered[index] for index in sorted(indexes)]


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Informe: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Repara archivos de portada ausentes sin modificar el catálogo"
    )
    parser.add_argument("--platform", required=True, help="Slug de plataforma")
    parser.add_argument("--regions", required=True, help="Regiones separadas por coma")
    parser.add_argument("--catalog", type=Path, default=CATALOG_FILE)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--refresh-source-cache", action="store_true")
    parser.add_argument("--skip-http-verify", action="store_true")
    parser.add_argument(
        "--http-verify-limit",
        type=int,
        default=24,
        help="Muestra máxima de archivos para verificar por HTTP (default: 24)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit debe ser mayor que cero")
    if args.http_verify_limit < 0:
        raise SystemExit("--http-verify-limit no puede ser negativo")
    if args.env_file:
        load_env_file(args.env_file.expanduser())
    regions = parse_regions(args.regions)
    platform = args.platform.strip().lower()
    work_dir = args.work_dir.expanduser().resolve()
    report_path = (args.report or (work_dir / f"report-{platform}.json")).expanduser()
    cfg = ftp_config()
    base_url = (
        os.environ.get("NEXT_PUBLIC_COVERS_BASE_URL", "").strip() or DEFAULT_BASE_URL
    ).rstrip("/")
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    if not isinstance(catalog, list):
        raise SystemExit(f"El catálogo no es una lista: {args.catalog}")

    print(f"Catálogo: {args.catalog}")
    print(f"Ámbito: {platform} · {', '.join(sorted(regions))}")
    print("Leyendo inventario remoto...", flush=True)
    remote_before = list_remote_keys(cfg, platform)
    targets, audit_stats = collect_repair_targets(
        catalog,
        platform=platform,
        regions=regions,
        remote_keys=remote_before,
    )
    total_missing = len(targets)
    if args.limit:
        targets = targets[: args.limit]

    print(
        f"Referencias ausentes: {total_missing}"
        + (f" · procesando {len(targets)}" if len(targets) != total_missing else ""),
        flush=True,
    )

    source_maps: dict[str, dict[str, str]] = {}
    for console_path in sorted({target.pc_console_path for target in targets}):
        source_maps[console_path] = load_source_map(
            console_path,
            work_dir=work_dir,
            refresh=args.refresh_source_cache,
        )
    resolved, unresolved = resolve_sources(targets, source_maps)
    if unresolved:
        page_resolved, unresolved = resolve_exact_pc_pages(unresolved, args.workers)
        resolved.extend(page_resolved)
        resolved.sort(key=lambda item: item[0].remote_key)
    print(f"Origen exacto: {len(resolved)} · sin origen: {len(unresolved)}")

    report: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dryRun": bool(args.dry_run),
        "platform": platform,
        "regions": sorted(regions),
        "catalogAudit": audit_stats,
        "remoteFilesBefore": len(remote_before),
        "missingBefore": total_missing,
        "selected": len(targets),
        "sourcesResolved": len(resolved),
        "sourcesMissing": [asdict(target) for target in unresolved],
        "downloadFailures": [],
        "uploadFailures": [],
        "uploaded": [],
        "publicVerificationSample": [],
        "publicVerified": [],
        "publicVerificationFailures": [],
    }
    if args.dry_run or not targets:
        write_report(report_path, report)
        if unresolved:
            raise SystemExit(2)
        return

    files, download_failures = download_targets(resolved, work_dir, args.workers)
    report["downloadFailures"] = download_failures
    print(f"Imágenes listas: {len(files)} · fallos: {len(download_failures)}")
    uploaded, upload_failures = upload_targets(cfg, files)
    report["uploaded"] = uploaded
    report["uploadFailures"] = upload_failures

    if uploaded and not args.skip_http_verify:
        verification_sample = evenly_spaced_sample(uploaded, args.http_verify_limit)
        report["publicVerificationSample"] = verification_sample
        verified, public_failures = verify_public_files(
            base_url, verification_sample, args.workers
        )
        report["publicVerified"] = verified
        report["publicVerificationFailures"] = public_failures
        print(f"CDN verificado: {len(verified)} · fallos: {len(public_failures)}")

    remote_after = list_remote_keys(cfg, platform)
    remaining, _ = collect_repair_targets(
        catalog,
        platform=platform,
        regions=regions,
        remote_keys=remote_after,
    )
    report["remoteFilesAfter"] = len(remote_after)
    report["missingAfter"] = len(remaining)
    write_report(report_path, report)

    failures = (
        len(unresolved)
        + len(download_failures)
        + len(upload_failures)
        + len(report["publicVerificationFailures"])
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
