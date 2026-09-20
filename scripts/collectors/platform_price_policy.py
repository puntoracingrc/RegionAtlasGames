"""Política pública de estados de precio según el soporte físico."""

from __future__ import annotations

CARTRIDGE_PLATFORMS = {
    "nes", "snes", "n64", "gameboy", "gba", "ds", "3ds",
    "mastersystem", "megadrive", "sega32x", "gamegear",
    "neogeo", "neogeo-aes-plus", "hyper-neogeo-64", "neogeopocket",
    "psvita", "switch", "switch2",
}


def platform_price_media(platform_slug: str | None) -> str:
    return "cartridge" if (platform_slug or "").strip().lower() in CARTRIDGE_PLATFORMS else "optical"


def public_price_buckets(platform_slug: str | None) -> tuple[str, ...]:
    if platform_price_media(platform_slug) == "cartridge":
        return ("loose", "complete", "sealed")
    return ("complete", "sealed")


def normalize_price_bucket(bucket: str | None, platform_slug: str | None) -> str | None:
    if bucket in {"complete", "sealed"}:
        return bucket
    if platform_price_media(platform_slug) == "cartridge" and bucket in {"loose", "game_manual"}:
        return "loose"
    return None


__all__ = ["normalize_price_bucket", "platform_price_media", "public_price_buckets"]
