#!/usr/bin/env python3

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from backfill_company_roles import (  # noqa: E402
    backfill_company_roles,
    find_company_index_repairs,
    title_key,
    update_company_index,
)


def entity(name: str, slug: str) -> dict:
    return {"name": name, "slug": slug, "source": "museum"}


def game(game_id: str, title: str, region: str) -> dict:
    return {
        "id": game_id,
        "title": title,
        "platformSlug": "ps3",
        "region": region,
        "listingStatus": "listed",
    }


def detail(*, developer: dict | None = None, publisher: dict | None = None) -> dict:
    return {
        "developer": developer,
        "publisher": publisher,
        "genres": [],
        "fieldSources": {},
    }


def identity(value: dict | None) -> dict | None:
    return copy.deepcopy(value)


def main() -> None:
    assert title_key("  Player’s  Game ") == title_key("Player's Game")
    assert title_key("Player Game [Limited]") != title_key("Player Game")

    catalog = [
        game("pal", "Exact Game", "PAL Europa"),
        game("es", "Exact Game", "PAL España"),
        game("usa", "Exact Game", "NTSC USA"),
        game("same-region", "Exact Game", "PAL España"),
        game("ambiguous-a", "Ambiguous Game", "PAL Europa"),
        game("ambiguous-b", "Ambiguous Game", "PAL España"),
        game("ambiguous-c", "Ambiguous Game", "NTSC USA"),
        game("unknown-a", "Unknown Company Game", "PAL Europa"),
        game("unknown-b", "Unknown Company Game", "PAL España"),
        game("chain-seed", "No Chained Evidence", "PAL España"),
        game("chain-same-region", "No Chained Evidence", "PAL España"),
        game("chain-other-region", "No Chained Evidence", "NTSC USA"),
    ]
    details = {
        "pal": detail(
            developer=entity("Known Studio", "known-studio"),
            publisher=entity("Known Publisher", "known-publisher"),
        ),
        "es": detail(publisher=entity("Known Publisher", "known-publisher")),
        "usa": detail(publisher=entity("Known Publisher", "known-publisher")),
        "same-region": detail(),
        "ambiguous-a": detail(developer=entity("Studio A", "studio-a")),
        "ambiguous-b": detail(developer=entity("Studio B", "studio-b")),
        "ambiguous-c": detail(),
        "unknown-a": detail(developer=entity("Unregistered Studio", "unregistered-studio")),
        "unknown-b": detail(),
        "chain-seed": detail(publisher=entity("Known Publisher", "known-publisher")),
        "chain-same-region": detail(),
        "chain-other-region": detail(),
    }
    report = backfill_company_roles(
        catalog,
        details,
        {"known-studio", "known-publisher", "studio-a", "studio-b"},
        canonicalizer=identity,
        now="2026-09-03T00:00:00Z",
    )

    assert details["es"]["developer"]["slug"] == "known-studio"
    assert details["usa"]["developer"]["slug"] == "known-studio"
    assert details["same-region"]["publisher"]["slug"] == "known-publisher"
    assert details["ambiguous-c"]["developer"] is None
    assert details["unknown-b"]["developer"] is None
    assert details["chain-same-region"]["publisher"]["slug"] == "known-publisher"
    assert details["chain-other-region"]["publisher"] is None
    assert report["developersAdded"] == 3
    assert report["publishersAdded"] == 2
    assert report["changedGames"] == 4
    assert all(change["companySlug"] in {"known-studio", "known-publisher"} for change in report["changes"])

    companies = {
        "known-studio": {
            "gameIds": ["pal"],
            "byPlatform": {"ps3": 1},
            "asDeveloper": ["pal"],
            "asPublisher": [],
            "gameCount": 1,
        },
        "known-publisher": {
            "gameIds": ["pal", "es", "usa", "chain-seed"],
            "byPlatform": {"ps3": 4},
            "asDeveloper": [],
            "asPublisher": ["pal", "es", "usa", "chain-seed"],
            "gameCount": 4,
        },
    }
    update_company_index(companies, report["changes"])
    assert companies["known-studio"]["gameCount"] == 4
    assert companies["known-studio"]["byPlatform"]["ps3"] == 4
    assert companies["known-publisher"]["gameCount"] == 6
    assert companies["known-publisher"]["byPlatform"]["ps3"] == 6

    repair_catalog = [game("orphan", "Orphan Index Game", "PAL España")]
    repair_details = {
        "orphan": detail(developer=entity("Known Studio", "known-studio")),
    }
    repairs = find_company_index_repairs(repair_catalog, repair_details, companies)
    assert repairs == [
        {
            "gameId": "orphan",
            "platform": "ps3",
            "role": "developer",
            "companySlug": "known-studio",
        }
    ]

    print("OK conservative company role backfill")


if __name__ == "__main__":
    main()
