#!/usr/bin/env python3

from __future__ import annotations

import io
import tempfile
from decimal import Decimal
from pathlib import Path

from PIL import Image, ImageChops

from import_pricecharting_software_list import (
    CANVAS_SIZE,
    CoverTask,
    LiveRow,
    SourceRow,
    clean_source_title,
    cover_is_clean,
    download_covers,
    merge_catalog,
    normalize_title,
    save_clean_cover,
)


def sample_game(catalog_id: str, title: str) -> dict:
    return {
        "id": catalog_id,
        "slug": catalog_id.removeprefix("ps5-"),
        "title": title,
        "titlePc": title,
        "platformSlug": "ps5",
        "region": "PAL España",
        "edition": "standard",
        "listingStatus": "listed",
        "coverUrl": "/covers/ps5/existing.jpg",
        "pcPath": None,
        "pcId": None,
        "pcRegion": None,
        "pcCondition": None,
        "matchConfidence": "GAME_ES_RELEASE",
        "marketMin": 10,
        "marketMax": 20,
        "recommendedPrice": 15,
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": "manual",
        "updatedAt": "2026-08-01",
        "hasEsPrice": True,
        "seedSource": "test",
    }


def test_merge_preserves_prices_and_skips_technical_duplicate() -> None:
    catalog = [sample_game("ps5-3d-minigolf", "3D MINIGOLF")]
    catalog[0]["pcId"] = 999
    joined = [
        (
            SourceRow("3D Mini Golf", None, None, None),
            LiveRow("3D Mini Golf", 7308807, "/game/pal-playstation-5/3d-mini-golf", None),
        ),
        (
            SourceRow("Juego Nuevo", None, None, None),
            LiveRow("Juego Nuevo", 123, "/game/pal-playstation-5/juego-nuevo", None),
        ),
        (
            SourceRow("Jets 'N' Guns 2", None, None, None),
            LiveRow("Jets 'N' Guns 2", 8741598, "/game/pal-playstation-5/jets-n-guns-2", None),
        ),
    ]
    merged, tasks, stats = merge_catalog(
        catalog,
        joined,
        platform="ps5",
        region="PAL España",
        pc_region="PAL EU (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
    )
    assert len(merged) == 2
    assert not tasks
    assert stats["added"] == 1
    assert len(stats["skipped"]) == 1
    existing = next(game for game in merged if game["id"] == "ps5-3d-minigolf")
    assert existing["pcId"] == 7308807
    assert existing["recommendedPrice"] == 15
    assert existing["priceSource"] == "manual"
    added = next(game for game in merged if game["id"] == "ps5-juego-nuevo")
    assert added["region"] == "PAL España"
    assert added["pcRefPrice"] is None
    assert added["coverUrl"] is None


def test_title_normalization_handles_common_catalog_variants() -> None:
    assert normalize_title("Five Nights at Freddy’s") == normalize_title("Five Nights At Freddy's")
    assert normalize_title("Dragon's Dogma II") == normalize_title("Dragon´s Dogma 2")
    assert normalize_title("Helldivers II") == normalize_title("Helldivers 2")
    assert normalize_title("Adventure Time: Finn &amp; Jake Investigations") == normalize_title(
        "Adventure Time: Finn & Jake Investigations"
    )
    assert normalize_title("Far Cry 3 &#43; Far Cry 4") == normalize_title(
        "Far Cry 3 + Far Cry 4"
    )
    assert clean_source_title("Dark Souls II [Limited Edition] /2000") == (
        "Dark Souls II [Limited Edition]"
    )


def test_distinct_pc_ids_with_equivalent_titles_remain_separate() -> None:
    joined = [
        (
            SourceRow("Example 2", None, None, None),
            LiveRow("Example 2", 111, "/game/playstation-5/example-2", None),
        ),
        (
            SourceRow("Example II", None, None, None),
            LiveRow("Example II", 222, "/game/playstation-5/example-ii", None),
        ),
    ]
    merged, _, stats = merge_catalog(
        [],
        joined,
        platform="ps5",
        region="USA",
        pc_region="NTSC USA (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
        id_prefix="ps5-usa",
    )
    assert stats["added"] == 2
    assert stats["updated"] == 0
    assert {game["pcId"] for game in merged} == {111, 222}
    assert {game["id"] for game in merged} == {"ps5-usa-example-2", "ps5-usa-example-ii"}


def test_one_existing_record_cannot_claim_two_source_editions() -> None:
    existing = sample_game("ps5-example", "Example")
    existing["pcId"] = 111
    existing["pcPath"] = "/game/playstation-5/example-other-edition"
    joined = [
        (
            SourceRow("Example", None, None, None),
            LiveRow("Example", 111, "/game/playstation-5/example", None),
        ),
        (
            SourceRow("Example [Other Edition]", None, None, None),
            LiveRow(
                "Example [Other Edition]",
                222,
                "/game/playstation-5/example-other-edition",
                None,
            ),
        ),
    ]
    merged, _, stats = merge_catalog(
        [existing],
        joined,
        platform="ps5",
        region="PAL España",
        pc_region="PAL EU (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
    )
    assert stats["added"] == 1
    assert len(merged) == 2
    assert {game["pcId"] for game in merged} == {111, 222}


def test_verified_source_can_promote_an_excluded_match() -> None:
    existing = sample_game("ps5-example", "Example")
    existing["listingStatus"] = "excluded"
    existing["coverUrl"] = None
    existing["pcPath"] = "/game/pal-playstation-5/example"
    joined = [
        (
            SourceRow("Example", None, None, None),
            LiveRow("Example", 111, "/game/pal-playstation-5/example", None),
        )
    ]
    merged, _, stats = merge_catalog(
        [existing],
        joined,
        platform="ps5",
        region="PAL España",
        pc_region="PAL EU (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
        promote_matched_excluded=True,
    )
    assert len(merged) == 1
    assert merged[0]["listingStatus"] == "listed"
    assert stats["promoted"] == 1
    assert stats["updated"] == 1


def test_reviewed_alias_retires_displaced_catalog_duplicate() -> None:
    canonical = sample_game(
        "ps3-skylanders-spyro-s-adventure-ps3-pack-de-inicio",
        "Skylanders Spyro's Adventure PS3 Pack de Inicio",
    )
    duplicate = sample_game(
        "ps3-skylanders-spyro%27s-adventure-starter-pack",
        "Skylanders: Spyro's Adventure Starter Pack",
    )
    for game in (canonical, duplicate):
        game["platformSlug"] = "ps3"
    duplicate["pcId"] = 5037241
    duplicate["pcPath"] = "/game/pal-playstation-3/skylanders-spyro%27s-adventure-starter-pack"
    joined = [
        (
            SourceRow("Skylanders: Spyro's Adventure Starter Pack", None, None, None),
            LiveRow(
                "Skylanders: Spyro's Adventure Starter Pack",
                5037241,
                "/game/pal-playstation-3/skylanders-spyro%27s-adventure-starter-pack",
                None,
            ),
        )
    ]
    merged, _, stats = merge_catalog(
        [canonical, duplicate],
        joined,
        platform="ps3",
        region="PAL España",
        pc_region="PAL EU (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
    )
    assert canonical["pcId"] == 5037241
    assert canonical["listingStatus"] == "listed"
    assert duplicate["listingStatus"] == "excluded"
    assert duplicate["pcId"] is None
    assert stats["retiredDuplicates"] == 1
    assert len(merged) == 2


def test_usd_prices_map_to_conditions_and_preserve_existing_reference() -> None:
    catalog = [sample_game("ps5-juego-usa", "Juego USA")]
    catalog[0]["region"] = "USA"
    catalog[0]["pcId"] = 321
    joined = [
        (
            SourceRow("Juego USA", Decimal("10"), Decimal("20"), Decimal("30")),
            LiveRow("Juego USA", 321, "/game/playstation-4/juego-usa", None),
        )
    ]
    merged, _, stats = merge_catalog(
        catalog,
        joined,
        platform="ps5",
        region="USA",
        pc_region="NTSC USA (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
        usd_per_eur=Decimal("1.1590"),
        exchange_rate_date="2026-09-01",
    )
    game = merged[0]
    assert game["priceChartingLooseUsd"] == 10
    assert game["priceChartingCompleteUsd"] == 20
    assert game["priceChartingSealedUsd"] == 30
    assert game["estimatedPriceLoose"] == 8.63
    assert game["estimatedPriceComplete"] == 17.26
    assert game["estimatedPriceSealed"] == 25.88
    assert game["recommendedPrice"] == 15
    assert game["pcRefPrice"] == 17.26
    assert game["priceSource"] == "manual"
    assert stats["updated"] == 1

    _, _, second_stats = merge_catalog(
        merged,
        joined,
        platform="ps5",
        region="USA",
        pc_region="NTSC USA (referencia)",
        collected_at="2026-09-01T12:00:00+02:00",
        covers_root=None,
        usd_per_eur=Decimal("1.1590"),
        exchange_rate_date="2026-09-01",
    )
    assert second_stats["updated"] == 0


def test_cover_reencode_removes_source_metadata_and_standardizes_size() -> None:
    image = Image.new("RGB", (320, 500), (10, 80, 160))
    exif = Image.Exif()
    exif[0x010E] = "PriceCharting source image"
    source = io.BytesIO()
    image.save(source, format="JPEG", exif=exif)

    with tempfile.TemporaryDirectory() as temp_dir:
        destination = Path(temp_dir) / "ps5" / "juego-limpio.jpg"
        save_clean_cover(source.getvalue(), destination)
        assert cover_is_clean(destination)
        assert b"pricecharting" not in destination.read_bytes().lower()
        with Image.open(destination) as cleaned:
            assert cleaned.size == CANVAS_SIZE
            assert not cleaned.getexif()


def test_cover_reencode_crops_excessive_uniform_canvas_and_upscales_art() -> None:
    image = Image.new("RGB", (1600, 1600), (255, 255, 255))
    cover = Image.new("RGB", (300, 420), (25, 90, 170))
    image.paste(cover, (650, 590))
    source = io.BytesIO()
    image.save(source, format="JPEG", quality=92)

    with tempfile.TemporaryDirectory() as temp_dir:
        destination = Path(temp_dir) / "ps3" / "small-centered-cover.jpg"
        save_clean_cover(source.getvalue(), destination)
        assert cover_is_clean(destination)
        with Image.open(destination) as cleaned:
            difference = ImageChops.difference(
                cleaned.convert("RGB"),
                Image.new("RGB", CANVAS_SIZE, (246, 246, 246)),
            ).convert("L")
            bbox = difference.point(lambda value: 255 if value > 24 else 0).getbbox()
            assert bbox is not None
            assert bbox[2] - bbox[0] >= 900
            assert bbox[3] - bbox[1] >= 1250


def test_cover_reencode_can_crop_only_the_excessive_horizontal_border() -> None:
    image = Image.new("RGB", (540, 360), (255, 255, 255))
    cover = Image.new("RGB", (274, 340), (25, 90, 170))
    image.paste(cover, (133, 10))
    source = io.BytesIO()
    image.save(source, format="JPEG", quality=92)

    with tempfile.TemporaryDirectory() as temp_dir:
        destination = Path(temp_dir) / "ps3" / "vertical-steelbook.jpg"
        save_clean_cover(source.getvalue(), destination)
        assert cover_is_clean(destination)
        with Image.open(destination) as cleaned:
            difference = ImageChops.difference(
                cleaned.convert("RGB"),
                Image.new("RGB", CANVAS_SIZE, (246, 246, 246)),
            ).convert("L")
            bbox = difference.point(lambda value: 255 if value > 32 else 0).getbbox()
            assert bbox is not None
            assert bbox[2] - bbox[0] >= 900
            assert bbox[3] - bbox[1] >= 1150


def test_reused_cover_keeps_region_specific_filename() -> None:
    image = Image.new("RGB", (320, 500), (10, 80, 160))
    source = io.BytesIO()
    image.save(source, format="JPEG")
    catalog = [{"id": "ps5-usa-example", "slug": "example", "platformSlug": "ps5"}]

    with tempfile.TemporaryDirectory() as temp_dir:
        destination = Path(temp_dir) / "ps5" / "usa-example.jpg"
        save_clean_cover(source.getvalue(), destination)
        stats = download_covers(
            catalog,
            [CoverTask("ps5-usa-example", "Example", "https://invalid.test", destination)],
            workers=1,
        )
        assert stats["reused"] == 1
        assert catalog[0]["coverUrl"] == "/covers/ps5/usa-example.jpg"


if __name__ == "__main__":
    test_merge_preserves_prices_and_skips_technical_duplicate()
    test_title_normalization_handles_common_catalog_variants()
    test_distinct_pc_ids_with_equivalent_titles_remain_separate()
    test_one_existing_record_cannot_claim_two_source_editions()
    test_verified_source_can_promote_an_excluded_match()
    test_reviewed_alias_retires_displaced_catalog_duplicate()
    test_usd_prices_map_to_conditions_and_preserve_existing_reference()
    test_cover_reencode_removes_source_metadata_and_standardizes_size()
    test_cover_reencode_crops_excessive_uniform_canvas_and_upscales_art()
    test_cover_reencode_can_crop_only_the_excessive_horizontal_border()
    test_reused_cover_keeps_region_specific_filename()
    print("OK: import_pricecharting_software_list")
