#!/usr/bin/env python3
"""Curación del catálogo maestro: excluye accesorios, promos, homebrew y variantes duplicadas."""

from __future__ import annotations

import html
import json
import re
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
REPORT_FILE = ROOT / "data" / "curation-report.json"

RERELEASE = re.compile(
    r"\[(platinum|essentials|playstation hits|greatest hits|classics|favorites|"
    r"selects|best of|value series|xbox classics|nintendo selects|player's choice|"
    r"players choice|only on playstation)\]",
    re.I,
)
PROMO_BRACKET = re.compile(
    r"\[(promo only|promo|not for resale|for rental|demo|press kit|kiosk|beta test)\]",
    re.I,
)
HW_PREFIX = re.compile(
    r"^(gamecube controller|gamecube memory|nintendo 64 system|nintendo ds lite|"
    r"nintendo dsi|nintendo 2ds|new nintendo 2ds|new nintendo 3ds|"
    r"playstation 2 slim starter|playstation 3 starter|ps2 slim starter|ps4 console|"
    r"gamecube (black|indigo|platinum) console|4gamers|quickjoy|neogeo x arcade|"
    r"dualshock|sixaxis|playstation move|move navigation|move starter|"
    r"eye toy camera|eyetoy camera|interactive multi-game demo|"
    r"official uk playstation magazine|official australian playstation magazine|"
    r"3ds kiosk|av cable|rgb cable|gear-to-gear cable|memory card|footpedal|"
    r"joystick super|neo geo aes joystick|new 3ds coverplate)",
    re.I,
)


def decode_title(title: str) -> str:
    t = html.unescape(title)
    t = re.sub(r"&#\d+;", "", t)
    return t.strip()


def norm_title(title: str) -> str:
    t = decode_title(title)
    t = re.sub(r"\[[^\]]+\]", "", t).strip()
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", t).lower()


def has_bracket(title: str) -> bool:
    return "[" in title


def classify_junk(game: dict) -> tuple[str, str] | None:
    """Devuelve (categoría, motivo) o None si parece juego válido."""
    title = decode_title(game["title"])
    tl = title.lower()
    slug = game.get("slug", "")

    if "homebrew" in tl:
        return ("homebrew", "homebrew")
    if "demo disc" in tl or "demo disk" in tl:
        return ("demo", "demo-disc")
    if "not for resale" in tl:
        return ("promo", "not-for-resale")
    if PROMO_BRACKET.search(title):
        return ("promo", "promo-bracket")
    if "for rental" in tl or "yapon rental" in tl:
        return ("rental", "rental")
    if "magazine demo" in tl or re.search(
        r"official (uk|australian) playstation magazine", tl
    ):
        return ("demo", "magazine-demo")
    if HW_PREFIX.match(title):
        return ("hardware", "hardware-prefix")
    if re.search(r"\bconsole\b", tl) and re.search(
        r"\[(pak|bundle|pack|pre-install|preinstalled|limited edition pak)\]", title, re.I
    ):
        return ("hardware", "console-bundle")
    if re.search(r"starter pack", tl) and re.search(
        r"(slim|console|network starter|ps2|ps3 hardware)", tl, re.I
    ):
        return ("hardware", "starter-pack-console")
    if re.search(r"\b(controller|memory card|cable|headset|footpedal)\b", tl) and not re.match(
        r"^(air traffic controller|remote control)", tl, re.I
    ):
        if any(tok in slug for tok in ("controller", "memory-card", "cable", "headset")):
            return ("accessory", "accessory-slug")
        if re.search(r"\[(black|indigo|clear|red|wireless|bluetooth)\]", title, re.I) and (
            "controller" in tl
        ):
            return ("accessory", "controller-edition")
    if "nfc reader" in tl:
        return ("accessory", "nfc-reader")
    if RERELEASE.search(title):
        return ("variant", "rerelease-line")

    return None


def canonical_score(game: dict) -> tuple[int, int, int]:
    title = game["title"]
    score = 0
    if not has_bracket(title):
        score += 100
    if game.get("hasEsPrice"):
        score += 50
    if game.get("coverUrl"):
        score += 10
    return (score, -len(title), 0)


def apply_curation(catalog: list[dict], *, reset: bool = False) -> tuple[list[dict], dict]:
    if reset:
        for game in catalog:
            game["listingStatus"] = "listed"
            game.pop("excludeCategory", None)
            game.pop("excludeReason", None)

    excluded_by_rule: dict[str, tuple[str, str]] = {}
    for game in catalog:
        hit = classify_junk(game)
        if hit:
            excluded_by_rule[game["id"]] = hit

    alive = [g for g in catalog if g["id"] not in excluded_by_rule]
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for game in alive:
        groups[(game["platformSlug"], norm_title(game["title"]))].append(game)

    keep_ids: set[str] = set()
    duplicate_excluded: dict[str, str] = {}

    for items in groups.values():
        if len(items) == 1:
            keep_ids.add(items[0]["id"])
            continue
        keeper = max(items, key=canonical_score)
        keep_ids.add(keeper["id"])
        for game in items:
            if game["id"] != keeper["id"]:
                duplicate_excluded[game["id"]] = "duplicate-variant"

    stats = Counter()
    for game in catalog:
        if game["id"] in excluded_by_rule:
            category, reason = excluded_by_rule[game["id"]]
            game["listingStatus"] = "excluded"
            game["excludeCategory"] = category
            game["excludeReason"] = reason
            stats[f"excluded:{category}"] += 1
        elif game["id"] in duplicate_excluded:
            game["listingStatus"] = "excluded"
            game["excludeCategory"] = "variant"
            game["excludeReason"] = duplicate_excluded[game["id"]]
            stats["excluded:variant"] += 1
        else:
            game["listingStatus"] = "listed"
            game.pop("excludeCategory", None)
            game.pop("excludeReason", None)
            stats["listed"] += 1

    report = {
        "total": len(catalog),
        "listed": stats["listed"],
        "excluded": len(catalog) - stats["listed"],
        "byCategory": {
            k.replace("excluded:", ""): v
            for k, v in stats.items()
            if k.startswith("excluded:")
        },
        "listedByPlatform": Counter(
            g["platformSlug"] for g in catalog if g["listingStatus"] == "listed"
        ),
        "excludedByPlatform": Counter(
            g["platformSlug"] for g in catalog if g["listingStatus"] == "excluded"
        ),
    }
    return catalog, report


def update_meta(catalog: list[dict], report: dict) -> None:
    platforms = json.loads(PLATFORMS_FILE.read_text(encoding="utf-8"))
    meta = json.loads(META_FILE.read_text(encoding="utf-8")) if META_FILE.exists() else {}

    listed_by_platform = dict(sorted(report["listedByPlatform"].items()))
    meta.update(
        {
            "catalogListed": report["listed"],
            "catalogExcluded": report["excluded"],
            "catalogTotal": report["total"],
            "catalogEstimatedTotal": sum(p["estimatedCatalogSize"] for p in platforms),
            "listedByPlatform": listed_by_platform,
            "excludedByPlatform": dict(sorted(report["excludedByPlatform"].items())),
            "curationByCategory": report["byCategory"],
            "lastCuratedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    )
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Curar catálogo maestro PAL ES")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra estadísticas")
    parser.add_argument("--reset", action="store_true", help="Restaura todo a listed antes de curar")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    curated, report = apply_curation(catalog, reset=args.reset)

    print(f"Total:    {report['total']}")
    print(f"Listados: {report['listed']}")
    print(f"Excluidos:{report['excluded']}")
    print("\nPor categoría:")
    for cat, count in sorted(report["byCategory"].items(), key=lambda x: -x[1]):
        print(f"  {count:5d}  {cat}")
    print("\nListados por plataforma:")
    for plat, count in sorted(report["listedByPlatform"].items()):
        print(f"  {plat:12s} {count:5d}")

    if args.dry_run:
        return

    CATALOG_FILE.write_text(json.dumps(curated, ensure_ascii=False, indent=2), encoding="utf-8")
    update_meta(curated, report)

    serializable = {
        **report,
        "listedByPlatform": dict(report["listedByPlatform"]),
        "excludedByPlatform": dict(report["excludedByPlatform"]),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    REPORT_FILE.write_text(json.dumps(serializable, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nGuardado en {CATALOG_FILE}")
    print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
