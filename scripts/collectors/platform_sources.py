"""Registro único de fuentes por plataforma (data/platform-sources.json)."""

from __future__ import annotations

import os
import json
import urllib.request
from pathlib import Path
from typing import Any

from collectors.common import ROOT, load_json

SOURCES_FILE = ROOT / "data" / "platform-sources.json"

_P2P_GENERIC = ("wallapop",)
_DEFAULT_DISABLED_COLLECTORS = {"ebay", "todocoleccion", "vinted"}
_GENERIC_DISABLED_STATUSES = {"disabled", "blocked_403", "blocked_429"}
_GENERIC_SUPPORTED_STRATEGIES = {"platform_routes", "internal_search", "catalog_crawl", "base_url", "sequence"}
_cache: dict[str, Any] | None = None


def _document() -> dict[str, Any]:
    global _cache
    if _cache is None:
        local = load_json(SOURCES_FILE, {})
        remote = _remote_document()
        _cache = _newest_document(local, remote)
    return _cache


def _worker_public_base_url() -> str:
    explicit = os.environ.get("PRICE_WORKER_PUBLIC_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    covers_base = os.environ.get("NEXT_PUBLIC_COVERS_BASE_URL", "").strip()
    if covers_base:
        return covers_base.rstrip("/").removesuffix("/covers") + "/price-worker"
    return "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker"


def _remote_document() -> dict[str, Any] | None:
    if os.environ.get("PRICE_SOURCES_DISABLE_REMOTE_READ", "").strip().lower() in {"1", "true", "yes"}:
        return None
    url = f"{_worker_public_base_url()}/app/data/platform-sources.json"
    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "RegionAtlasGames/1.0"})
        with urllib.request.urlopen(request, timeout=8) as response:
            if getattr(response, "status", 200) != 200:
                return None
            payload = response.read().decode("utf-8", errors="ignore")
            data = json.loads(payload)
            return data if isinstance(data, dict) else None
    except Exception:
        return None


def _collector_settings_updated_at(document: dict[str, Any] | None) -> str:
    settings = (document or {}).get("collectorSettings")
    if not isinstance(settings, dict):
        return ""
    return str(settings.get("updatedAt") or "")


def _newest_document(local: dict[str, Any], remote: dict[str, Any] | None) -> dict[str, Any]:
    if not remote:
        return local
    if _collector_settings_updated_at(remote) > _collector_settings_updated_at(local):
        return remote
    return local


def _platforms() -> dict[str, dict[str, Any]]:
    raw = _document().get("platforms") or {}
    return {str(k): v for k, v in raw.items() if isinstance(v, dict)}


def _collector_settings() -> dict[str, dict[str, Any]]:
    raw = _document().get("collectorSettings") or {}
    if not isinstance(raw, dict):
        return {}
    sources = raw.get("sources") or {}
    return {str(k): v for k, v in sources.items() if isinstance(v, dict)}


def _custom_source_settings() -> dict[str, dict[str, Any]]:
    raw = _document().get("collectorSettings") or {}
    if not isinstance(raw, dict):
        return {}
    custom_sources = raw.get("customSources") or []
    if not isinstance(custom_sources, list):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for item in custom_sources:
        if not isinstance(item, dict):
            continue
        source_id = str(item.get("id") or "").strip().lower()
        if source_id:
            out[source_id] = item
    return out


def _collection_mode(mode: str | None = None) -> str:
    raw = (mode or os.environ.get("PRICE_COLLECT_TRIGGER") or "manual").strip().lower()
    if raw in {"automatic", "rotation", "cron"}:
        return "rotation"
    return "manual"


def _enabled_for_mode(cfg: dict[str, Any], *, mode: str | None = None, fallback: bool = True) -> bool:
    legacy = cfg.get("enabled") is not False if "enabled" in cfg else fallback
    key = "enabledRotation" if _collection_mode(mode) == "rotation" else "enabledManual"
    return bool(cfg.get(key, legacy))


def collector_enabled(source: str, *, mode: str | None = None) -> bool:
    settings = _collector_settings()
    key = source.strip().lower()
    if key == "ebay" and ebay_price_wheel_enabled():
        return True
    if key in settings:
        return _enabled_for_mode(settings[key], mode=mode)
    return key not in _DEFAULT_DISABLED_COLLECTORS


def _matches_scope(value: Any, needle: str) -> bool:
    target = needle.strip().lower()
    return any(item.strip().lower() == target for item in _as_list(value))


def collector_enabled_for_platform(source: str, platform_slug: str, *, mode: str | None = None) -> bool:
    if not collector_enabled(source, mode=mode):
        return False
    settings = _collector_settings()
    cfg = settings.get(source.strip().lower()) or {}
    slug = platform_slug.strip().lower()
    enabled_platforms = _as_list(cfg.get("enabledPlatforms"))
    if enabled_platforms and not _matches_scope(enabled_platforms, slug):
        return False
    if _matches_scope(cfg.get("disabledPlatforms"), slug):
        return False
    return True


def collector_enabled_for_region(source: str, region: str, *, mode: str | None = None) -> bool:
    if not collector_enabled(source, mode=mode):
        return False
    settings = _collector_settings()
    cfg = settings.get(source.strip().lower()) or {}
    normalized_region = region.strip().lower()
    enabled_regions = _as_list(cfg.get("enabledRegions"))
    if enabled_regions and not any(item.strip().lower() in normalized_region for item in enabled_regions):
        return False
    if any(item.strip().lower() in normalized_region for item in _as_list(cfg.get("disabledRegions"))):
        return False
    return True


def _scope_allows(cfg: dict[str, Any], key: str, value: str) -> bool:
    needle = value.strip().lower()
    if not needle:
        return True
    enabled = _as_list(cfg.get(f"enabled{key}s"))
    if enabled and not any(item.strip().lower() == needle or item.strip().lower() in needle for item in enabled):
        return False
    if any(item.strip().lower() == needle or item.strip().lower() in needle for item in _as_list(cfg.get(f"disabled{key}s"))):
        return False
    return True


def generic_source_config(source_slug: str) -> dict[str, Any] | None:
    return _custom_source_settings().get(source_slug.strip().lower())


def generic_source_enabled(source_slug: str, platform_slug: str, *, region: str | None = None, mode: str | None = None) -> bool:
    cfg = generic_source_config(source_slug)
    if not cfg:
        return False
    if not _enabled_for_mode(cfg, mode=mode):
        return False
    status = str(cfg.get("status") or "").strip().lower()
    if status in _GENERIC_DISABLED_STATUSES:
        return False
    strategy = str(cfg.get("strategy") or "manual_candidate").strip().lower()
    if strategy not in _GENERIC_SUPPORTED_STRATEGIES:
        return False
    if not _scope_allows(cfg, "Platform", platform_slug):
        return False
    if region and not _scope_allows(cfg, "Region", region):
        return False
    if strategy == "platform_routes":
        routes = cfg.get("platformRoutes") or {}
        if not isinstance(routes, dict):
            return False
        return bool(str(routes.get(platform_slug) or routes.get(platform_slug.strip().lower()) or "").strip())
    if strategy in {"internal_search", "sequence"}:
        return bool(str(cfg.get("urlTemplate") or "").strip())
    if strategy in {"catalog_crawl", "base_url"}:
        return bool(str(cfg.get("url") or cfg.get("supportUrl") or "").strip())
    return False


def generic_sources_for_platform(platform_slug: str, *, region: str | None = None, mode: str | None = None) -> list[str]:
    return [
        source_slug
        for source_slug in sorted(_custom_source_settings())
        if generic_source_enabled(source_slug, platform_slug, region=region, mode=mode)
    ]


def disabled_collectors() -> set[str]:
    known = {
        "wallapop",
        "ebay",
        "vinted",
        "cex",
        "jgo",
        "chollo",
        "kaoto",
        "todoconsolas",
        "todocoleccion",
    }
    return {source for source in known if not collector_enabled(source)}


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


def search_aliases(platform_slug: str) -> list[str]:
    cfg = platform_config(platform_slug)
    aliases: list[str] = []
    primary = str(cfg.get("searchKeyword") or platform_slug).strip()
    if primary:
        aliases.append(primary)
    aliases.extend(_as_list(cfg.get("searchAliases")))
    clean: list[str] = []
    seen: set[str] = set()
    for alias in aliases:
        key = alias.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        clean.append(alias.strip())
    return clean


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


def ebay_price_wheel_enabled() -> bool:
    """eBay se usa como API directa/afiliación; no entra en la rueda salvo override técnico."""
    return os.environ.get("ENABLE_EBAY_PRICE_WHEEL", "").strip().lower() in {"1", "true", "yes"}


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


def collectors_for_platform(platform_slug: str, *, ebay_configured: bool = True, mode: str | None = None) -> list[str]:
    """Fuentes de precio planificables para daily_price_ingest (orden lógico)."""
    collection_mode = _collection_mode(mode)
    planned: list[str] = []
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
    if ebay_price_wheel_enabled() and ebay_configured and ebay_enabled_for_platform(platform_slug):
        planned.append("ebay")
    planned.extend(
        f"generic:{source}"
        for source in generic_sources_for_platform(
            platform_slug,
            region=os.environ.get("PRICE_COLLECT_REGION", "").strip() or None,
            mode=collection_mode,
        )
    )
    return [source for source in planned if collector_enabled_for_platform(source, platform_slug, mode=collection_mode)]


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
    "collector_enabled",
    "collector_enabled_for_platform",
    "collector_enabled_for_region",
    "disabled_collectors",
    "chollo_sources_for_platform",
    "collectors_for_platform",
    "generic_source_config",
    "generic_source_enabled",
    "generic_sources_for_platform",
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
    "search_aliases",
    "serialstation_console",
    "tc_category_slugs",
    "tc_legacy_search_query",
    "tc_sources_for_platform",
    "tcns_category_slugs",
    "tcns_sources_for_platform",
]
