"""Rutas de datos pesados: repo local vs disco externo (PAL ES Retro)."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RETRO_ROOT = Path("/Volumes/Nuevo vol/pal-es-retro")


def get_retro_root() -> Path:
    env = os.environ.get("PAL_ES_RETRO_ROOT", "").strip()
    if env:
        return Path(env).expanduser()
    if DEFAULT_RETRO_ROOT.exists():
        return DEFAULT_RETRO_ROOT
    return DEFAULT_RETRO_ROOT


def retro_subdir(name: str) -> Path:
    return get_retro_root() / name


def repo_or_external(repo_relative: str, external_subdir: str) -> Path:
    """Usa disco externo si está montado; si no, cae al path del repo."""
    external = retro_subdir(external_subdir)
    repo_path = ROOT / repo_relative
    if external.exists():
        return external
    return repo_path


def ingest_dir() -> Path:
    return repo_or_external("data/price-ingest", "ingest")


def pc_data_dir() -> Path:
    return repo_or_external("data/pc", "pc")


def museum_data_dir() -> Path:
    return repo_or_external("data/museum", "museum")


def enrich_cache_dir(source: str) -> Path:
    mapping = {
        "wikidata": "wikidata",
        "serialstation": "serialstation",
        "descriptions": "descriptions",
    }
    sub = mapping.get(source, source)
    return repo_or_external(f"data/{sub}", sub)


def pipeline_logs_dir() -> Path:
    return retro_subdir("logs")


def next_cache_dir() -> Path:
    return retro_subdir("cache") / ".next"
