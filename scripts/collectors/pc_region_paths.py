"""PriceCharting: consola por plataforma interna y región de edición (PAL / NTSC / JP)."""

from __future__ import annotations

from typing import Any

# slug interno -> consola PriceCharting PAL (mismo mapa que seed_catalog.py)
PAL_PC_CONSOLE: dict[str, str] = {
    "nes": "pal-nes",
    "snes": "pal-super-nintendo",
    "n64": "pal-nintendo-64",
    "gameboy": "pal-gameboy",
    "gamecube": "pal-gamecube",
    "wii": "pal-wii",
    "ds": "pal-nintendo-ds",
    "3ds": "pal-nintendo-3ds",
    "megadrive": "pal-sega-mega-drive",
    "sega32x": "pal-mega-drive-32x",
    "megacd": "pal-sega-mega-cd",
    "mastersystem": "pal-sega-master-system",
    "saturn": "pal-sega-saturn",
    "dreamcast": "pal-sega-dreamcast",
    "gamegear": "pal-sega-game-gear",
    "neogeo": "neo-geo-aes",
    "neogeocd": "neo-geo-cd",
    "neogeopocket": "neo-geo-pocket-color",
    "ps1": "pal-playstation",
    "ps2": "pal-playstation-2",
    "ps3": "pal-playstation-3",
    "ps4": "pal-playstation-4",
}

# NTSC (Americas) — slug sin prefijo pal-
NTSC_PC_CONSOLE: dict[str, str] = {
    "nes": "nes",
    "snes": "super-nintendo",
    "n64": "nintendo-64",
    "gameboy": "gameboy",
    "gamecube": "gamecube",
    "wii": "wii",
    "ds": "nintendo-ds",
    "3ds": "nintendo-3ds",
    "megadrive": "sega-genesis",
    "sega32x": "sega-32x",
    "megacd": "sega-cd",
    "mastersystem": "sega-master-system",
    "saturn": "sega-saturn",
    "dreamcast": "sega-dreamcast",
    "gamegear": "sega-game-gear",
    "neogeo": "neo-geo-aes",
    "neogeocd": "neo-geo-cd",
    "neogeopocket": "neo-geo-pocket-color",
    "ps1": "playstation",
    "ps2": "playstation-2",
    "ps3": "playstation-3",
    "ps4": "playstation-4",
}

# Japón — consolas jp-* (algunas plataformas no existen en PC → fallback en resolve)
JP_PC_CONSOLE: dict[str, str] = {
    "nes": "jp-nes",
    "snes": "jp-super-nintendo",
    "n64": "jp-nintendo-64",
    "gameboy": "jp-gameboy",
    "gamecube": "jp-gamecube",
    "wii": "jp-wii",
    "ds": "jp-nintendo-ds",
    "3ds": "jp-nintendo-3ds",
    "megadrive": "jp-sega-mega-drive",
    "sega32x": "sega-32x",
    "megacd": "jp-sega-mega-cd",
    "mastersystem": "sega-master-system",
    "saturn": "jp-sega-saturn",
    "dreamcast": "jp-sega-dreamcast",
    "gamegear": "jp-sega-game-gear",
    "neogeo": "neo-geo-aes",
    "neogeocd": "neo-geo-cd",
    "neogeopocket": "neo-geo-pocket-color",
    "ps1": "jp-playstation",
    "ps2": "jp-playstation-2",
    "ps3": "jp-playstation-3",
    "ps4": "jp-playstation-4",
}

MUSEUM_REGION_BUCKETS: dict[str, str] = {
    "usa": "usa",
    "japon": "japan",
    "pal": "pal",
    "espana": "pal",
    "europa": "pal",
    "alemania": "pal",
    "francia": "pal",
    "italia": "pal",
    "reino-unido": "pal",
    "portugues": "pal",
    "brasil": "pal",
    "australia": "pal",
    "multiregion": "multi",
}

PAL_REGION_PREFIXES = ("pal ", "españa", "europa", "alemania", "francia", "italia", "reino unido", "australia")


def catalog_region_bucket(game: dict[str, Any]) -> str:
    """Devuelve pal | usa | japan | multi según edición del catálogo."""
    museum_region = str(game.get("museumRegion") or "").strip().lower()
    if museum_region in MUSEUM_REGION_BUCKETS:
        bucket = MUSEUM_REGION_BUCKETS[museum_region]
        if bucket != "multi":
            return bucket

    region = str(game.get("region") or "").strip().lower()
    if region in ("usa", "ntsc"):
        return "usa"
    if region in ("japón", "japan", "japon"):
        return "japan"
    if region in ("multiregión", "multiregion", "multi"):
        return "multi"
    if any(region.startswith(prefix) for prefix in PAL_REGION_PREFIXES):
        return "pal"
    if region == "españa":
        return "pal"
    return "pal"


def resolve_pc_console(platform_slug: str, bucket: str) -> str | None:
    if bucket == "usa":
        return NTSC_PC_CONSOLE.get(platform_slug) or PAL_PC_CONSOLE.get(platform_slug)
    if bucket == "japan":
        return (
            JP_PC_CONSOLE.get(platform_slug)
            or NTSC_PC_CONSOLE.get(platform_slug)
            or PAL_PC_CONSOLE.get(platform_slug)
        )
    if bucket == "multi":
        return PAL_PC_CONSOLE.get(platform_slug) or NTSC_PC_CONSOLE.get(platform_slug)
    return PAL_PC_CONSOLE.get(platform_slug)


def pc_region_label(bucket: str, pc_console: str) -> str:
    if "neo-geo-pocket" in pc_console:
        return "Referencia global (NGPC)"
    if "neo-geo-cd" in pc_console:
        return "Referencia global (Neo Geo CD)"
    if "neo-geo-aes" in pc_console:
        return "Referencia global (Neo Geo AES)"
    if bucket == "usa":
        return "NTSC USA (referencia)"
    if bucket == "japan":
        return "Japón (referencia)"
    if bucket == "multi":
        return "Referencia global (multiregión)"
    return "PAL EU (referencia)"


def pc_slug_from_game(game: dict[str, Any]) -> str:
    pc_path = str(game.get("pcPath") or "").strip()
    if pc_path.startswith("/game/"):
        slug = pc_path.rsplit("/", 1)[-1]
        if slug:
            return slug
    for key in ("museumSlug", "slug"):
        value = game.get(key)
        if value:
            return str(value)
    return ""


def build_pc_path(game: dict[str, Any]) -> tuple[str | None, str]:
    platform = str(game.get("platformSlug") or "")
    slug = pc_slug_from_game(game)
    if not platform or not slug:
        return None, pc_region_label("pal", "")

    bucket = catalog_region_bucket(game)
    console = resolve_pc_console(platform, bucket)
    if not console:
        return None, pc_region_label(bucket, "")
    path = f"/game/{console}/{slug}"
    return path, pc_region_label(bucket, console)


def effective_pc_path_for_game(game: dict[str, Any]) -> str | None:
    """Ruta PC coherente con la edición; fallback al pcPath guardado."""
    path, _ = build_pc_path(game)
    return path or game.get("pcPath")
