#!/usr/bin/env python3
"""Compara portadas locales vs hosting (HTTP) o listado FTP exportado.

Uso:
  python3 scripts/check_covers_upload.py --platform ps2
  python3 scripts/check_covers_upload.py --remote-list ftp-ps2.txt
  python3 scripts/check_covers_upload.py --write-missing data/covers-missing-ps2.txt

Comprueba cada JPG local (sin archivos macOS ._*) contra:
  https://www.puntoracing.net/MEDIAREGIONATLAS/covers/...
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.covers_storage import get_covers_root  # noqa: E402

DEFAULT_BASE_URL = (
    os.environ.get("NEXT_PUBLIC_COVERS_BASE_URL", "").strip()
    or "https://www.puntoracing.net/MEDIAREGIONATLAS/covers"
).rstrip("/")

USER_AGENT = "RegionAtlas-CoversCheck/1.0"


def iter_local_jpegs(root: Path, platform: str | None) -> list[Path]:
    files: list[Path] = []
    if platform:
        bases = [root / platform]
    else:
        bases = [p for p in sorted(root.iterdir()) if p.is_dir() and not p.name.startswith(".")]

    for base in bases:
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            name = path.name
            if name.startswith("._") or name == ".DS_Store":
                continue
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            files.append(path)
    return files


def relative_key(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def load_remote_list(path: Path) -> set[str]:
    keys: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip().replace("\\", "/")
        if not line or line.startswith("#"):
            continue
        line = line.lstrip("/")
        if line.startswith("covers/"):
            line = line[len("covers/") :]
        keys.add(line)
    return keys


def remote_url(base_url: str, rel: str) -> str:
    return f"{base_url}/{rel}"


def head_ok(url: str, timeout: float) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as exc:
        return 200 <= exc.code < 300
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Portadas locales vs hosting puntoracing")
    parser.add_argument("--platform", help="Solo una plataforma (p. ej. ps2)")
    parser.add_argument("--covers-root", help="Raíz local de portadas (default: COVERS_ROOT o disco externo)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="URL base del hosting")
    parser.add_argument(
        "--remote-list",
        type=Path,
        help="Archivo con rutas remotas (una por línea: ps2/juego.jpg). Omite HTTP.",
    )
    parser.add_argument("--workers", type=int, default=12, help="Comprobaciones HTTP en paralelo")
    parser.add_argument("--timeout", type=float, default=20.0, help="Timeout HEAD (segundos)")
    parser.add_argument("--limit", type=int, help="Máximo de archivos a comprobar")
    parser.add_argument("--write-missing", type=Path, help="Guardar rutas faltantes (una por línea)")
    parser.add_argument("--write-upload-list", type=Path, help="Lista para FileZilla (rutas relativas)")
    args = parser.parse_args()

    root = Path(args.covers_root).expanduser() if args.covers_root else get_covers_root()
    if not root.is_dir():
        raise SystemExit(f"No existe la carpeta de portadas: {root}")

    local_files = iter_local_jpegs(root, args.platform)
    if args.limit:
        local_files = local_files[: args.limit]

    if not local_files:
        raise SystemExit(f"Sin JPG locales en {root}" + (f"/{args.platform}" if args.platform else ""))

    remote_keys: set[str] | None = None
    if args.remote_list:
        if not args.remote_list.is_file():
            raise SystemExit(f"No existe --remote-list: {args.remote_list}")
        remote_keys = load_remote_list(args.remote_list)

    missing: list[str] = []
    present = 0
    by_platform: dict[str, list[str]] = defaultdict(list)

    print(f"Local: {root}")
    print(f"Archivos a comprobar: {len(local_files)}")
    if remote_keys is not None:
        print(f"Modo: listado remoto ({args.remote_list})")
    else:
        print(f"Modo: HTTP HEAD → {args.base_url.rstrip('/')}/…")

    if remote_keys is not None:
        for path in local_files:
            rel = relative_key(root, path)
            if rel in remote_keys:
                present += 1
            else:
                missing.append(rel)
                by_platform[path.parent.name].append(rel)
    else:
        base = args.base_url.rstrip("/")

        def check(rel: str) -> tuple[str, bool]:
            return rel, head_ok(remote_url(base, rel), args.timeout)

        rels = [relative_key(root, p) for p in local_files]
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures = {pool.submit(check, rel): rel for rel in rels}
            done = 0
            total = len(rels)
            for future in as_completed(futures):
                rel, ok = future.result()
                done += 1
                if ok:
                    present += 1
                else:
                    missing.append(rel)
                    platform = rel.split("/", 1)[0]
                    by_platform[platform].append(rel)
                if done % 200 == 0 or done == total:
                    print(f"  … {done}/{total}")

    missing.sort()
    print()
    print(f"En hosting: {present}")
    print(f"Faltan: {len(missing)}")
    if by_platform:
        print("Por plataforma (faltantes):")
        for plat in sorted(by_platform):
            print(f"  {plat}: {len(by_platform[plat])}")

    if missing:
        print("\nPrimeros faltantes:")
        for rel in missing[:20]:
            print(f"  {rel}")
        if len(missing) > 20:
            print(f"  … y {len(missing) - 20} más")

    if args.write_missing:
        args.write_missing.parent.mkdir(parents=True, exist_ok=True)
        args.write_missing.write_text("\n".join(missing) + ("\n" if missing else ""), encoding="utf-8")
        print(f"\nGuardado: {args.write_missing}")

    if args.write_upload_list:
        args.write_upload_list.parent.mkdir(parents=True, exist_ok=True)
        lines = [str(root / rel) for rel in missing]
        args.write_upload_list.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        print(f"Lista local para re-subir: {args.write_upload_list}")

    if missing:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
