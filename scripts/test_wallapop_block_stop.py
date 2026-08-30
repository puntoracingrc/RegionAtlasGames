#!/usr/bin/env python3
from __future__ import annotations

import io
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.wallapop_client import WallapopBlockedError, search_page  # noqa: E402


def main() -> None:
    original = urllib.request.urlopen
    calls = 0

    def blocked(*_args: object, **_kwargs: object):
        nonlocal calls
        calls += 1
        raise urllib.error.HTTPError(
            "https://api.wallapop.com/api/v3/search",
            429,
            "Too Many Requests",
            {},
            io.BytesIO(b"rate limited"),
        )

    urllib.request.urlopen = blocked
    try:
        try:
            search_page(keywords="test ps4", retries=3)
        except WallapopBlockedError as exc:
            assert exc.status_code == 429
            assert "parada segura" in str(exc).lower()
        else:
            raise AssertionError("HTTP 429 debe detener Wallapop")
    finally:
        urllib.request.urlopen = original

    assert calls == 1, "Un bloqueo no debe reintentarse dentro de la misma tanda"
    print("OK Wallapop blocking stop")


if __name__ == "__main__":
    main()
