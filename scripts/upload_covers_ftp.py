#!/usr/bin/env python3
"""Sube portadas locales al hosting puntoracing (SFTP o FTP/FTPS).

Variables (.env.local o entorno):
  COVERS_FTP_HOST
  COVERS_FTP_USER
  COVERS_FTP_PASSWORD
  COVERS_FTP_REMOTE_ROOT=MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers
  COVERS_FTP_PROTOCOL=sftp|ftp          (default: sftp si puerto 22)
  COVERS_FTP_PORT=22                    (SFTP) o 21 (FTP)
  COVERS_FTP_TLS=1                      (solo FTP, FTPS explícito)

Uso:
  python3 scripts/upload_covers_ftp.py --platform wii,saturn,ps3,ps1,sega32x
  python3 scripts/upload_covers_ftp.py --missing-file data/covers-missing-wii.txt
  python3 scripts/upload_covers_ftp.py --platform wii --dry-run
"""

from __future__ import annotations

import argparse
import ftplib
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from check_covers_upload import (  # noqa: E402
    DEFAULT_BASE_URL,
    head_ok,
    iter_local_jpegs,
    relative_key,
)
from collectors.covers_storage import get_covers_root  # noqa: E402

USER_AGENT = "RegionAtlas-CoversUpload/1.0"


def load_env_local() -> None:
    path = ROOT / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("COVERS_FTP_") and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def ftp_config() -> dict[str, str | bool | int]:
    load_env_local()
    host = os.environ.get("COVERS_FTP_HOST", "").strip()
    user = os.environ.get("COVERS_FTP_USER", "").strip()
    password = os.environ.get("COVERS_FTP_PASSWORD", "").strip()
    remote_root = os.environ.get(
        "COVERS_FTP_REMOTE_ROOT", "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers"
    ).strip().strip("/")
    port_raw = os.environ.get("COVERS_FTP_PORT", "").strip()
    port = int(port_raw) if port_raw.isdigit() else 22
    protocol = os.environ.get("COVERS_FTP_PROTOCOL", "").strip().lower()
    if not protocol:
        protocol = "sftp" if port == 22 else "ftp"
    use_tls = os.environ.get("COVERS_FTP_TLS", "1").strip().lower() not in {"0", "false", "no"}
    if not host or not user or not password:
        raise SystemExit(
            "Faltan credenciales FTP/SFTP.\n"
            "Añade a .env.local (ver .env.example).\n"
        )
    return {
        "host": host,
        "user": user,
        "password": password,
        "remote_root": remote_root,
        "port": port,
        "protocol": protocol,
        "use_tls": use_tls,
    }


def connect_sftp(cfg: dict[str, str | bool | int]):
    import paramiko

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        str(cfg["host"]),
        port=int(cfg["port"]),
        username=str(cfg["user"]),
        password=str(cfg["password"]),
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    return client, client.open_sftp()


def ensure_remote_dir_sftp(sftp, remote_dir: str) -> None:
    parts = [p for p in remote_dir.replace("\\", "/").split("/") if p]
    path = ""
    for part in parts:
        path = f"{path}/{part}" if path else part
        try:
            sftp.stat(path)
        except OSError:
            try:
                sftp.mkdir(path)
            except OSError:
                pass


def upload_file_sftp(sftp, local_path: Path, remote_rel: str, remote_root: str) -> None:
    remote_dir = f"{remote_root}/{Path(remote_rel).parent.as_posix()}".replace("\\", "/").strip("/")
    if remote_dir and remote_dir != ".":
        ensure_remote_dir_sftp(sftp, remote_dir)
    remote_path = f"{remote_root}/{remote_rel}".replace("\\", "/")
    sftp.put(str(local_path), remote_path)


def connect_ftp(cfg: dict[str, str | bool]) -> ftplib.FTP:
    host = str(cfg["host"])
    user = str(cfg["user"])
    password = str(cfg["password"])
    use_tls = bool(cfg["use_tls"])

    if use_tls:
        ftp: ftplib.FTP = ftplib.FTP_TLS(context=ssl.create_default_context())
        ftp.connect(host, 21, timeout=60)
        ftp.login(user, password)
        ftp.prot_p()
    else:
        ftp = ftplib.FTP()
        ftp.connect(host, 21, timeout=60)
        ftp.login(user, password)
    ftp.set_pasv(True)
    return ftp


def ensure_remote_dir(ftp: ftplib.FTP, remote_dir: str) -> None:
    parts = [p for p in remote_dir.replace("\\", "/").split("/") if p]
    path = ""
    for part in parts:
        path = f"{path}/{part}" if path else part
        try:
            ftp.cwd(f"/{path}")
        except ftplib.error_perm:
            try:
                ftp.mkd(f"/{path}")
            except ftplib.error_perm:
                pass


def upload_file(ftp: ftplib.FTP, local_path: Path, remote_rel: str, remote_root: str) -> None:
    remote_dir = f"{remote_root}/{Path(remote_rel).parent.as_posix()}".replace("\\", "/")
    remote_dir = remote_dir.replace("/.", "/").strip("/")
    if remote_dir.endswith("."):
        remote_dir = remote_dir[:-1]
    ensure_remote_dir(ftp, remote_dir)
    remote_path = f"{remote_root}/{remote_rel}".replace("\\", "/")
    with local_path.open("rb") as handle:
        ftp.storbinary(f"STOR /{remote_path}", handle)


def load_missing_file(path: Path, covers_root: Path) -> list[Path]:
    files: list[Path] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        rel = line.strip().replace("\\", "/")
        if not rel or rel.startswith("#"):
            continue
        files.append(covers_root / rel)
    return files


def collect_targets(
    covers_root: Path,
    *,
    platforms: list[str] | None,
    missing_file: Path | None,
    base_url: str,
    skip_existing: bool,
    limit: int | None,
) -> list[tuple[Path, str]]:
    if missing_file:
        paths = load_missing_file(missing_file, covers_root)
    elif platforms:
        paths = []
        for platform in platforms:
            paths.extend(iter_local_jpegs(covers_root, platform))
    else:
        paths = iter_local_jpegs(covers_root, None)

    targets: list[tuple[Path, str]] = []
    for path in paths:
        if not path.is_file():
            continue
        rel = relative_key(covers_root, path)
        if skip_existing and head_ok(f"{base_url.rstrip('/')}/{rel}", timeout=12.0):
            continue
        targets.append((path, rel))

    if limit:
        targets = targets[:limit]
    return targets


def parse_platforms(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    return [p.strip() for p in raw.split(",") if p.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sube portadas al hosting puntoracing por FTP")
    parser.add_argument("--platform", help="Slugs separados por coma (p. ej. wii,ps3)")
    parser.add_argument("--missing-file", type=Path, help="Lista relativa (salida de check_covers_upload)")
    parser.add_argument("--covers-root", help="Raíz local de portadas")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="URL pública para omitir ya subidas")
    parser.add_argument("--no-skip-existing", action="store_true", help="Subir aunque ya respondan HTTP 200")
    parser.add_argument("--limit", type=int, help="Máximo de archivos")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    covers_root = Path(args.covers_root).expanduser() if args.covers_root else get_covers_root()
    if not covers_root.is_dir():
        raise SystemExit(f"No existe la carpeta de portadas: {covers_root}")

    platforms = parse_platforms(args.platform)
    targets = collect_targets(
        covers_root,
        platforms=platforms,
        missing_file=args.missing_file,
        base_url=args.base_url,
        skip_existing=not args.no_skip_existing,
        limit=args.limit,
    )

    print(f"Local: {covers_root}")
    print(f"Archivos a subir: {len(targets)}")
    if not targets:
        print("Nada pendiente.")
        return

    if args.dry_run:
        print(f"Remoto previsto: MEDIAREGIONATLAS/covers/")
        for _, rel in targets[:20]:
            print(f"  {rel}")
        if len(targets) > 20:
            print(f"  … y {len(targets) - 20} más")
        return

    cfg = ftp_config()
    print(f"Remoto: /{cfg['remote_root']}/ ({cfg['protocol']}:{cfg['port']})")
    uploaded = 0
    failed: list[tuple[str, str]] = []
    started = time.time()
    use_sftp = str(cfg["protocol"]) == "sftp"
    ssh_client = None
    sftp = None
    ftp = None

    if use_sftp:
        ssh_client, sftp = connect_sftp(cfg)
    else:
        ftp = connect_ftp(cfg)

    try:
        for idx, (local_path, rel) in enumerate(targets, start=1):
            try:
                if use_sftp:
                    assert sftp is not None
                    upload_file_sftp(sftp, local_path, rel, str(cfg["remote_root"]))
                else:
                    assert ftp is not None
                    upload_file(ftp, local_path, rel, str(cfg["remote_root"]))
                uploaded += 1
            except Exception as exc:
                failed.append((rel, str(exc)))
            if idx % 25 == 0 or idx == len(targets):
                elapsed = max(time.time() - started, 1)
                rate = uploaded / elapsed * 60
                print(f"  … {idx}/{len(targets)} ({uploaded} OK, {len(failed)} err, {rate:.0f}/min)")
    finally:
        if sftp is not None:
            sftp.close()
        if ssh_client is not None:
            ssh_client.close()
        if ftp is not None:
            try:
                ftp.quit()
            except Exception:
                pass

    print()
    print(f"Subidos: {uploaded}")
    print(f"Fallidos: {len(failed)}")
    if failed:
        print("Primeros errores:")
        for rel, err in failed[:15]:
            print(f"  {rel}: {err[:120]}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
