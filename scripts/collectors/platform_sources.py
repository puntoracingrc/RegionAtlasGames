"""Registro único de fuentes por plataforma (data/platform-sources.json)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from collectors.common import ROOT, load_json

SOURCES_FILE = ROOT / "data" / "platform-sources.json"

_P2P_GENERIC = ("wallapop", "vinted")
_cache: dict[str, Any] | None = None


def _document() -> dict[str, Any]:
    global _cache
    if _cache is None:
        _cache = load_json(SOURCES_FILE, {})
    return _cache


def _platforms() -> dict[str, dict[str, Any]]:
    raw = _document().get("platforms") or {}
    return {str(k): v for k, v in raw.items() if isinstance(v, dict)}


def platform_config(platform_slug: str) -> dict[str, Any]:
    return dict(_platforms().get(platform_slug.strip()) or {})


def all_platform_slugs() -> list[str]:
    return sorted(_platforms().keys())


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if str(v).strip()]
    text = str(value).strip()
    return [text] if text else []


def search_keyword(platform_slug: str) -> str:
    cfg = platform_config(platform_slug)
    return str(cfg.get("searchKeyword") or platform_slug).strip() or platform_slug


def ebay_search_keyword(platform_slug: str) -> str:
    """Keyword de consola en queries eBay (p. ej. «neo geo aes» en lugar de «neogeo»)."""
    cfg = platform_config(platform_slug)
    explicit = str(cfg.get("ebaySearchKeyword") or "").strip()
    if explicit:
        return explicit
    return search_keyword(platform_slug)


def ebay_enabled_for_platform(platform_slug: str) -> bool:
    cfg = platform_config(platform_slug)
    if cfg.get("ebay") is False:
        return False
    return bool(search_keyword(platform_slug))


def p2p_sources_for_platform(platform_slug: str) -> list[str]:
    if not platform_slug:
        return []
    return list(_P2P_GENERIC)


def cex_sources_for_platform(platform_slug: str) -> list[str]:
    if _as_list(platform_config(platform_slug).get("cex")):
        return [platform_slug]
    return []


def cex_category_ids(platform_slug: str) -> list[str]:
    return _as_list(platform_config(platform_slug).get("cex"))


def tc_sources_for_platform(platform_slug: str) -> list[str]:
    cfg = platform_config(platform_slug)
    if _as_list(cfg.get("todocoleccion")) or cfg.get("todocoleccionSearch"):
        return [platform_slug]
    return []


def tc_category_slugs(platform_slug: str) -> list[str]:
    return _as_list(platform_config(platform_slug).get("todocoleccion"))


def tc_legacy_search_query(platform_slug: str) -> str | None:
    raw = platform_config(platform_slug).get("todocoleccionSearch")
    text = str(raw or "").strip()
    return text or None


def tcns_sources_for_platform(platform_slug: str) -> list[str]:
    if _as_list(platform_config(platform_slug).get("todoconsolas")):
        return [platform_slug]
    return []


def tcns_category_slugs(platform_slug: str) -> list[str]:
    return _as_list(platform_config(platform_slug).get("todoconsolas"))


def kaoto_sources_for_platform(platform_slug: str) -> list[str]:
    if platform_config(platform_slug).get("kaoto"):
        return [platform_slug]
    return []


def kaoto_collection(platform_slug: str) -> str | None:
    raw = platform_config(platform_slug).get("kaoto")
    text = str(raw or "").strip()
    return text or None


def jgo_sources_for_platform(platform_slug: str) -> list[str]:
    if _as_list(platform_config(platform_slug).get("jgo")):
        return [platform_slug]
    return []


def jgo_categories(platform_slug: str) -> list[str]:
    return _as_list(platform_config(platform_slug).get("jgo"))


def chollo_sources_for_platform(platform_slug: str) -> list[str]:
    if platform_config(platform_slug).get("chollo"):
        return [platform_slug]
    return []


def chollo_category(platform_slug: str) -> str | None:
    raw = platform_config(platform_slug).get("chollo")
    text = str(raw or "").strip()
    return text or None


def serialstation_console(platform_slug: str) -> str | None:
    raw = platform_config(platform_slug).get("serialstationConsole")
    text = str(raw or "").strip()
    return text or None


def ps_platform_slugs() -> list[str]:
    return sorted(
        slug
        for slug, cfg in _platforms().items()
        if cfg.get("serialstationConsole")
    )


def collectors_for_platform(platform_slug: str, *, ebay_configured: bool = True) -> list[str]:
    """Fuentes de precio planificables para daily_price_ingest (orden lógico)."""
    planned: list[str] = []
    if tc_sources_for_platform(platform_slug):
        planned.append("todocoleccion")
    planned.extend(p2p_sources_for_platform(platform_slug))
    if tcns_sources_for_platform(platform_slug):
        planned.append("todoconsolas")
    if chollo_sources_for_platform(platform_slug):
        planned.append("chollo")
    if jgo_sources_for_platform(platform_slug):
        planned.append("jgo")
    if kaoto_sources_for_platform(platform_slug):
        planned.append("kaoto")
    if cex_sources_for_platform(platform_slug):
        planned.append("cex")
    if ebay_configured and ebay_enabled_for_platform(platform_slug):
        planned.append("ebay")
    return planned


# Retrocompat: dict views usados en tests / imports antiguos
def legacy_cex_categories() -> dict[str, str | list[str]]:
    out: dict[str, str | list[str]] = {}
    for slug in all_platform_slugs():
        ids = cex_category_ids(slug)
        if len(ids) == 1:
            out[slug] = ids[0]
        elif ids:
            out[slug] = ids
    return out


def legacy_kaoto_collections() -> dict[str, str]:
    return {
        slug: col
        for slug in all_platform_slugs()
        if (col := kaoto_collection(slug))
    }


def legacy_chollo_categories() -> dict[str, str]:
    return {
        slug: cat
        for slug in all_platform_slugs()
        if (cat := chollo_category(slug))
    }


def legacy_jgo_categories() -> dict[str, list[str]]:
    return {
        slug: jgo_categories(slug)
        for slug in all_platform_slugs()
        if jgo_categories(slug)
    }


def legacy_tc_categories() -> dict[str, str | list[str]]:
    out: dict[str, str | list[str]] = {}
    for slug in all_platform_slugs():
        cats = tc_category_slugs(slug)
        if len(cats) == 1:
            out[slug] = cats[0]
        elif cats:
            out[slug] = cats
    return out


def legacy_tc_search_queries() -> dict[str, str]:
    return {
        slug: q
        for slug in all_platform_slugs()
        if (q := tc_legacy_search_query(slug))
    }


def legacy_tcns_categories() -> dict[str, str | list[str]]:
    out: dict[str, str | list[str]] = {}
    for slug in all_platform_slugs():
        cats = tcns_category_slugs(slug)
        if len(cats) == 1:
            out[slug] = cats[0]
        elif cats:
            out[slug] = cats
    return out


def legacy_serialstation_consoles() -> dict[str, str]:
    return {
        slug: console
        for slug in all_platform_slugs()
        if (console := serialstation_console(slug))
    }


def legacy_search_keywords() -> dict[str, str]:
    return {slug: search_keyword(slug) for slug in all_platform_slugs()}


__all__ = [
    "SOURCES_FILE",
    "all_platform_slugs",
    "cex_category_ids",
    "cex_sources_for_platform",
    "chollo_category",
    "chollo_sources_for_platform",
    "collectors_for_platform",
    "jgo_categories",
    "jgo_sources_for_platform",
    "kaoto_collection",
    "kaoto_sources_for_platform",
    "legacy_cex_categories",
    "legacy_chollo_categories",
    "legacy_jgo_categories",
    "legacy_kaoto_collections",
    "legacy_search_keywords",
    "legacy_serialstation_consoles",
    "legacy_tc_categories",
    "legacy_tc_search_queries",
    "legacy_tcns_categories",
    "p2p_sources_for_platform",
    "platform_config",
    "ps_platform_slugs",
    "search_keyword",
    "serialstation_console",
    "tc_category_slugs",
    "tc_legacy_search_query",
    "tc_sources_for_platform",
    "tcns_category_slugs",
    "tcns_sources_for_platform",
]
