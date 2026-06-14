#!/usr/bin/env python3
"""Sube una sola portada al CDN (SFTP/FTP) en la ruta platform/slug.jpg."""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from upload_covers_ftp import (  # noqa: E402
    connect_ftp,
    connect_sftp,
    ftp_config,
    upload_file,
    upload_file_sftp,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Subir una portada al CDN")
    parser.add_argument("--platform", required=True, help="Slug plataforma, ej. snes")
    parser.add_argument("--slug", required=True, help="Slug del juego, ej. super-mario-world")
    parser.add_argument("--file", required=True, type=Path, help="Imagen local")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    local = args.file.expanduser().resolve()
    if not local.is_file():
        raise SystemExit(f"No existe el archivo: {local}")

    remote_rel = f"{args.platform.strip()}/{args.slug.strip()}.jpg"
    cfg = ftp_config()
    protocol = str(cfg["protocol"])

    if args.dry_run:
        print(f"DRY RUN → {cfg['remote_root']}/{remote_rel}")
        return

    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / remote_rel.replace("/", "__")
        staged.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local, staged)

        if protocol == "sftp":
            client, sftp = connect_sftp(cfg)
            try:
                upload_file_sftp(sftp, staged, remote_rel, str(cfg["remote_root"]))
            finally:
                sftp.close()
                client.close()
        else:
            ftp = connect_ftp(cfg)
            try:
                upload_file(ftp, staged, remote_rel, str(cfg["remote_root"]))
            finally:
                try:
                    ftp.quit()
                except Exception:
                    pass

    print(f"OK {remote_rel}")


if __name__ == "__main__":
    main()
