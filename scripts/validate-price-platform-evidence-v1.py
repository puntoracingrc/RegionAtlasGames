#!/usr/bin/env python3
"""Valida filtros anti-plataforma equivocada en recolectores de precios."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.platform_evidence import product_platform_is_compatible  # noqa: E402


def expect(value: bool, expected: bool, label: str) -> None:
    if value != expected:
        raise AssertionError(f"{label}: esperado {expected}, recibido {value}")


def main() -> int:
    expect(
        product_platform_is_compatible(
            {
                "title": "RESERVA Big Tournament Golf NEOGEO AES+",
                "handle": "neogeo-aes-big-tournament-golf",
            },
            "neogeopocket",
        ),
        False,
        "Neo Geo AES no debe entrar como Neo Geo Pocket",
    )
    expect(
        product_platform_is_compatible(
            {
                "title": "Big Tournament Golf NEO GEO POCKET COLOR (Importación Japonesa)",
                "handle": "big-tournament-golf-neo-geo-pocket-color",
            },
            "neogeopocket",
        ),
        True,
        "Neo Geo Pocket Color sí debe entrar",
    )
    expect(
        product_platform_is_compatible(
            {
                "title": "Puzzle Bobble Mini NGPC",
                "handle": "puzzle-bobble-mini-ngpc",
            },
            "neogeopocket",
        ),
        True,
        "NGPC sí debe entrar",
    )
    print("OK validate-price-platform-evidence-v1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
