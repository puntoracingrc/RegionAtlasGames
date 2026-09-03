#!/usr/bin/env python3

from __future__ import annotations

from repair_remote_catalog_covers import (
    collect_repair_targets,
    evenly_spaced_sample,
    parse_pc_page_cover,
    pc_console_path,
    public_url,
    remote_key_from_cover_url,
    resolve_sources,
)


def game(**overrides):
    value = {
        "id": "ps4-usa-example",
        "title": "Example",
        "platformSlug": "ps4",
        "region": "USA",
        "listingStatus": "listed",
        "coverUrl": "/covers/ps4/example.jpg",
        "pcPath": "/game/playstation-4/example",
    }
    value.update(overrides)
    return value


def test_cover_reference_accepts_only_the_requested_platform() -> None:
    assert remote_key_from_cover_url("/covers/ps4/example.jpg", "ps4") == "ps4/example.jpg"
    assert remote_key_from_cover_url("/covers/ps5/example.jpg", "ps4") is None
    assert remote_key_from_cover_url("https://example.com/example.jpg", "ps4") is None
    assert remote_key_from_cover_url("/covers/ps4/../ps5/example.jpg", "ps4") is None


def test_pc_console_path_requires_an_exact_game_path() -> None:
    assert pc_console_path("/game/playstation-4/example") == "playstation-4"
    assert pc_console_path("/game/jp-playstation-4/example") == "jp-playstation-4"
    assert pc_console_path("/price/playstation-4/example") is None
    assert pc_console_path("") is None


def test_target_collection_keeps_regions_separate_and_skips_existing_files() -> None:
    catalog = [
        game(),
        game(
            id="ps4-japan-example",
            region="Japón",
            coverUrl="/covers/ps4/example-jp.jpg",
            pcPath="/game/jp-playstation-4/example",
        ),
        game(id="ps4-pal-example", region="PAL España"),
        game(id="ps4-usa-excluded", listingStatus="excluded"),
        game(id="ps4-usa-no-cover", coverUrl=None),
        game(id="ps4-usa-no-pc-path", coverUrl="/covers/ps4/no-path.jpg", pcPath=None),
    ]
    targets, stats = collect_repair_targets(
        catalog,
        platform="ps4",
        regions={"USA", "Japón"},
        remote_keys={"ps4/example.jpg"},
    )
    assert [target.catalog_id for target in targets] == ["ps4-japan-example"]
    assert targets[0].pc_console_path == "jp-playstation-4"
    assert stats == {
        "catalogRows": 4,
        "withRemoteCoverReference": 3,
        "alreadyPresent": 1,
        "withoutCoverReference": 1,
        "withoutExactPcPath": 1,
        "sharedRemoteReferences": 0,
    }


def test_shared_identical_remote_reference_is_downloaded_once() -> None:
    targets, stats = collect_repair_targets(
        [game(), game(id="ps4-usa-example-copy")],
        platform="ps4",
        regions={"USA"},
        remote_keys=set(),
    )
    assert len(targets) == 1
    assert stats["sharedRemoteReferences"] == 1


def test_source_resolution_uses_the_exact_regional_pc_path() -> None:
    targets, _ = collect_repair_targets(
        [
            game(),
            game(
                id="ps4-japan-example",
                region="Japón",
                coverUrl="/covers/ps4/example-jp.jpg",
                pcPath="/game/jp-playstation-4/example",
            ),
        ],
        platform="ps4",
        regions={"USA", "Japón"},
        remote_keys=set(),
    )
    resolved, unresolved = resolve_sources(
        targets,
        {
            "playstation-4": {
                "/game/playstation-4/example": "https://images.example/usa.jpg"
            },
            "jp-playstation-4": {},
        },
    )
    assert [(target.region, url) for target, url in resolved] == [
        ("USA", "https://images.example/usa.jpg")
    ]
    assert [target.region for target in unresolved] == ["Japón"]


def test_source_resolution_accepts_legacy_html_entities_in_the_same_region() -> None:
    targets, _ = collect_repair_targets(
        [
            game(
                pcPath="/game/playstation-4/tokyo-xanadu-ex&#43;",
                coverUrl="/covers/ps4/tokyo-xanadu-ex.jpg",
            )
        ],
        platform="ps4",
        regions={"USA"},
        remote_keys=set(),
    )
    resolved, unresolved = resolve_sources(
        targets,
        {
            "playstation-4": {
                "/game/playstation-4/tokyo-xanadu-ex+": "https://images.example/usa.jpg"
            }
        },
    )
    assert [url for _, url in resolved] == ["https://images.example/usa.jpg"]
    assert unresolved == []


def test_regional_alias_and_exact_overrides_resolve_reviewed_entries() -> None:
    targets, _ = collect_repair_targets(
        [
            game(
                id="ps4-usa-mass-effect-andromeda-pathfinder-collector",
                pcPath=(
                    "/game/playstation-4/"
                    "mass-effect-andromeda-pathfinder-collector%27s-edition"
                ),
                coverUrl=(
                    "/covers/ps4/"
                    "mass-effect-andromeda-pathfinder-collector-s-edition.jpg"
                ),
            ),
            game(
                id="ps4-usa-my-hero-one-s-justice-2-collector",
                pcPath=(
                    "/game/playstation-4/"
                    "my-hero-one%27s-justice-2-collector%27s-edition"
                ),
                coverUrl=(
                    "/covers/ps4/"
                    "my-hero-one-s-justice-2-collector-s-edition.jpg"
                ),
            ),
            game(
                id="ps4-usa-zanki-zero",
                pcPath="/game/playstation-4/zanki-zero",
                coverUrl="/covers/ps4/zanki-zero.jpg",
            ),
            game(
                id="ps4-usa-zanki-day-one",
                pcPath="/game/playstation-4/zanki-zero-last-beginning-day-one-edition",
                coverUrl="/covers/ps4/zanki-zero-day-one.jpg",
            ),
        ],
        platform="ps4",
        regions={"USA"},
        remote_keys=set(),
    )
    resolved, unresolved = resolve_sources(
        targets,
        {
            "playstation-4": {
                "/game/playstation-4/zanki-zero-last-beginning": (
                    "https://images.example/zanki-usa.jpg"
                )
            }
        },
    )
    assert {target.catalog_id for target, _ in resolved} == {
        "ps4-usa-mass-effect-andromeda-pathfinder-collector",
        "ps4-usa-my-hero-one-s-justice-2-collector",
        "ps4-usa-zanki-zero",
        "ps4-usa-zanki-day-one",
    }
    assert unresolved == []


def test_individual_page_parser_prefers_the_large_cover() -> None:
    page = """
      <img src="https://storage.googleapis.com/images.pricecharting.com/hash/240.jpg">
      <a href="https://storage.googleapis.com/images.pricecharting.com/hash/1600.jpg">cover</a>
    """
    assert parse_pc_page_cover(page) == (
        "https://storage.googleapis.com/images.pricecharting.com/hash/1600.jpg"
    )


def test_public_url_encodes_names_and_accepts_a_cache_buster() -> None:
    assert public_url("https://cdn.example/covers/", "ps4/juego uno.jpg", "123") == (
        "https://cdn.example/covers/ps4/juego%20uno.jpg?repair=123"
    )


def test_http_verification_sample_covers_the_whole_sorted_range() -> None:
    assert evenly_spaced_sample(["e", "a", "c", "b", "d"], 3) == ["a", "c", "e"]
    assert evenly_spaced_sample(["b", "a"], 24) == ["a", "b"]
    assert evenly_spaced_sample(["a"], 0) == []


if __name__ == "__main__":
    test_cover_reference_accepts_only_the_requested_platform()
    test_pc_console_path_requires_an_exact_game_path()
    test_target_collection_keeps_regions_separate_and_skips_existing_files()
    test_shared_identical_remote_reference_is_downloaded_once()
    test_source_resolution_uses_the_exact_regional_pc_path()
    test_source_resolution_accepts_legacy_html_entities_in_the_same_region()
    test_regional_alias_and_exact_overrides_resolve_reviewed_entries()
    test_individual_page_parser_prefers_the_large_cover()
    test_public_url_encodes_names_and_accepts_a_cache_buster()
    test_http_verification_sample_covers_the_whole_sorted_range()
    print("OK: repair_remote_catalog_covers")
