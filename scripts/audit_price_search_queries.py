#!/usr/bin/env python3
"""Audita las queries reales que construyen los collectors de precios."""

from __future__ import annotations

import argparse
import json
import tempfile
import sys
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors import platform_sources as ps  # noqa: E402
from collectors.cex_client import ALGOLIA_PROXY, DEFAULT_HITS_PER_PAGE, build_cex_search_query  # noqa: E402
from collectors.chollo_client import CHOLLO_BASE  # noqa: E402
from collectors.common import build_ebay_search_query, load_json, normalize_query  # noqa: E402
from collectors.ebay_client import BROWSE_SEARCH_URL, FINDING_URL, GLOBAL_ID_ES, MARKETPLACE_ES  # noqa: E402
from collectors.jgo_client import JGO_WP_API, build_jgo_search_query  # noqa: E402
from collectors.kaoto_client import build_kaoto_search_query, search_url as kaoto_search_url  # noqa: E402
from collectors.tc_client import advanced_search_url, build_tc_search_query  # noqa: E402
from collectors.tcns_client import build_tcns_search_query, search_url as tcns_search_url  # noqa: E402
from collectors.vinted_client import build_vinted_search_query, search_url as vinted_search_url  # noqa: E402
from collectors.wallapop_client import (  # noqa: E402
    DEFAULT_CATEGORY_ID,
    WALLAPOP_API,
    build_wallapop_query,
    wallapop_order_by,
    wallapop_time_filter,
)

DEFAULT_PLATFORM_SLUGS = ["neogeopocket", "neogeo", "sega32x", "megadrive", "ps2", "ps4", "ps5", "ds"]
DEFAULT_SAMPLE_TITLES = {
    "neogeopocket": ["Baseball Stars", "Samurai Shodown", "Puzzle Bobble Mini"],
    "neogeo": ["Metal Slug", "Samurai Shodown", "King of Fighters"],
    "sega32x": ["Virtua Racing", "Doom", "Knuckles"],
    "megadrive": ["Sonic the Hedgehog", "Streets of Rage", "Golden Axe"],
    "ps2": ["Grand Theft Auto", "Metal Gear Solid 2", "Final Fantasy X"],
    "ps4": ["Bloodborne", "God of War", "The Last of Us"],
    "ps5": ["Demon", "Spider-Man", "Ratchet"],
    "ds": ["Mario Kart", "Professor Layton", "Pokemon"],
}


def load_catalog() -> list[dict[str, Any]]:
    return load_json(ROOT / "data" / "catalog.json", [])


def load_platforms_by_slug() -> dict[str, dict[str, Any]]:
    return {str(p.get("slug")): p for p in load_json(ROOT / "data" / "platforms.json", []) if p.get("slug")}


def games_for_platform(catalog: list[dict[str, Any]], platform_slug: str, limit: int) -> list[dict[str, Any]]:
    candidates = [
        game
        for game in catalog
        if game.get("platformSlug") == platform_slug and game.get("listingStatus") != "excluded"
    ]
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()
    for needle in DEFAULT_SAMPLE_TITLES.get(platform_slug, []):
        hit = next((game for game in candidates if needle.lower() in str(game.get("title") or "").lower()), None)
        if hit and str(hit.get("id")) not in seen:
            seen.add(str(hit.get("id")))
            picked.append(hit)
    for game in candidates:
        if len(picked) >= limit:
            break
        if str(game.get("id")) in seen:
            continue
        seen.add(str(game.get("id")))
        picked.append(game)
    return picked[:limit]


def wallapop_url(query: str) -> str:
    params = {
        "source": "search_box",
        "filters_source": "search_box",
        "longitude": "-3.7038",
        "latitude": "40.4168",
        "order_by": wallapop_order_by(),
        "category_ids": DEFAULT_CATEGORY_ID,
        "time_filter": wallapop_time_filter(),
        "keywords": query,
    }
    return f"{WALLAPOP_API}?{urllib.parse.urlencode(params)}"


def cex_url_template(query: str) -> str:
    params = urllib.parse.urlencode(
        {
            "query": query,
            "hitsPerPage": DEFAULT_HITS_PER_PAGE,
            "page": 0,
        }
    )
    return f"{ALGOLIA_PROXY}/1/indexes/{{algoliaIndexName}}?{params}"


def jgo_url(query: str) -> str:
    params = urllib.parse.urlencode({"search": normalize_query(query), "page": 1, "per_page": 100})
    return f"{JGO_WP_API}?{params}"


def ebay_browse_url(query: str) -> str:
    params = urllib.parse.urlencode(
        {
            "q": query,
            "limit": "20",
            "filter": "buyingOptions:{FIXED_PRICE}",
        }
    )
    return f"{BROWSE_SEARCH_URL}?{params}"


def ebay_finding_url_template(query: str, *, sold: bool) -> str:
    op = "findCompletedItems" if sold else "findItemsAdvanced"
    params: list[tuple[str, str]] = [
        ("OPERATION-NAME", op),
        ("SERVICE-VERSION", "1.0.0"),
        ("SECURITY-APPNAME", "{EBAY_APP_ID}"),
        ("RESPONSE-DATA-FORMAT", "JSON"),
        ("REST-PAYLOAD", ""),
        ("GLOBAL-ID", GLOBAL_ID_ES),
        ("keywords", query),
        ("paginationInput.entriesPerPage", "20"),
        ("sortOrder", "PricePlusShippingLowest"),
        ("itemFilter(0).name", "LocatedIn"),
        ("itemFilter(0).value", "ES"),
    ]
    if sold:
        params.extend(
            [
                ("itemFilter(1).name", "SoldItemsOnly"),
                ("itemFilter(1).value", "true"),
                ("itemFilter(2).name", "EndTimeFrom"),
                ("itemFilter(2).value", "{listing_cutoff_utc}"),
            ]
        )
    else:
        params.extend([("itemFilter(1).name", "ListingType"), ("itemFilter(1).value", "FixedPrice")])
    return f"{FINDING_URL}?{urllib.parse.urlencode(params)}"


def category_url(base: str, category_path: str, *, page_param: str) -> str:
    clean = category_path.strip("/")
    if not clean:
        return ""
    return f"{base}/{clean}?{page_param}=1"


def collector_rows(game: dict[str, Any], platform: dict[str, Any] | None) -> list[dict[str, Any]]:
    platform_slug = str(game.get("platformSlug") or "")
    title = str(game.get("title") or "")
    rows: list[dict[str, Any]] = []

    def add(
        source: str,
        query: str | None,
        endpoint: str,
        *,
        mode: str = "title",
        enabled: bool | None = None,
        planned: bool | None = None,
        notes: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        rows.append(
            {
                "source": source,
                "enabled": ps.collector_enabled(source) if enabled is None else enabled,
                "plannedForPlatform": source in ps.collectors_for_platform(platform_slug, ebay_configured=True)
                if planned is None
                else planned,
                "mode": mode,
                "query": query,
                "endpoint": endpoint,
                "payload": payload,
                "addsPlatform": False,
                "addsRegion": False,
                "normalization": "normalize_query: acentos fuera, puntuación a espacios, espacios colapsados",
                "notes": notes,
            }
        )

    wallapop_query = build_wallapop_query(game)
    add("wallapop", wallapop_query, wallapop_url(wallapop_query), notes="Busca solo título; filtra categoría videojuegos y ubicación Madrid por defecto.")

    cex_query = build_cex_search_query(game)
    add("cex", cex_query, cex_url_template(cex_query), notes="Busca solo título en Algolia; el índice real viene de prelogin de CeX.")

    jgo_query = build_jgo_search_query(game)
    add("jgo", jgo_query, jgo_url(jgo_query), notes="Busca solo título en WP REST y luego resuelve el producto WooCommerce por slug.")

    chollo_category = ps.chollo_category(platform_slug)
    add(
        "chollo",
        None,
        category_url(CHOLLO_BASE, chollo_category or "", page_param="p"),
        mode="platform-category",
        planned=bool(chollo_category) and ps.collector_enabled("chollo"),
        notes="No hay query por juego: barre categoría de plataforma configurada y matchea después.",
        payload={"category": chollo_category},
    )

    kaoto_query = build_kaoto_search_query(game)
    add("kaoto", kaoto_query, kaoto_search_url(kaoto_query, page=1), notes="Busca solo título en Shopify search y luego consulta /products/{handle}.json.")

    tcns_query = build_tcns_search_query(game)
    add("todoconsolas", tcns_query, tcns_search_url(tcns_query, page=1), notes="Busca solo título en PrestaShop; si la fuente está apagada no entra en la rueda.")

    ebay_query = build_ebay_search_query(game, platform)
    add(
        "ebay",
        ebay_query,
        ebay_browse_url(ebay_query),
        planned=ps.ebay_price_wheel_enabled() and ps.collector_enabled("ebay"),
        notes="Browse API para activos si hay credenciales; solo título, sin plataforma ni región.",
        payload={"marketplace": MARKETPLACE_ES, "buyingOptions": "FIXED_PRICE"},
    )
    add(
        "ebay-finding-legacy-active",
        ebay_query,
        ebay_finding_url_template(ebay_query, sold=False),
        enabled=ps.collector_enabled("ebay"),
        planned=False,
        notes="Finding legacy; plantilla con app id. Usa LocatedIn=ES y ListingType=FixedPrice.",
    )
    add(
        "ebay-finding-legacy-sold",
        ebay_query,
        ebay_finding_url_template(ebay_query, sold=True),
        enabled=ps.collector_enabled("ebay"),
        planned=False,
        notes="Finding legacy vendidos; solo si se habilita sold legacy. Añade LocatedIn=ES, SoldItemsOnly y fecha mínima.",
    )

    vinted_query = build_vinted_search_query(game)
    add("vinted", vinted_query, vinted_search_url(vinted_query, page=1), notes="Referencia apagada por defecto; busca solo título y ordena newest_first.")

    tc_query = build_tc_search_query(game)
    add("todocoleccion", tc_query, advanced_search_url(tc_query, page=1), notes="Referencia apagada por defecto; búsqueda avanzada con frase exacta solo título.")

    return rows


def audit(platform_slugs: list[str], samples_per_platform: int) -> dict[str, Any]:
    catalog = load_catalog()
    platforms = load_platforms_by_slug()
    report: dict[str, Any] = {
        "generatedBy": "scripts/audit_price_search_queries.py",
        "sourceSettings": str(ps.SOURCES_FILE),
        "notes": [
            "No ejecuta requests contra fuentes externas.",
            "Muestra builders/URLs/payloads generados por el código actual.",
            "Chollo Games es barrido por categoría, no búsqueda por título.",
        ],
        "platforms": [],
        "recommendedCorrections": [],
    }
    for platform_slug in platform_slugs:
        platform = platforms.get(platform_slug, {"slug": platform_slug, "name": platform_slug, "shortName": platform_slug})
        games = games_for_platform(catalog, platform_slug, samples_per_platform)
        platform_block = {
            "platformSlug": platform_slug,
            "platformName": platform.get("name") or platform_slug,
            "shortName": platform.get("shortName") or platform.get("name") or platform_slug,
            "plannedCollectors": ps.collectors_for_platform(platform_slug, ebay_configured=True),
            "samples": [],
        }
        if not games:
            platform_block["warning"] = "No hay juegos de catálogo listados para esta plataforma."
        for game in games:
            platform_block["samples"].append(
                {
                    "catalogId": game.get("id"),
                    "rawTitle": str(game.get("title") or ""),
                    "title": unescape(str(game.get("title") or "")),
                    "platform": platform_block["platformName"],
                    "region": game.get("region"),
                    "sources": collector_rows(game, platform),
                }
            )
        report["platforms"].append(platform_block)

    for platform_block in report["platforms"]:
        for sample in platform_block.get("samples", []):
            for row in sample.get("sources", []):
                query = str(row.get("query") or "").lower()
                if query.endswith((" ngpc", " ps2", " ps4", " ps5", " megadrive", " 32x")):
                    report["recommendedCorrections"].append(
                        {
                            "source": row.get("source"),
                            "catalogId": sample.get("catalogId"),
                            "query": row.get("query"),
                            "recommendation": "Revisar sufijo automático de plataforma.",
                        }
                    )
                if "&" in query or "#39" in query or "quot" in query:
                    report["recommendedCorrections"].append(
                        {
                            "source": row.get("source"),
                            "catalogId": sample.get("catalogId"),
                            "query": row.get("query"),
                            "recommendation": "Decodificar entidades HTML del título antes de normalizar la query.",
                        }
                    )
    return report


def write_markdown(report: dict[str, Any], output: Path) -> None:
    lines = [
        "# Auditoría de queries de recolectores de precios",
        "",
        "Este informe muestra lo que el código actual construye antes de llamar a cada fuente. No ejecuta scraping.",
        f"Configuración de fuentes usada: `{report.get('sourceSettings')}`.",
        "",
    ]
    for platform in report["platforms"]:
        lines.append(f"## {platform['platformName']} (`{platform['platformSlug']}`)")
        lines.append("")
        lines.append(f"- Collectors planificados ahora: {', '.join(platform.get('plannedCollectors') or []) or 'ninguno'}")
        if platform.get("warning"):
            lines.append(f"- Aviso: {platform['warning']}")
        lines.append("")
        for sample in platform.get("samples", []):
            lines.append(f"### {sample['title']} · {sample['region']}")
            lines.append("")
            lines.append("| Fuente | Activa | En rueda | Modo | Query exacta | URL/Payload | Notas |")
            lines.append("| --- | --- | --- | --- | --- | --- | --- |")
            for row in sample["sources"]:
                query = row["query"] if row["query"] is not None else "—"
                endpoint = row["endpoint"] or json.dumps(row["payload"], ensure_ascii=False)
                notes = row["notes"].replace("|", "\\|")
                lines.append(
                    f"| {row['source']} | {'sí' if row['enabled'] else 'no'} | "
                    f"{'sí' if row['plannedForPlatform'] else 'no'} | {row['mode']} | "
                    f"`{query}` | `{endpoint}` | {notes} |"
                )
            lines.append("")
    lines.append("## Correcciones recomendadas")
    lines.append("")
    if report.get("recommendedCorrections"):
        for item in report["recommendedCorrections"]:
            lines.append(f"- `{item['source']}` / `{item['catalogId']}`: `{item['query']}` → {item['recommendation']}")
    else:
        lines.append("- No se detectan sufijos automáticos obvios en las muestras generadas.")
    lines.append("")
    output.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Audita queries/URLs de collectors de precios")
    parser.add_argument("--platform", action="append", dest="platforms", help="Slug de plataforma; repetible")
    parser.add_argument("--samples", type=int, default=3, help="Juegos de muestra por plataforma")
    parser.add_argument("--json", type=Path, default=ROOT / "logs" / "price-search-query-audit.json")
    parser.add_argument("--markdown", type=Path, default=ROOT / "logs" / "price-search-query-audit.md")
    parser.add_argument("--sources-url", help="URL de platform-sources.json para auditar estado real del worker")
    args = parser.parse_args()

    temp_sources: tempfile.NamedTemporaryFile[bytes] | None = None
    if args.sources_url:
        with urllib.request.urlopen(args.sources_url, timeout=30) as response:
            payload = response.read()
        temp_sources = tempfile.NamedTemporaryFile("wb", delete=False)
        temp_sources.write(payload)
        temp_sources.close()
        ps.SOURCES_FILE = Path(temp_sources.name)
        ps._cache = None

    platform_slugs = args.platforms or DEFAULT_PLATFORM_SLUGS
    report = audit(platform_slugs, max(1, args.samples))
    if args.sources_url:
        report["sourceSettings"] = args.sources_url
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_markdown(report, args.markdown)
    print(f"JSON: {args.json}")
    print(f"Markdown: {args.markdown}")
    print(f"Plataformas: {', '.join(platform_slugs)}")
    print(f"Correcciones recomendadas: {len(report.get('recommendedCorrections') or [])}")


if __name__ == "__main__":
    main()
