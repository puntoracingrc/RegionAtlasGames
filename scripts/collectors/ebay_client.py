"""Cliente eBay ES — Finding API (sold/active) + Browse API (active)."""

from __future__ import annotations

import base64
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from collectors.common import load_json, save_json
from collectors.listing_recency import listing_cutoff

USER_AGENT = "PAL-ES-Market/1.0 (+price-ingest; contact=local)"
FINDING_URL = "https://svcs.ebay.com/services/search/FindingService/v1"
BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
TOKEN_CACHE = Path(__file__).resolve().parents[2] / "data" / "price-ingest" / "ebay-token-cache.json"

GLOBAL_ID_ES = "EBAY-ES"
MARKETPLACE_ES = "EBAY_ES"


def _fetch(url: str, headers: dict[str, str] | None = None, data: bytes | None = None, method: str = "GET") -> tuple[int, str]:
    hdrs = {"User-Agent": USER_AGENT, **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.status, resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return e.code, body
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as e:
        return 0, str(e)


def get_browse_token(client_id: str, client_secret: str) -> str:
    cached = load_json(TOKEN_CACHE, {})
    if cached.get("access_token") and cached.get("expires_at", 0) > time.time() + 60:
        return cached["access_token"]

    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    body = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "scope": "https://api.ebay.com/oauth/api_scope",
        }
    ).encode()
    status, raw = _fetch(
        OAUTH_URL,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=body,
        method="POST",
    )
    if status != 200:
        raise RuntimeError(f"OAuth eBay falló ({status}): {raw[:300]}")

    payload = json.loads(raw)
    token = payload["access_token"]
    save_json(
        TOKEN_CACHE,
        {
            "access_token": token,
            "expires_at": time.time() + int(payload.get("expires_in", 7200)),
        },
    )
    return token


def _finding_items(payload: dict[str, Any], response_key: str) -> list[dict[str, Any]]:
    try:
        block = payload[f"{response_key}Response"][0]
        results = block.get("searchResult", [])
        if not results:
            return []
        items = results[0].get("item", [])
        return items if isinstance(items, list) else [items]
    except (KeyError, IndexError, TypeError):
        return []


def _first(value: Any) -> str:
    if isinstance(value, list) and value:
        v = value[0]
        if isinstance(v, dict):
            return str(v.get("__value__", v.get("value", "")))
        return str(v)
    if isinstance(value, dict):
        return str(value.get("__value__", value.get("value", "")))
    return str(value or "")


def _parse_finding_item(item: dict[str, Any]) -> dict[str, Any] | None:
    title = _first(item.get("title"))
    price_raw = item.get("sellingStatus", [{}])
    if isinstance(price_raw, list) and price_raw:
        price_block = price_raw[0].get("currentPrice") or price_raw[0].get("convertedCurrentPrice")
    else:
        price_block = None
    if not price_block:
        return None
    if isinstance(price_block, list):
        price_block = price_block[0]
    try:
        price = float(_first(price_block))
    except ValueError:
        return None
    currency = price_block.get("@currencyId") if isinstance(price_block, dict) else "EUR"
    item_id = _first(item.get("itemId"))
    gallery = _first(item.get("galleryURL"))
    return {
        "title": title,
        "priceEur": price if currency in ("EUR", "") else price,
        "currency": currency,
        "itemId": item_id,
        "url": _first(item.get("viewItemURL")),
        "imageUrl": gallery or None,
    }


def finding_search(
    app_id: str,
    keywords: str,
    *,
    sold: bool = False,
    located_in: str = "ES",
    max_results: int = 20,
) -> list[dict[str, Any]]:
    op = "findCompletedItems" if sold else "findItemsAdvanced"
    params: list[tuple[str, str]] = [
        ("OPERATION-NAME", op),
        ("SERVICE-VERSION", "1.0.0"),
        ("SECURITY-APPNAME", app_id),
        ("RESPONSE-DATA-FORMAT", "JSON"),
        ("REST-PAYLOAD", ""),
        ("GLOBAL-ID", GLOBAL_ID_ES),
        ("keywords", keywords),
        ("paginationInput.entriesPerPage", str(min(max_results, 50))),
        ("sortOrder", "PricePlusShippingLowest"),
    ]
    idx = 0
    if located_in:
        params.append((f"itemFilter({idx}).name", "LocatedIn"))
        params.append((f"itemFilter({idx}).value", located_in))
        idx += 1
    if sold:
        params.append((f"itemFilter({idx}).name", "SoldItemsOnly"))
        params.append((f"itemFilter({idx}).value", "true"))
        idx += 1
        end_from = listing_cutoff().replace(microsecond=0).isoformat().replace("+00:00", "Z")
        params.append((f"itemFilter({idx}).name", "EndTimeFrom"))
        params.append((f"itemFilter({idx}).value", end_from))

    url = FINDING_URL + "?" + urllib.parse.urlencode(params)
    status, raw = _fetch(url)
    if status != 200:
        raise RuntimeError(f"Finding API ({status}): {raw[:400]}")

    payload = json.loads(raw)
    ack = payload.get(f"{op}Response", [{}])[0].get("ack", [""])[0]
    if ack not in ("Success", "Warning"):
        errors = payload.get(f"{op}Response", [{}])[0].get("errorMessage", "")
        raise RuntimeError(f"Finding API ack={ack}: {errors}")

    items = _finding_items(payload, op)
    parsed: list[dict[str, Any]] = []
    for item in items:
        row = _parse_finding_item(item)
        if row:
            parsed.append(row)
    return parsed


def browse_search(
    client_id: str,
    client_secret: str,
    keywords: str,
    *,
    max_results: int = 20,
) -> list[dict[str, Any]]:
    token = get_browse_token(client_id, client_secret)
    params = urllib.parse.urlencode(
        {
            "q": keywords,
            "limit": str(min(max_results, 50)),
            "filter": "buyingOptions:{FIXED_PRICE|AUCTION}",
        }
    )
    url = f"{BROWSE_SEARCH_URL}?{params}"
    status, raw = _fetch(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ES,
            "Accept": "application/json",
        },
    )
    if status != 200:
        raise RuntimeError(f"Browse API ({status}): {raw[:400]}")

    payload = json.loads(raw)
    parsed: list[dict[str, Any]] = []
    for item in payload.get("itemSummaries", []):
        try:
            price = float(item.get("price", {}).get("value", 0))
        except (TypeError, ValueError):
            continue
        thumb = item.get("thumbnailImages") or []
        image_url = (item.get("image") or {}).get("imageUrl") or (
            thumb[0].get("imageUrl") if thumb and isinstance(thumb[0], dict) else None
        )
        parsed.append(
            {
                "title": item.get("title", ""),
                "priceEur": price,
                "currency": item.get("price", {}).get("currency", "EUR"),
                "itemId": item.get("itemId", ""),
                "url": item.get("itemWebUrl", ""),
                "imageUrl": image_url,
            }
        )
    return parsed


def search_ebay_es(
    keywords: str,
    *,
    sold: bool = False,
    max_results: int = 20,
) -> tuple[list[dict[str, Any]], str]:
    """Busca en eBay ES. Devuelve (items, backend usado).

    Finding API está descontinuada (2025); Browse OAuth es la vía fiable para activos.
    Si Finding falla y hay Client ID/Secret, hace fallback a Browse (solo activos).
    """
    app_id = os.environ.get("EBAY_APP_ID", "").strip()
    client_id = os.environ.get("EBAY_CLIENT_ID", "").strip() or app_id
    client_secret = os.environ.get("EBAY_CLIENT_SECRET", "").strip()

    finding_error: RuntimeError | None = None
    if app_id and (sold or not (client_id and client_secret)):
        try:
            items = finding_search(app_id, keywords, sold=sold, max_results=max_results)
            return items, "finding-sold" if sold else "finding-active"
        except RuntimeError as exc:
            finding_error = exc
            if not (client_id and client_secret):
                raise

    if client_id and client_secret:
        items = browse_search(client_id, client_secret, keywords, max_results=max_results)
        if finding_error:
            return items, "browse-active-finding-unavailable"
        return items, "browse-active"

    if finding_error:
        raise finding_error

    raise RuntimeError(
        "Faltan credenciales eBay. Define EBAY_CLIENT_ID + EBAY_CLIENT_SECRET (Browse) o "
        "EBAY_APP_ID (Finding, descontinuada). Ver docs/phase-2-ingest.md"
    )
