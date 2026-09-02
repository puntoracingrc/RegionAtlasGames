#!/usr/bin/env python3

from __future__ import annotations

import tempfile
from pathlib import Path

from PIL import Image

from audit_catalog_covers import is_bundled_cover_url, is_known_cover_url
from backfill_missing_catalog_covers import (
    accepted_verdict,
    apply_manual_decisions,
    artifact_candidates,
    cover_filename,
    region_family,
    region_search_terms,
    save_candidate_previews,
)


def game(**overrides):
    value = {
        "id": "ps2-example-platinum",
        "title": "Example [Platinum]",
        "platformSlug": "ps2",
        "platformName": "PlayStation 2",
        "region": "PAL España",
    }
    value.update(overrides)
    return value


def test_auditor_accepts_external_and_bundled_local_covers() -> None:
    assert is_known_cover_url("/covers/ps2/example.jpg")
    assert is_known_cover_url("/catalog-covers/neogeo-aes-plus/example.png")
    assert is_bundled_cover_url("/catalog-covers/ps4/example.jpg")
    assert not is_known_cover_url("/images/example.jpg")


def test_region_families_keep_ratings_separate() -> None:
    assert region_family("PAL España") == "PAL"
    assert region_family("PAL Alemania") == "GERMANY"
    assert region_family("USA") == "USA"
    assert region_family("Japón") == "JAPAN"
    assert "PEGI" in region_search_terms(game())
    assert "ESRB" in region_search_terms(game(region="USA"))
    assert "NTSC-J" in region_search_terms(game(region="Japón"))
    assert "USK" in region_search_terms(game(region="PAL Alemania"))


def test_filenames_never_include_the_source_name() -> None:
    assert cover_filename(game()) == "example-platinum.jpg"
    assert cover_filename(game(region="USA")) == "usa-example-platinum.jpg"
    assert cover_filename(game(region="Japón")) == "japon-example-platinum.jpg"
    assert "pricecharting" not in cover_filename(game()).lower()


def test_only_a_complete_high_confidence_verdict_is_accepted() -> None:
    verdict = {
        "chosenIndex": 1,
        "isTargetProduct": True,
        "platformMatch": True,
        "editionMatch": True,
        "frontCover": True,
        "regionFamilyMatch": True,
        "matchLevel": "same_title_region_variant",
        "confidence": 0.91,
    }
    assert accepted_verdict(verdict, 2)
    assert not accepted_verdict({**verdict, "editionMatch": False}, 2)
    assert not accepted_verdict({**verdict, "confidence": 0.6}, 2)
    assert not accepted_verdict({**verdict, "chosenIndex": 3}, 2)


def test_artifacts_do_not_cross_regional_families_or_drop_special_editions() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        pal = root / "batch-pal-eu" / "covers" / "ps2"
        usa = root / "batch-usa" / "covers" / "ps2"
        pal.mkdir(parents=True)
        usa.mkdir(parents=True)
        Image.new("RGB", (300, 400), "white").save(pal / "example-platinum.jpg")
        Image.new("RGB", (300, 400), "white").save(pal / "example.jpg")
        Image.new("RGB", (300, 400), "white").save(usa / "usa-example-platinum.jpg")

        matches = artifact_candidates(game(), root)
        assert [Path(item.local_path or "").name for item in matches] == ["example-platinum.jpg"]

        standard_matches = artifact_candidates(game(title="Example"), root)
        assert [Path(item.local_path or "").name for item in standard_matches] == ["example.jpg"]


def test_manual_review_persists_clean_numbered_previews() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        output = Path(temp_dir)
        image = Image.new("RGB", (320, 480), "navy")
        raw_path = output / "raw.png"
        image.save(raw_path)
        raw = raw_path.read_bytes()
        candidates = artifact_candidates(game(), output)
        if not candidates:
            from backfill_missing_catalog_covers import Candidate

            candidates = [Candidate(raw_path.as_uri(), raw_path.as_uri(), "Example", "test")]
        paths = save_candidate_previews(game(), candidates, [raw], output)
        assert paths == [str(output / "candidates" / "ps2-example-platinum" / "1.jpg")]
        with Image.open(paths[0]) as saved:
            assert saved.format == "JPEG"
            assert not saved.getexif()


def test_manual_decision_crops_and_builds_a_clean_cover() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        output = Path(temp_dir)
        preview = output / "candidates" / "ps2-example-platinum" / "1.jpg"
        preview.parent.mkdir(parents=True)
        image = Image.new("RGB", (800, 500), "navy")
        image.paste("orange", (400, 0, 800, 500))
        image.save(preview)
        catalog = [game()]
        report = {
            "results": [
                {
                    "catalogId": "ps2-example-platinum",
                    "status": "review_required",
                    "previewPaths": [str(preview)],
                }
            ]
        }
        count = apply_manual_decisions(
            report,
            catalog,
            {
                "ps2-example-platinum": {
                    "candidateIndex": 1,
                    "crop": [0.5, 0, 1, 1],
                    "note": "Frontal derecho de la carátula completa",
                }
            },
            output,
        )
        assert count == 1
        result = report["results"][0]
        assert result["status"] == "accepted"
        assert result["coverUrl"] == "/covers/ps2/example-platinum.jpg"
        with Image.open(result["outputPath"]) as saved:
            assert saved.size == (1000, 1400)
            assert not saved.getexif()
