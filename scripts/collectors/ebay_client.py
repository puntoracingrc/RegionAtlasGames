"""Cliente eBay ES — Browse API (activos) + Finding legacy opcional (sold)."""

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
from collectors.ebay_region_policy import (
    browse_filters,
    ebay_regional_policy,
    end_user_context,
    import_costs_may_apply,
)
from collectors.listing_recency import listing_cutoff

USER_AGENT = "PAL-ES-Market/1.0 (+price-ingest; contact=local)"
FINDING_URL = "https://svcs.ebay.com/services/search/FindingService/v1"
BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
BROWSE_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item"
BROWSE_LEGACY_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id"
OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
TOKEN_CACHE = Path(__file__).resolve().parents[2] / "data" / "price-ingest" / "ebay-token-cache.json"

GLOBAL_ID_ES = "EBAY-ES"


def _browse_headers(token: str, marketplace_id: str, end_user: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": marketplace_id,
        "X-EBAY-C-ENDUSERCTX": end_user,
        "Accept": "application/json",
    }


def _refresh_browse_token(stale_token: str, client_id: str, client_secret: str) -> str:
    cached = load_json(TOKEN_CACHE, {})
    if cached.get("access_token") == stale_token:
        try:
            TOKEN_CACHE.unlink()
        except FileNotFoundError:
            pass
    return get_browse_token(client_id, client_secret)


def _money(block: Any) -> dict[str, Any] | None:
    if not isinstance(block, dict):
        return None
    try:
        value = float(block.get("value"))
    except (TypeError, ValueError):
        return None
    return {"value": value, "currency": str(block.get("currency") or "") or None}


def _image_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Preserve all API-returned gallery URLs in source order."""
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    groups = (
        ("PRIMARY", [payload.get("image")]),
        ("ADDITIONAL", payload.get("additionalImages") or []),
        ("THUMBNAIL", payload.get("thumbnailImages") or []),
    )
    for kind, images in groups:
        for image in images:
            if not isinstance(image, dict):
                continue
            url = str(image.get("imageUrl") or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)
            records.append({
                "url": url,
                "kind": kind,
                "width": image.get("width") if isinstance(image.get("width"), int) else None,
                "height": image.get("height") if isinstance(image.get("height"), int) else None,
            })
    return records


def _normalize_hydrated_item(payload: dict[str, Any], *, requested_item_id: str) -> dict[str, Any]:
    aspects: dict[str, list[str]] = {}
    for row in payload.get("localizedAspects") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        value = str(row.get("value") or "").strip()
        if name and value:
            aspects.setdefault(name, []).append(value)
    seller = payload.get("seller") if isinstance(payload.get("seller"), dict) else {}
    location = payload.get("itemLocation") if isinstance(payload.get("itemLocation"), dict) else {}
    legacy_id = str(payload.get("legacyItemId") or "").strip() or None
    rest_id = str(payload.get("itemId") or "").strip() or None
    return {
        "itemId": rest_id or requested_item_id,
        "legacyItemId": legacy_id or (requested_item_id if requested_item_id.isdigit() else None),
        "title": str(payload.get("title") or ""),
        "shortDescription": payload.get("shortDescription"),
        "description": payload.get("description"),
        "condition": payload.get("condition"),
        "conditionId": payload.get("conditionId"),
        "conditionDescription": payload.get("conditionDescription"),
        "itemWebUrl": payload.get("itemWebUrl"),
        "itemAffiliateWebUrl": payload.get("itemAffiliateWebUrl"),
        "images": _image_records(payload),
        "itemLocation": location,
        "seller": {
            "username": seller.get("username"),
            "feedbackPercentage": seller.get("feedbackPercentage"),
            "feedbackScore": seller.get("feedbackScore"),
        },
        "category": payload.get("categoryPath") or payload.get("categoryId"),
        "categoryId": payload.get("categoryId"),
        "aspects": aspects,
        "price": _money(payload.get("price")),
        "shippingOptions": payload.get("shippingOptions") if isinstance(payload.get("shippingOptions"), list) else [],
        "buyingOptions": payload.get("buyingOptions") if isinstance(payload.get("buyingOptions"), list) else [],
        "itemEndDate": payload.get("itemEndDate"),
        "estimatedAvailabilities": payload.get("estimatedAvailabilities") if isinstance(payload.get("estimatedAvailabilities"), list) else [],
        "gtin": payload.get("gtin"),
        "brand": payload.get("brand"),
        "mpn": payload.get("mpn"),
        "epid": payload.get("epid"),
    }


def hydrate_ebay_item(
    item_id: str,
    *,
    catalog_region: str = "PAL España",
    destination_postal_code: str = "",
    client_id: str = "",
    client_secret: str = "",
    access_token: str = "",
) -> dict[str, Any]:
    """Hydrate one exact listing through the official Browse item resource."""
    requested = str(item_id or "").strip()
    if not requested:
        raise ValueError("item_id is required")
    app_id = os.environ.get("EBAY_APP_ID", "").strip()
    resolved_client_id = client_id.strip() or os.environ.get("EBAY_CLIENT_ID", "").strip() or app_id
    resolved_secret = client_secret.strip() or os.environ.get("EBAY_CLIENT_SECRET", "").strip()
    token = access_token.strip() or os.environ.get("EBAY_ACCESS_TOKEN", "").strip() or os.environ.get("EBAY_OAUTH_TOKEN", "").strip()
    token = token or get_browse_token(resolved_client_id, resolved_secret)
    policy = ebay_regional_policy(catalog_region, destination_postal_code or None)
    if requested.isdigit():
        url = f"{BROWSE_LEGACY_ITEM_URL}?{urllib.parse.urlencode({'legacy_item_id': requested})}"
    else:
        url = f"{BROWSE_ITEM_URL}/{urllib.parse.quote(requested, safe='')}"
    headers = _browse_headers(token, policy.marketplace_id, end_user_context(policy))
    status, raw = _fetch(url, headers=headers)
    if status == 401 and resolved_client_id and resolved_secret:
        # A manually configured access token can expire while app credentials
        # remain valid. Retry once with a freshly issued client-credentials token.
        token = _refresh_browse_token(token, resolved_client_id, resolved_secret)
        status, raw = _fetch(url, headers=_browse_headers(token, policy.marketplace_id, end_user_context(policy)))
    if status != 200:
        raise RuntimeError(f"Browse item hydration ({status}): {raw[:500]}")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Browse item hydration returned invalid JSON") from exc
    return _normalize_hydrated_item(payload, requested_item_id=requested)


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
    listing_info = item.get("listingInfo", [{}])
    if isinstance(listing_info, list) and listing_info:
        ebay_listing_type = _first(listing_info[0].get("listingType"))
    else:
        ebay_listing_type = ""
    return {
        "title": title,
        "priceEur": price if currency in ("EUR", "") else price,
        "currency": currency,
        "itemId": item_id,
        "url": _first(item.get("viewItemURL")),
        "imageUrl": gallery or None,
        "ebayListingType": ebay_listing_type,
    }


def _is_auction_listing_type(listing_type: str) -> bool:
    key = listing_type.strip().lower()
    return key in ("auction", "auctionwithbin")


def is_active_auction(item: dict[str, Any]) -> bool:
    """Subastas en curso — precio de puja; vendidas (sold) sí cuentan."""
    if item.get("_listingType") == "sold":
        return False
    if "AUCTION" in (item.get("buyingOptions") or []):
        return True
    return _is_auction_listing_type(str(item.get("ebayListingType") or ""))


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
    else:
        # Activos: solo precio fijo — las subastas en curso distorsionan el mercado.
        params.append((f"itemFilter({idx}).name", "ListingType"))
        params.append((f"itemFilter({idx}).value", "FixedPrice"))
        idx += 1

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
        if not row:
            continue
        if not sold and _is_auction_listing_type(str(row.get("ebayListingType") or "")):
            continue
        parsed.append(row)
    return parsed


def browse_search(
    client_id: str,
    client_secret: str,
    keywords: str,
    *,
    catalog_region: str,
    destination_postal_code: str = "",
    max_results: int = 20,
    access_token: str = "",
) -> list[dict[str, Any]]:
    token = access_token.strip() or get_browse_token(client_id, client_secret)
    policy = ebay_regional_policy(catalog_region, destination_postal_code or None)
    params = urllib.parse.urlencode(
        {
            "q": keywords,
            "limit": str(min(max_results, 50)),
            # Solo compra inmediata; excluir subastas activas (precios de puja irreales).
            "filter": ",".join(browse_filters(policy)),
        }
    )
    url = f"{BROWSE_SEARCH_URL}?{params}"
    status, raw = _fetch(
        url,
        headers=_browse_headers(token, policy.marketplace_id, end_user_context(policy)),
    )
    if status == 401 and client_id and client_secret:
        token = _refresh_browse_token(token, client_id, client_secret)
        status, raw = _fetch(
            url,
            headers=_browse_headers(token, policy.marketplace_id, end_user_context(policy)),
        )
    if status != 200:
        raise RuntimeError(f"Browse API ({status}): {raw[:400]}")

    payload = json.loads(raw)
    parsed: list[dict[str, Any]] = []
    for item in payload.get("itemSummaries", []):
        buying_options = item.get("buyingOptions") or []
        if "AUCTION" in buying_options:
            continue
        price_block = item.get("price") or {}
        currency = str(price_block.get("currency") or "").upper()
        if currency != "EUR":
            continue
        try:
            price = float(price_block.get("value", 0))
        except (TypeError, ValueError):
            continue
        shipping_block = next(
            (
                option.get("shippingCost")
                for option in (item.get("shippingOptions") or [])
                if isinstance(option, dict) and isinstance(option.get("shippingCost"), dict)
            ),
            None,
        )
        shipping_eur: float | None = None
        if shipping_block and str(shipping_block.get("currency") or "").upper() == "EUR":
            try:
                shipping_eur = round(float(shipping_block.get("value")), 2)
            except (TypeError, ValueError):
                shipping_eur = None
        total_to_spain = round(price + shipping_eur, 2) if shipping_eur is not None else None
        thumb = item.get("thumbnailImages") or []
        image_url = (item.get("image") or {}).get("imageUrl") or (
            thumb[0].get("imageUrl") if thumb and isinstance(thumb[0], dict) else None
        )
        image_urls = list(
            dict.fromkeys(
                str(url)
                for url in [
                    image_url,
                    *[
                        image.get("imageUrl")
                        for image in [*thumb, *(item.get("additionalImages") or [])]
                        if isinstance(image, dict)
                    ],
                ]
                if url
            )
        )
        origin_country = (item.get("itemLocation") or {}).get("country")
        parsed.append(
            {
                "title": item.get("title", ""),
                "priceEur": round(price, 2),
                "currency": currency,
                "originalPrice": price_block.get("convertedFromValue"),
                "originalCurrency": price_block.get("convertedFromCurrency"),
                "shippingEur": shipping_eur,
                "estimatedTotalToSpainEur": total_to_spain,
                "itemId": item.get("itemId", ""),
                "url": item.get("itemWebUrl", ""),
                "imageUrl": image_url,
                "imageUrls": image_urls,
                "buyingOptions": buying_options,
                "marketplaceId": policy.marketplace_id,
                "originCountry": origin_country,
                "originLabel": policy.origin_label,
                "destinationCountry": policy.destination_country,
                "destinationPostalCode": policy.destination_postal_code,
                "importCostsMayApply": import_costs_may_apply(policy, origin_country),
                "regionRestricted": policy.region_restricted,
            }
        )
    return parsed


def search_ebay_es(
    keywords: str,
    *,
    catalog_region: str = "",
    destination_postal_code: str = "",
    sold: bool = False,
    max_results: int = 20,
) -> tuple[list[dict[str, Any]], str]:
    """Busca en eBay ES. Devuelve (items, backend usado).

    Browse OAuth es la vía fiable para activos de precio fijo. Finding queda solo
    como ruta legacy para vendidos y nunca debe caer silenciosamente a activos.
    """
    app_id = os.environ.get("EBAY_APP_ID", "").strip()
    client_id = os.environ.get("EBAY_CLIENT_ID", "").strip() or app_id
    client_secret = os.environ.get("EBAY_CLIENT_SECRET", "").strip()
    access_token = (
        os.environ.get("EBAY_ACCESS_TOKEN", "").strip()
        or os.environ.get("EBAY_OAUTH_TOKEN", "").strip()
    )

    finding_error: RuntimeError | None = None
    if sold and not os.environ.get("EBAY_ALLOW_LEGACY_SOLD", "").strip():
        raise RuntimeError(
            "eBay vendidos está desactivado: findCompletedItems/SoldItemsOnly es legacy/no fiable. "
            "Usa activos Browse API o define EBAY_ALLOW_LEGACY_SOLD=1 bajo tu responsabilidad."
        )

    if app_id and (sold or not ((client_id and client_secret) or access_token)):
        try:
            items = finding_search(app_id, keywords, sold=sold, max_results=max_results)
            return items, "finding-sold" if sold else "finding-active"
        except RuntimeError as exc:
            finding_error = exc
            if sold or not ((client_id and client_secret) or access_token):
                raise

    if access_token or (client_id and client_secret):
        items = browse_search(
            client_id,
            client_secret,
            keywords,
            catalog_region=catalog_region,
            destination_postal_code=destination_postal_code,
            max_results=max_results,
            access_token=access_token,
        )
        if finding_error:
            return items, "browse-active-finding-unavailable"
        return items, "browse-active-token" if access_token else "browse-active"

    if finding_error:
        raise finding_error

    raise RuntimeError(
        "Faltan credenciales eBay. Define EBAY_ACCESS_TOKEN, EBAY_CLIENT_ID + EBAY_CLIENT_SECRET "
        "(Browse) o EBAY_APP_ID (Finding, descontinuada). Ver docs/phase-2-ingest.md"
    )
