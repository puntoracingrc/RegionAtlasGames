"""Política de IA: precios usan OpenAI ante duda; batch corre en paralelo."""

from __future__ import annotations

import os
import subprocess
from typing import Literal

OpenAiPurpose = Literal["price_on_demand", "batch"]

# Procesos de ingest de precios (monitorización / logs; no bloquean batch).
_PRICE_INGEST_PATTERNS = (
    "daily_price_ingest.py",
    "collect_wallapop.py",
    "collect_vinted.py",
    "collect_ebay_es.py",
    "collect_todocoleccion.py",
    "collect_todoconsolas.py",
    "collect_cex.py",
    "collect_japangameonline.py",
    "collect_kaotostore.py",
    "collect_chollogames.py",
    "sync_es_prices.py",
)


def _pgrep(pattern: str) -> bool:
    try:
        result = subprocess.run(
            ["pgrep", "-f", pattern],
            capture_output=True,
            check=False,
        )
        return result.returncode == 0
    except OSError:
        return False


def is_price_ingest_active() -> bool:
    """True si algún collector o sync de precios está en ejecución."""
    if os.environ.get("PRICE_AI_ACTIVE", "").strip():
        return True
    return any(_pgrep(pattern) for pattern in _PRICE_INGEST_PATTERNS)


def openai_key_present() -> bool:
    from collectors.common import load_local_env

    load_local_env()
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())


def price_collectors_use_ai() -> bool:
    """
    IA en collectors de precio: solo ante duda (match ambiguo, listing AI, visión carátula).
    Prioridad permanente: no se desactiva con DAILY_NO_AI (solo PRICE_AI_DISABLED=1).
    """
    if os.environ.get("PRICE_AI_DISABLED", "").strip():
        return False
    return openai_key_present()


def batch_openai_allowed(*, purpose: OpenAiPurpose = "batch") -> bool:
    """Batch y precios comparten OpenAI en paralelo (sin pausa mutua)."""
    if purpose == "price_on_demand":
        return price_collectors_use_ai()
    if os.environ.get("OPENAI_BATCH_DISABLED", "").strip():
        return False
    return openai_key_present()


def wait_for_batch_openai_slot(*, poll_seconds: float = 30.0, log_every: int = 10) -> None:
    """No-op: batch y ingest de precios corren en conjunto."""
    del poll_seconds, log_every


__all__ = [
    "batch_openai_allowed",
    "is_price_ingest_active",
    "openai_key_present",
    "price_collectors_use_ai",
    "wait_for_batch_openai_slot",
]
