#!/usr/bin/env python3
"""Collector genérico para fuentes configuradas desde /admin/precios.

MVP seguro:
- platform_routes: lee la ruta configurada para la plataforma y extrae cards HTML/JSON-LD.
- internal_search/sequence: construye búsquedas por título con urlTemplate.
- catalog_crawl/base_url: lee la URL general/supportUrl.

Si la estructura no se reconoce, falla con motivo claro y no bloquea la rueda.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import (  # noqa: E402
    build_search_query,
    load_json,
    load_local_env,
    now_iso,
    normalize_query,
    platform_catalog_games,
    prioritize_catalog_games,
    save_json,
)

load_local_env()

from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.platform_sources import generic_source_config, generic_source_enabled  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402

USER_AGENT = "RegionAtlasGames/1.0 (+generic-price-source)"
CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "generic"
PRICE_RE = re.compile(r"(?<![\w])(\d{1,5}(?:[.,]\d{2})?)\s*(?:€|&euro;|EUR)(?![\w])", re.I)
META_PRICE_RE = re.compile(r'(?:itemprop=["\']price["\'][^>]*content|content[^>]*itemprop=["\']price["\'])=["\']([^"\']+)["\']', re.I)
ARTICLE_RE = re.compile(
    r"<(article|li|div)[^>]+class=[\"'][^\"']*(?:product|product-miniature|product-item|card-product|js-product-miniature)[^\"']*[\"'][^>]*>(.*?)</\1>",
    re.I | re.S,
)
ANCHOR_RE = re.compile(r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.I | re.S)
IMG_RE = re.compile(r"(?:data-full-size-image-url|data-src|src)=[\"']([^\"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\"']*)?)[\"']", re.I)
PAGE_RE = re.compile(r"[?&]page=(\d+)|/page/(\d+)/?", re.I)
TAG_RE = re.compile(r"<[^>]+>")


class GenericSourceError(RuntimeError):
    pass


def clean_html_text(value: str) -> str:
    text = html.unescape(TAG_RE.sub(" ", value or ""))
    return re.sub(r"\s+", " ", text).strip()


def absolute_url(url: str, base_url: str) -> str:
    return urllib.parse.urljoin(base_url, html.unescape(url).strip())


def fetch_html(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            status = getattr(response, "status", 200)
            if status in {403, 429}:
                raise GenericSourceError(f"fuente bloqueada por HTTP {status}")
            return response.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        if exc.code in {403, 429}:
            raise GenericSourceError(f"fuente bloqueada por HTTP {exc.code}") from exc
        raise GenericSourceError(f"HTTP {exc.code} al consultar {url}") from exc
    except urllib.error.URLError as exc:
        raise GenericSourceError(f"no se pudo consultar {url}: {exc.reason}") from exc


def parse_price(raw: str | None) -> float | None:
    if not raw:
        return None
    text = html.unescape(str(raw)).strip()
    match = re.search(r"\d{1,5}(?:[.,]\d{1,2})?", text)
    if not match:
        return None
    value = match.group(0)
    if "," in value and "." in value:
        value = value.replace(".", "").replace(",", ".")
    else:
        value = value.replace(",", ".")
    try:
        price = round(float(value), 2)
    except ValueError:
        return None
    return price if price > 0 else None


def product_from_json_ld(node: dict[str, Any], page_url: str) -> dict[str, Any] | None:
    node_type = node.get("@type")
    if isinstance(node_type, list):
        is_product = any(str(item).lower() == "product" for item in node_type)
    else:
        is_product = str(node_type).lower() == "product"
    if not is_product:
        return None
    title = clean_html_text(str(node.get("name") or ""))
    offers = node.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    price = parse_price(str(offers.get("price") or "")) if isinstance(offers, dict) else None
    url = str(node.get("url") or (offers.get("url") if isinstance(offers, dict) else "") or "").strip()
    image = node.get("image")
    if isinstance(image, list):
        image_url = str(image[0] or "").strip()
    else:
        image_url = str(image or "").strip()
    if not title or price is None:
        return None
    return {
        "title": title,
        "priceEur": price,
        "productUrl": absolute_url(url or page_url, page_url),
        "imageUrl": absolute_url(image_url, page_url) if image_url else None,
        "conditionRaw": clean_html_text(str(node.get("itemCondition") or "")),
    }


def parse_json_ld_products(html_text: str, page_url: str) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html_text, re.I | re.S):
        raw = html.unescape(match.group(1)).strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        nodes = payload if isinstance(payload, list) else [payload]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            graph = node.get("@graph")
            nested = graph if isinstance(graph, list) else [node]
            for item in nested:
                if isinstance(item, dict) and (product := product_from_json_ld(item, page_url)):
                    products.append(product)
    return products


def parse_card_products(html_text: str, page_url: str) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for _, block in ARTICLE_RE.findall(html_text):
        price_match = META_PRICE_RE.search(block) or PRICE_RE.search(clean_html_text(block))
        price = parse_price(price_match.group(1) if price_match else None)
        if price is None:
            continue
        anchors = ANCHOR_RE.findall(block)
        best_url = ""
        best_title = ""
        for href, label_html in anchors:
            label = clean_html_text(label_html)
            if not label or len(label) < 2:
                continue
            if not best_title or len(label) > len(best_title):
                best_title = label
                best_url = href
        if not best_title or not best_url:
            title_attr = re.search(r'(?:title|alt)=["\']([^"\']+)["\']', block, re.I)
            best_title = clean_html_text(title_attr.group(1)) if title_attr else best_title
        if not best_title:
            continue
        image_match = IMG_RE.search(block)
        image_url = absolute_url(image_match.group(1), page_url) if image_match else None
        condition_match = re.search(r"(?:condition|estado)[^>]*>([^<]+)<", block, re.I)
        products.append(
            {
                "title": best_title,
                "priceEur": price,
                "productUrl": absolute_url(best_url or page_url, page_url),
                "imageUrl": image_url,
                "conditionRaw": clean_html_text(condition_match.group(1)) if condition_match else "",
            }
        )
    return products


def parse_products(html_text: str, page_url: str) -> list[dict[str, Any]]:
    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    for product in [*parse_json_ld_products(html_text, page_url), *parse_card_products(html_text, page_url)]:
        key = str(product.get("productUrl") or product.get("title") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        products.append(product)
    return products


def max_page_number(html_text: str, cap: int) -> int:
    pages = []
    for left, right in PAGE_RE.findall(html_text):
        raw = left or right
        if raw:
            pages.append(int(raw))
    return min(max(pages) if pages else 1, cap)


def page_url(base_url: str, page: int, template: str | None = None) -> str:
    if page <= 1:
        return base_url
    if template:
        return template.replace("{url}", base_url.rstrip("/")).replace("{page}", str(page))
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}page={page}"


def configured_int(config: dict[str, Any], key: str, fallback: int) -> int:
    try:
        value = int(config.get(key) or 0)
    except (TypeError, ValueError):
        value = 0
    return max(1, value or fallback)


def fetch_listing_products(
    url: str,
    *,
    crawl_mode: str,
    max_pages: int,
    max_scrolls: int,
    delay: float,
    product_limit: int | None,
    pagination_template: str | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    first_html = fetch_html(url)
    if crawl_mode == "static_catalog":
        total_pages = 1
    elif crawl_mode == "pagination":
        total_pages = max_page_number(first_html, max_pages)
    elif crawl_mode in {"infinite_scroll", "load_more_button"}:
        total_pages = max(1, min(max_pages, max_scrolls))
    else:
        total_pages = max_page_number(first_html, max_pages)
    products: list[dict[str, Any]] = []
    seen: set[str] = set()
    iterations: list[dict[str, Any]] = []
    stop_reason = "completed"

    for page in range(1, total_pages + 1):
        current_url = url if page == 1 else page_url(url, page, pagination_template)
        html_text = first_html if page == 1 else fetch_html(current_url)
        before = len(products)
        for product in parse_products(html_text, current_url):
            key = str(product.get("productUrl") or product.get("title") or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            product["sourcePageUrl"] = current_url
            products.append(product)
            if product_limit and len(products) >= product_limit:
                iterations.append({"step": page, "url": current_url, "newProducts": len(products) - before, "totalProducts": len(products)})
                return products, iterations, "max_products"
        new_products = len(products) - before
        iterations.append({"step": page, "url": current_url, "newProducts": new_products, "totalProducts": len(products)})
        print(f"  Carga {crawl_mode} paso {page}: +{new_products} productos · total {len(products)}")
        if page > 1 and crawl_mode in {"infinite_scroll", "load_more_button"} and new_products <= 0:
            stop_reason = "no_new_products"
            break
        if page < total_pages:
            time.sleep(delay)
    if len(iterations) >= total_pages and stop_reason == "completed":
        stop_reason = "limit_reached" if crawl_mode in {"infinite_scroll", "load_more_button"} else "last_page"
    return products, iterations, stop_reason


def render_template(template: str, game: dict[str, Any], platform_slug: str, region: str | None) -> str:
    title = build_search_query(game)
    rendered = (template or "{title}").replace("{title}", title).replace("{platform}", platform_slug).replace("{region}", region or "")
    return normalize_query(rendered) if "://" not in rendered else rendered.strip()


def source_base_url(config: dict[str, Any]) -> str:
    return str(config.get("url") or config.get("supportUrl") or "").strip().rstrip("/")


def collect_products(config: dict[str, Any], platform_slug: str, args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    strategy = str(config.get("strategy") or "manual_candidate").strip()
    delay = max(0.0, float(args.delay))
    crawl_mode = str(config.get("crawlMode") or ("internal_search" if strategy in {"internal_search", "sequence"} else "static_catalog")).strip()
    if crawl_mode not in {"static_catalog", "pagination", "infinite_scroll", "load_more_button", "internal_search"}:
        crawl_mode = "static_catalog"
    max_pages = configured_int(config, "maxPages", max(1, int(args.max_pages)))
    max_scrolls = configured_int(config, "maxScrolls", max_pages)
    max_products = configured_int(config, "maxProducts", max(1, int(args.limit))) if args.limit else configured_int(config, "maxProducts", 120)
    product_limit = min(max_products, int(args.limit)) if args.limit else max_products
    pagination_template = str(config.get("paginationTemplate") or "").strip() or None
    stats: dict[str, Any] = {
        "strategy": strategy,
        "crawlMode": crawl_mode,
        "urls": [],
        "queries": [],
        "iterations": [],
        "stopReason": None,
        "limits": {
            "maxPages": max_pages,
            "maxScrolls": max_scrolls,
            "maxProducts": product_limit,
        },
        "products_detected": 0,
        "structureRecognized": False,
    }

    cache_file = CACHE_DIR / str(config.get("id") or args.source) / f"{platform_slug}-{strategy}-{crawl_mode}.json"
    if args.use_cache and cache_file.exists():
        cached = load_json(cache_file, {})
        products = list(cached.get("products") or [])
        stats.update(cached.get("stats") or {})
        stats["cacheHit"] = True
        return products, stats

    products: list[dict[str, Any]] = []
    if strategy == "platform_routes":
        routes = config.get("platformRoutes") or {}
        if not isinstance(routes, dict):
            raise GenericSourceError("strategy=platform_routes pero platformRoutes no es un mapa")
        url = str(routes.get(platform_slug) or routes.get(platform_slug.lower()) or "").strip()
        if not url:
            raise GenericSourceError(f"sin URL por plataforma para {platform_slug}")
        stats["urls"].append(url)
        products, iterations, stop_reason = fetch_listing_products(
            url,
            crawl_mode=crawl_mode,
            max_pages=max_pages,
            max_scrolls=max_scrolls,
            delay=delay,
            product_limit=product_limit,
            pagination_template=pagination_template,
        )
        stats["iterations"] = iterations
        stats["stopReason"] = stop_reason
    elif strategy in {"catalog_crawl", "base_url"}:
        url = source_base_url(config)
        if not url:
            raise GenericSourceError("sin URL general/supportUrl para rastreo")
        stats["urls"].append(url)
        products, iterations, stop_reason = fetch_listing_products(
            url,
            crawl_mode=crawl_mode,
            max_pages=max_pages,
            max_scrolls=max_scrolls,
            delay=delay,
            product_limit=product_limit,
            pagination_template=pagination_template,
        )
        stats["iterations"] = iterations
        stats["stopReason"] = stop_reason
    elif strategy in {"internal_search", "sequence"}:
        url_template = str(config.get("urlTemplate") or "").strip()
        if not url_template:
            raise GenericSourceError("sin URL de búsqueda para buscador interno")
        base = source_base_url(config)
        games = prioritize_catalog_games(
            platform_catalog_games(platform_slug, args.region),
            args.limit,
            rotation_key=f"generic:{args.source}:{platform_slug}:{args.region or 'all'}",
        )
        for index, game in enumerate(games, start=1):
            query = render_template(str(config.get("queryTemplate") or "{title}"), game, platform_slug, args.region)
            url = url_template.replace("{title}", urllib.parse.quote_plus(query)).replace("{platform}", urllib.parse.quote_plus(platform_slug)).replace("{region}", urllib.parse.quote_plus(args.region or ""))
            url = absolute_url(url, base) if base else url
            stats["queries"].append(query)
            stats["urls"].append(url)
            rows, iterations, stop_reason = fetch_listing_products(
                url,
                crawl_mode="static_catalog" if crawl_mode == "internal_search" else crawl_mode,
                max_pages=max_pages,
                max_scrolls=max_scrolls,
                delay=delay,
                product_limit=product_limit,
                pagination_template=pagination_template,
            )
            products.extend(rows)
            stats["iterations"].extend({"query": query, **iteration} for iteration in iterations)
            stats["stopReason"] = stop_reason
            print(f"  [{index}/{len(games)}] «{query}» → {len(products)} productos acumulados")
            if product_limit and len(products) >= product_limit:
                stats["stopReason"] = "max_products"
                break
            if index < len(games):
                time.sleep(delay)
    else:
        raise GenericSourceError(f"estrategia no ejecutable por collector genérico: {strategy}")

    stats["products_detected"] = len(products)
    stats["structureRecognized"] = len(products) > 0
    if args.use_cache:
        save_json(cache_file, {"products": products, "stats": stats, "cachedAt": now_iso()})
    return products, stats


def row_from_product(product: dict[str, Any], matched_game: dict[str, Any], result, *, source_slug: str) -> dict[str, Any] | None:
    price = parse_price(str(product.get("priceEur") or ""))
    if price is None:
        return None
    match_meta = match_row_kwargs(result)
    row = {
        "catalogId": str(matched_game["id"]),
        "source": source_slug,
        "title": str(product.get("title") or "").strip(),
        "priceEur": price,
        "currency": "EUR",
        "productUrl": str(product.get("productUrl") or product.get("sourcePageUrl") or "").strip(),
        "listingUrl": str(product.get("productUrl") or product.get("sourcePageUrl") or "").strip(),
        "imageUrl": product.get("imageUrl"),
        "condition": "unknown",
        "conditionRaw": str(product.get("conditionRaw") or "").strip(),
        "inStock": True,
        "collectedAt": now_iso(),
        "matchMethod": match_meta.get("match_method") or "title",
    }
    if match_meta.get("matched_reference"):
        row["matchedReference"] = match_meta["matched_reference"]
    if match_meta.get("match_score") is not None:
        row["matchScore"] = round(float(match_meta["match_score"]), 3)
    if match_meta.get("match_margin") is not None:
        row["matchMargin"] = round(float(match_meta["match_margin"]), 3)
    if match_meta.get("match_alternatives"):
        row["matchAlternatives"] = match_meta["match_alternatives"]
    if match_meta.get("ai_confidence") is not None:
        row["aiConfidence"] = round(float(match_meta["ai_confidence"]), 3)
    return row


def run_platform(args: argparse.Namespace) -> int:
    source_slug = args.source.strip().lower()
    config = generic_source_config(source_slug)
    if not config:
        raise SystemExit(f"Fuente custom no encontrada: {source_slug}")
    if not generic_source_enabled(source_slug, args.platform, region=args.region):
        raise SystemExit(f"Fuente {source_slug} no ejecutable para {args.platform}: apagada, fuera de alcance o incompleta")

    print(f"=== Fuente genérica · {config.get('label') or source_slug} · {args.platform} ===")
    print(f"  Estrategia: {config.get('strategy')}")
    if args.region:
        print(f"  Región: {args.region}")

    products, source_stats = collect_products(config, args.platform, args)
    if not products:
        print("  AVISO: fuente configurada pero no ejecutable todavía: no se detectaron productos/precios con heurística genérica.")
        if not args.dry_run:
            save_json(
                args.output,
                {
                    "platformSlug": args.platform,
                    "collectedAt": now_iso(),
                    "source": source_slug,
                    "listings": [],
                    "cex": [],
                    "jgo": [],
                    "chollo": [],
                    "kaoto": [],
                    "tcns": [],
                    "stats": {**source_stats, "error": "structure_not_recognized"},
                },
            )
        return 0

    games = platform_catalog_games(args.platform, args.region)
    _, ref_to_ids = build_platform_reference_index(args.platform)
    match_opts = match_kwargs(args)
    previous_region_vision_disabled = os.environ.get("REGION_VISION_DISABLED")
    if not match_opts["use_ai"]:
        os.environ["REGION_VISION_DISABLED"] = "1"
    try:
        stats = run_match_pipeline(
            products,
            games,
            args.platform,
            source=source_slug,
            ref_to_ids=ref_to_ids,
            row_builder=lambda product, matched_game, result: row_from_product(product, matched_game, result, source_slug=source_slug),
            infer_listing_region=None,
            is_valid_product=lambda product: bool(product.get("title") and product.get("priceEur")),
            use_ai=match_opts["use_ai"],
            use_match_cache=match_opts["use_match_cache"],
        )
    finally:
        if previous_region_vision_disabled is None:
            os.environ.pop("REGION_VISION_DISABLED", None)
        else:
            os.environ["REGION_VISION_DISABLED"] = previous_region_vision_disabled
    print_match_stats(stats, label=source_slug, use_ai=match_opts["use_ai"])

    payload = {
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "source": source_slug,
        "searchMode": str(config.get("strategy") or "generic"),
        "listings": stats.rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
        "stats": {
            **source_stats,
            "products_matched": len(stats.rows),
            "matched_by_ai": stats.matched_by_ai,
            "ambiguous_skipped": stats.ambiguous_skipped,
            "region_rejected": stats.region_rejected,
        },
    }

    print(f"  Productos detectados: {len(products)} · filas verificables: {len(stats.rows)}")
    for row in stats.rows[:8]:
        print(f"  {row['catalogId']}: {row['priceEur']} € — {row.get('title', '')[:55]}")
    if len(stats.rows) > 8:
        print(f"  … y {len(stats.rows) - 8} más")

    if not args.dry_run:
        save_json(args.output, payload)
        print(f"  Guardado: {args.output}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect generic configured price source")
    parser.add_argument("--source", required=True, help="Slug/id de customSources")
    parser.add_argument("--platform", required=True, help="Slug de plataforma")
    parser.add_argument("--region", help="Región exacta del catálogo")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "price-ingest" / "generic-source.json")
    parser.add_argument("--limit", type=int, default=int(os.environ.get("GENERIC_SOURCE_LIMIT", "80")), help="Límite de productos o juegos")
    parser.add_argument("--max-pages", type=int, default=int(os.environ.get("GENERIC_SOURCE_MAX_PAGES", "2")))
    parser.add_argument("--delay", type=float, default=float(os.environ.get("GENERIC_SOURCE_DELAY_SEC", "0.8")))
    parser.add_argument("--use-cache", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    add_match_flags(parser)
    args = parser.parse_args()

    try:
        raise SystemExit(run_platform(args))
    except GenericSourceError as exc:
        print(f"  ERROR: {exc}")
        if not args.dry_run:
            save_json(
                args.output,
                {
                    "platformSlug": args.platform,
                    "collectedAt": now_iso(),
                    "source": args.source.strip().lower(),
                    "listings": [],
                    "cex": [],
                    "jgo": [],
                    "chollo": [],
                    "kaoto": [],
                    "tcns": [],
                    "stats": {"error": str(exc)},
                },
            )
        raise SystemExit(0)


if __name__ == "__main__":
    main()
