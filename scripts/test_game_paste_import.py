#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from import_game_paste import parse_game_paste  # noqa: E402


def main() -> None:
    pasted = """
EA Sports FC 25 - Seminuevo
EA Sports FC 25 - Seminuevo

Comprar
24 '99 €
Figura Sonic 20cm
Figura Sonic 20cm
Comprar
12 '99 €
7 '99 €
Resident Evil 4 Remake - Seminuevo
Resident Evil 4 Remake - Seminuevo
Comprar
39 '99 €
Resident Evil 4 Remake - Seminuevo
Resident Evil 4 Remake - Seminuevo
Comprar
39 '99 €
"""
    products, skipped, stats = parse_game_paste(pasted, offer_type="preowned")
    assert [product["title"] for product in products] == ["EA Sports FC 25", "Resident Evil 4 Remake"]
    assert [product["priceEur"] for product in products] == [24.99, 39.99]
    assert skipped[0]["title"] == "Figura Sonic 20cm"
    assert stats["skippedLikelyNonGames"] == 1
    assert stats["duplicateSkipped"] == 1
    assert stats["strayPrices"] == 1
    assert products[0]["sourceSku"].startswith("paste-")
    print("OK GAME paste import parser")


if __name__ == "__main__":
    main()
