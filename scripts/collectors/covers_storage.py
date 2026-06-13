"""Rutas y nombres de portadas locales (disco externo + título del juego)."""

from __future__ import annotations

import io
import os
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_COVERS_ROOT = Path("/Volumes/Nuevo vol/pal-es-retro/covers")
PUBLIC_COVERS_SYMLINK = ROOT / "public" / "covers"
PUBLIC_URL_PREFIX = "/covers"


def get_covers_root() -> Path:
    """Directorio físico de portadas. Prioridad: COVERS_ROOT → symlink public/covers."""
    env = os.environ.get("COVERS_ROOT", "").strip()
    if env:
        return Path(env).expanduser()
    if PUBLIC_COVERS_SYMLINK.is_symlink():
        return PUBLIC_COVERS_SYMLINK.resolve()
    if PUBLIC_COVERS_SYMLINK.exists():
        return PUBLIC_COVERS_SYMLINK.resolve()
    return DEFAULT_COVERS_ROOT


def ensure_covers_root() -> Path:
    root = get_covers_root()
    if not root.exists():
        raise SystemExit(
            f"Portadas: disco no accesible en {root}\n"
            f"Monta el volumen externo y/o crea el symlink:\n"
            f'  ln -sf "{DEFAULT_COVERS_ROOT}" public/covers'
        )
    root.mkdir(parents=True, exist_ok=True)
    return root


def slugify_title(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text))
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "juego"


def cover_filename_from_title(title: str, platform: str, used: dict[str, set[str]]) -> str:
    """Nombre de archivo = slug del título (+ sufijo numérico solo si hay colisión en plataforma)."""
    base = slugify_title(title)
    names = used.setdefault(platform, set())
    candidate = f"{base}.jpg"
    if candidate not in names:
        names.add(candidate)
        return candidate
    n = 2
    while True:
        candidate = f"{base}-{n}.jpg"
        if candidate not in names:
            names.add(candidate)
            return candidate
        n += 1


def local_cover_path(platform: str, filename: str, *, root: Path | None = None) -> Path:
    return (root or get_covers_root()) / platform / filename


def public_cover_url(platform: str, filename: str) -> str:
    return f"{PUBLIC_URL_PREFIX}/{platform}/{filename}"


def is_local_cover_url(url: str | None) -> bool:
    return bool(url and str(url).startswith(f"{PUBLIC_URL_PREFIX}/"))


def save_cover_jpeg(raw: bytes, dest: Path) -> bool:
    """Guarda JPEG limpio (sin EXIF ni metadatos de la fuente remota)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif img.mode == "L":
            img = img.convert("RGB")
        clean = Image.new("RGB", img.size)
        clean.paste(img)
        buf = io.BytesIO()
        clean.save(buf, format="JPEG", quality=88, optimize=True)
        dest.write_bytes(buf.getvalue())
        return True
    except Exception:
        if raw[:3] == b"\xff\xd8\xff":
            dest.write_bytes(raw)
            return True
        return False
