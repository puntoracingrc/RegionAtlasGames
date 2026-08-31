#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.wallapop_client import (  # noqa: E402
    SEARCH_MODE_ACTIVE,
    WallapopBlockedError,
    search_page,
)


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

    requested_urls: list[str] = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self) -> bytes:
            return json.dumps({"data": {"section": {"payload": {"items": []}}}}).encode()

    def success(request: urllib.request.Request, **_kwargs: object) -> FakeResponse:
        requested_urls.append(request.full_url)
        return FakeResponse()

    urllib.request.urlopen = success
    try:
        search_page(keywords="Astria Ascending ps4", search_mode=SEARCH_MODE_ACTIVE)
    finally:
        urllib.request.urlopen = original
    params = urllib.parse.parse_qs(urllib.parse.urlsplit(requested_urls[0]).query)
    assert params.get("order_by") == ["most_relevance"]
    assert "time_filter" not in params
    print("OK Wallapop blocking stop")


if __name__ == "__main__":
    main()
