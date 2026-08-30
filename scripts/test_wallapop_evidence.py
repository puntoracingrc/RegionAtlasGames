#!/usr/bin/env python3
"""Regresiones de detalle, región, estado y deduplicación Wallapop."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.condition_buckets import infer_condition_bucket  # noqa: E402
from collectors.catalog_match import match_catalog_product  # noqa: E402
from collect_wallapop import route_row_to_detected_variant  # noqa: E402
from collectors.game_region_learning import game_region_profile  # noqa: E402
from collectors.game_content_profile import game_content_profile  # noqa: E402
from collectors.region_inference import detect_listing_region  # noqa: E402
from collectors.regional_variant_routing import strict_regions_match  # noqa: E402
from collectors.wallapop_client import parse_item_detail_html  # noqa: E402
from collectors.wallapop_listing_ai import ListingAiResult, passes_listing_ai  # noqa: E402
from collectors.wallapop_match import (  # noqa: E402
    dedupe_wallapop_rows,
    listing_has_unmatched_extras,
    product_to_ingest_row,
)
from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402


def assert_equal(actual: object, expected: object, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: esperado {expected!r}, recibido {actual!r}")


def test_detail_parser() -> None:
    item = {
        "title": {"original": "13 Sentinels Aegis Rim PS4 precintado ES"},
        "description": {
            "original": "Videojuego nuevo, precintado. Caja y juego en español. Sin uso."
        },
        "characteristics": "Nuevo · PlayStation 4",
        "images": [
            {"urls": {"medium": f"https://cdn.example/{index}.jpg"}}
            for index in range(1, 4)
        ],
    }
    payload = {"props": {"pageProps": {"item": item}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'
    product = parse_item_detail_html(html, {"productUrl": "https://example.test/item"})
    assert_equal(product["description"], item["description"]["original"], "descripción completa")
    assert_equal(len(product["imageUrls"]), 3, "galería completa")
    assert_equal(product["imageUrl"], "https://cdn.example/1.jpg", "imagen principal")
    assert product["detailFetched"] is True

    entity_payload = {
        "props": {
            "pageProps": {
                "item": {
                    "title": {"original": "Juego &quot;especial&quot;"},
                    "description": {"original": "Texto con entidad HTML literal"},
                }
            }
        }
    }
    entity_html = (
        '<script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(entity_payload)
        + "</script>"
    )
    entity_product = parse_item_detail_html(entity_html, {})
    assert_equal(entity_product["title"], "Juego &quot;especial&quot;", "JSON raw no se corrompe")


def test_condition_language() -> None:
    assert_equal(
        infer_condition_bucket("Nuevo, precintado. Caja y juego en español. Sin uso."),
        "sealed",
        "precintado",
    )
    assert_equal(
        infer_condition_bucket("Solo desprecintado por predilección a coleccionar sin precinto."),
        "complete",
        "desprecintado",
    )
    assert_equal(
        infer_condition_bucket("Caja abierta, juego y caja retail."),
        "complete",
        "caja abierta",
    )
    assert_equal(
        infer_condition_bucket("Caja y disco, sin manual."),
        None,
        "sin manual y contenido original desconocido",
    )
    assert_equal(
        infer_condition_bucket("Caja y disco, sin manual.", manual_expected=True),
        None,
        "sin manual cuando era obligatorio",
    )
    assert_equal(
        infer_condition_bucket("Caja y disco, sin manual.", manual_expected=False),
        "complete",
        "sin manual cuando la edición nunca lo incluyó",
    )


def test_region_language() -> None:
    assert_equal(detect_listing_region("13 Sentinels PS4 PAL ESP"), "PAL España", "PAL ESP explícito")
    assert_equal(detect_listing_region("13 Sentinels PS4 precintado ES"), "PAL España", "ES físico explícito")
    assert_equal(
        detect_listing_region("Caja y juego en español"),
        "PAL España",
        "embalaje español explícito",
    )
    assert_equal(
        detect_listing_region("Juegos en español, voces y subtítulos en castellano"),
        None,
        "idioma jugable no es región",
    )
    assert_equal(
        detect_listing_region("Vendedor en España. Juego en español."),
        None,
        "ubicación del vendedor no es región física",
    )
    assert_equal(
        detect_listing_region("Edición física. PEGI 12. Juego en español."),
        "PAL Europa",
        "PEGI solo prueba Europa",
    )
    rules_ok, reason = check_listing_evidence_meets_rules(
        "ps4",
        "PAL España",
        ["listing_title_region", "seller_states_physical_region"],
        0.92,
    )
    assert rules_ok, reason
    assert not strict_regions_match("PAL UK/ENG", "PAL Europa")
    assert not strict_regions_match("PAL España", "PAL Europa")


def test_unmatched_extras() -> None:
    listing = {
        "title": "13 Sentinels Aegis Rim PS4 + Art Book",
        "description": "Juego junto con su libro de arte.",
    }
    assert listing_has_unmatched_extras(
        listing,
        {"title": "13 Sentinels: Aegis Rim", "edition": "standard"},
    )
    assert not listing_has_unmatched_extras(
        {
            **listing,
            "title": "13 Sentinels Aegis Rim Collector's Edition PS4 + Art Book",
        },
        {"title": "13 Sentinels: Aegis Rim Collector's Edition", "edition": "collector"},
    )


def test_physical_editions_never_share_a_catalog_match() -> None:
    standard = {
        "id": "ps4-1971-project-helios",
        "title": "1971 Project Helios",
        "titlePc": "1971 Project Helios",
        "platformSlug": "ps4",
        "region": "PAL Europa",
        "edition": "standard",
        "listingStatus": "listed",
    }
    collector = {
        "id": "ps4-1971-project-helios-collector",
        "title": "1971 Project Helios [Collector's Edition]",
        "titlePc": "1971 Project Helios [Collector's Edition]",
        "platformSlug": "ps4",
        "region": "PAL España",
        "edition": "collector",
        "listingStatus": "listed",
    }
    standard_listing = {
        "title": "1971 Project Helios PS4",
        "description": "Buen estado",
    }
    collector_listing = {
        "title": "1971 Project Helios Collector's Edition PS4",
        "description": "Sin abrir. Nuevo a estrenar y en PAL ES",
    }

    assert listing_has_unmatched_extras(collector_listing, standard)
    assert listing_has_unmatched_extras(standard_listing, collector)
    assert not listing_has_unmatched_extras(standard_listing, standard)
    assert not listing_has_unmatched_extras(collector_listing, collector)

    standard_result = match_catalog_product(standard_listing, [standard, collector], "ps4")
    collector_result = match_catalog_product(collector_listing, [standard, collector], "ps4")
    assert_equal(standard_result.game and standard_result.game["id"], standard["id"], "estándar")
    assert_equal(collector_result.game and collector_result.game["id"], collector["id"], "collector")

    missing = match_catalog_product(collector_listing, [standard], "ps4")
    assert missing.game is None
    assert_equal(missing.unmatched_reason, "physical_edition_missing", "hueco de edición")
    assert_equal(missing.detected_edition, "collector", "edición ausente detectada")


def test_exact_id_deduplication_only() -> None:
    rows = [
        {
            "externalId": "same-id",
            "catalogId": "ps4-usa-game",
            "catalogRegion": "USA",
            "listingRegion": "PAL España",
            "matchScore": 0.8,
            "regionReviewNeeded": True,
        },
        {
            "externalId": "same-id",
            "catalogId": "ps4-japan-game",
            "catalogRegion": "Japón",
            "listingRegion": "PAL España",
            "matchScore": 0.8,
            "regionReviewNeeded": True,
        },
        {
            "externalId": "different-id",
            "catalogId": "ps4-usa-game",
            "catalogRegion": "USA",
            "listingRegion": "PAL España",
            "title": "El mismo titulo visible",
            "priceEur": 19.9,
            "imageUrl": "https://example.test/same-looking-cover.jpg",
            "matchScore": 0.8,
            "regionReviewNeeded": True,
        },
        {
            "externalId": "another-different-id",
            "catalogId": "ps4-usa-game",
            "catalogRegion": "USA",
            "listingRegion": "PAL España",
            "title": "El mismo titulo visible",
            "priceEur": 19.9,
            "imageUrl": "https://example.test/same-looking-cover.jpg",
            "matchScore": 0.8,
            "regionReviewNeeded": True,
        },
    ]
    deduped, removed = dedupe_wallapop_rows(rows)
    assert_equal(len(deduped), 3, "anuncios distintos conservados aunque se parezcan")
    assert_equal(removed, 1, "solo asociación repetida retirada")
    same = next(row for row in deduped if row["externalId"] == "same-id")
    assert_equal(len(same["catalogMatchAlternatives"]), 2, "alternativas regionales conservadas")
    assert_equal(len(same["matchAlternatives"]), 2, "alternativas visibles en revisión")


def test_routes_a_found_region_to_its_catalog_variant() -> None:
    variants = [
        {
            "id": "ps4-usa-game",
            "title": "Example Game",
            "platformSlug": "ps4",
            "region": "USA",
            "edition": "standard",
        },
        {
            "id": "ps4-es-game",
            "title": "Example Game",
            "platformSlug": "ps4",
            "region": "PAL España",
            "edition": "standard",
        },
    ]
    routed = route_row_to_detected_variant(
        {
            "externalId": "listing-1",
            "catalogId": "ps4-usa-game",
            "catalogRegion": "USA",
            "listingRegion": "PAL España",
            "regionEvidence": ["listing_title_region", "seller_states_physical_region"],
            "aiConfidence": 0.92,
            "regionReviewNeeded": True,
        },
        variants[0],
        variants,
    )
    assert_equal(routed["catalogId"], "ps4-es-game", "variante de destino")
    assert routed["regionVerified"] is True
    assert_equal(routed["searchedCatalogId"], "ps4-usa-game", "origen de búsqueda trazable")


def test_text_ai_is_a_hint_not_physical_region_proof() -> None:
    ai_result = ListingAiResult(
        is_video_game=True,
        is_target_game=True,
        listing_region="PAL España",
        region_matches_catalog=True,
        condition="sealed",
        confidence=1.0,
        reason="suposición textual incorrecta",
    )
    previous = os.environ.get("REGION_VISION_DISABLED")
    os.environ["REGION_VISION_DISABLED"] = "1"
    try:
        row = product_to_ingest_row(
            {
                "externalId": "listing-pegi",
                "title": "Example Game PS4 Nuevo",
                "description": "Edición física. PEGI 12. Juego en español.",
                "priceEur": 19.9,
                "productUrl": "https://example.test/listing-pegi",
            },
            "ps4-es-game",
            "PAL España",
            "ps4",
            game_title="Example Game",
            listing_ai=ai_result,
        )
    finally:
        if previous is None:
            os.environ.pop("REGION_VISION_DISABLED", None)
        else:
            os.environ["REGION_VISION_DISABLED"] = previous
    assert row is not None
    assert_equal(row["listingRegion"], "PAL Europa", "texto determinista prevalece")
    assert row["regionVerified"] is False
    assert "listing_ai_region_conflict" in row["regionEvidence"]

    wrong_target_hint = ListingAiResult(
        is_video_game=True,
        is_target_game=False,
        listing_region=None,
        region_matches_catalog=False,
        condition="complete",
        confidence=1.0,
        reason="sin región suficiente",
    )
    assert passes_listing_ai(wrong_target_hint, catalog_region="PAL España")


def test_learning_only_from_accepted_reviews() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        queue_file = Path(tmp) / "price-review-queue.json"
        queue_file.write_text(
            json.dumps(
                {
                    "items": [
                        {
                            "status": "pending",
                            "catalogId": "ps4-game",
                            "evidence": {"imageUrls": ["https://cdn.example/pending.jpg"]},
                        },
                        {
                            "status": "accepted",
                            "catalogId": "ps4-game",
                            "detectedRegion": "PAL España",
                            "decidedAt": "2026-08-30T08:00:00Z",
                            "decision": {
                                "action": "accept",
                                "catalogId": "ps4-game",
                                "region": "PAL España",
                                "note": "Contraportada española verificada",
                            },
                            "evidence": {
                                "imageUrls": ["https://cdn.example/front.jpg", "https://cdn.example/back.jpg"],
                                "regionEvidence": ["cover_spain", "cover_vision"],
                            },
                        },
                    ]
                }
            ),
            encoding="utf-8",
        )
        previous = os.environ.get("PRICE_REVIEW_QUEUE_FILE")
        os.environ["PRICE_REVIEW_QUEUE_FILE"] = str(queue_file)
        try:
            profile = game_region_profile("ps4-game")
        finally:
            if previous is None:
                os.environ.pop("PRICE_REVIEW_QUEUE_FILE", None)
            else:
                os.environ["PRICE_REVIEW_QUEUE_FILE"] = previous
        assert profile is not None
        examples = profile["approvedExamples"]
        assert_equal(len(examples), 1, "solo aprende de decisiones aceptadas")
        assert_equal(examples[0]["region"], "PAL España", "región aprendida")
        assert_equal(len(examples[0]["imageUrls"]), 2, "referencias visuales aprendidas")


def test_content_profile_only_learns_from_strong_accepted_evidence() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        queue_file = Path(tmp) / "price-review-queue.json"
        queue_file.write_text(
            json.dumps(
                {
                    "items": [
                        {
                            "id": "pending",
                            "status": "pending",
                            "catalogId": "ps4-game",
                            "condition": "complete",
                            "listingTitle": "Nuevo pero abierto",
                            "evidence": {"imageUrls": ["front", "back"]},
                        },
                        {
                            "id": "accepted",
                            "status": "accepted",
                            "catalogId": "ps4-game",
                            "condition": "complete",
                            "listingTitle": "Como nuevo pero sin manual",
                            "decision": {"catalogId": "ps4-game", "condition": "complete"},
                            "evidence": {"imageUrls": ["front", "back"]},
                        },
                    ]
                }
            ),
            encoding="utf-8",
        )
        previous = os.environ.get("PRICE_REVIEW_QUEUE_FILE")
        os.environ["PRICE_REVIEW_QUEUE_FILE"] = str(queue_file)
        try:
            profile = game_content_profile({"id": "ps4-game", "platformSlug": "ps4"})
            explicit = game_content_profile(
                {"id": "ps4-explicit", "platformSlug": "ps4", "manualExpected": False}
            )
        finally:
            if previous is None:
                os.environ.pop("PRICE_REVIEW_QUEUE_FILE", None)
            else:
                os.environ["PRICE_REVIEW_QUEUE_FILE"] = previous
        assert_equal(profile["manualExpected"], True, "sin manual prueba que existía")
        assert_equal(profile["manualExpectationSource"], "accepted_manual_evidence", "origen")
        assert_equal(explicit["manualExpected"], False, "catálogo verificado prevalece")


def main() -> None:
    test_detail_parser()
    test_condition_language()
    test_region_language()
    test_unmatched_extras()
    test_physical_editions_never_share_a_catalog_match()
    test_exact_id_deduplication_only()
    test_routes_a_found_region_to_its_catalog_variant()
    test_text_ai_is_a_hint_not_physical_region_proof()
    test_learning_only_from_accepted_reviews()
    test_content_profile_only_learns_from_strong_accepted_evidence()
    print("OK Wallapop evidence v2")


if __name__ == "__main__":
    main()
