"""Offline regressions for listing photos, components and independent identity."""

from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from collectors import region_cover_vision as vision
from collectors.regional_packaging import normalize_visual_observations


def piece(role, **fields):
    return {"imageSource": "listing", "imageIndex": 1, "role": role, **fields}


class RegionVisionComponentsTests(unittest.TestCase):
    def classify(self, payload, **kwargs):
        args = dict(title="Test", game_title="Test", platform_slug="gameboy",
                    catalog_region="PAL España", source="ebay", use_cache=False)
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(vision, "VISION_CACHE_DIR", Path(tmp)), \
                patch.object(vision, "game_region_profile", return_value=None), \
                patch.object(vision, "region_research_prompt", return_value=""), \
                patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch.object(vision, "_openai_vision", return_value=json.dumps(payload)):
            return vision.classify_region_from_cover(["https://example.test/listing.jpg"], **(args | kwargs))

    def test_one_photo_preserves_multiple_components_and_separate_codes(self):
        rows = [piece("manual", productCodes=["DMG-SK-FAH"]),
                piece("cartridge", productCodes=["DMG-SK-NOE-1"])]
        normalized = normalize_visual_observations(rows, image_limit=1)
        self.assertEqual(len(normalized), 2)
        self.assertEqual([r["productCodes"] for r in normalized], [["DMG-SK-FAH"], ["DMG-SK-NOE-1"]])
        self.assertEqual(normalize_visual_observations(normalized), normalized)

    def test_exact_duplicates_not_distinct_components_are_removed(self):
        rows = [piece("manual"), piece("manual"), piece("cartridge")]
        self.assertEqual(len(normalize_visual_observations(rows, image_limit=1)), 2)

    def test_reference_or_global_indexes_never_become_listing_evidence(self):
        rows = [piece("front", imageSource="reference", productCodes=["DMG-XX-ESP"]),
                piece("front", imageIndex=3, productCodes=["DMG-XX-ESP"]),
                piece("cartridge", productCodes=["DMG-XX-EUR"])]
        result = self.classify({"observations": rows, "listingRegion": "PAL España"})
        self.assertEqual(len(result.observations), 1)
        self.assertEqual(result.listing_region, "PAL Europa")

    def test_legacy_rows_remain_readable_but_unlabelled_new_inference_is_not_evidence(self):
        rows = [{"imageIndex": 1, "role": "cartridge", "productCodes": ["DMG-XX-ESP"]}]
        self.assertEqual(len(normalize_visual_observations(rows)), 1)
        result = self.classify({"observations": rows, "listingRegion": "PAL España"})
        self.assertEqual(result.observations, [])
        self.assertIsNone(result.listing_region)

    def test_region_match_is_computed_not_copied_from_model(self):
        payload = {"isTargetGame": True, "regionMatchesCatalog": False,
                   "observations": [piece("cartridge", productCodes=["DMG-XX-ESP"])]}
        result = self.classify(payload)
        self.assertTrue(result.region_matches_catalog)
        other = self.classify(payload, catalog_region="PAL Alemania")
        self.assertEqual(result.listing_region, other.listing_region)
        self.assertFalse(other.region_matches_catalog)
        self.assertTrue(other.is_target_game)

    def test_wrong_platform_cannot_be_overridden_by_generic_true(self):
        result = self.classify({"isTargetGame": True, "condition": "complete", "identity": {
            "observedPlatform": "megadrive", "platformMatches": True,
            "titleMatches": True, "editionMatches": True}})
        self.assertFalse(result.is_target_game)
        self.assertIsNone(result.condition)

    def test_region_mismatch_or_box_only_does_not_erase_identity(self):
        result = self.classify({"isTargetGame": False, "identity": {
            "observedPlatform": "gameboy", "platformMatches": True,
            "titleMatches": True, "editionMatches": True}, "condition": "complete",
            "observations": [piece("front", productCodes=["DMG-XX-NOE"])]})
        self.assertTrue(result.is_target_game)
        self.assertFalse(result.region_matches_catalog)
        self.assertIsNone(result.condition)

    def test_visible_game_and_manual_without_box_is_not_complete(self):
        payload = {"isTargetGame": True, "condition": "game_manual",
                   "observations": [piece("manual"), piece("cartridge")]}
        self.assertEqual(self.classify(payload).condition, "game_manual")
        self.assertIsNone(self.classify(payload | {"condition": "complete"}).condition)

    def test_box_printed_manual_claim_is_not_a_physical_manual(self):
        result = self.classify({"isTargetGame": True, "condition": "complete", "observations": [
            piece("front", component="box", textSnippets=["MODE D'EMPLOI EN FRANCAIS"])]})
        self.assertIsNone(result.condition)
        self.assertEqual(result.observations[0]["textSnippets"], ["MODE D'EMPLOI EN FRANCAIS"])

    def test_complete_retains_documented_contents_not_matching_component_languages(self):
        payload = {"isTargetGame": True, "condition": "complete", "observations": [
            piece("front", languages=["fr"]), piece("cartridge", languages=["de"]),
            piece("manual", languages=["en"])]}
        self.assertEqual(self.classify(payload, manual_expected=True,
                                       original_contents_expected=["manual"]).condition, "complete")
        self.assertIsNone(self.classify(payload, original_contents_expected=["map"]).condition)
        payload["observations"].append(piece("other", component="extra", contentName="map"))
        self.assertEqual(self.classify(payload, original_contents_expected=["map"]).condition, "complete")

    def test_modern_no_manual_and_factory_seal_are_supported(self):
        payload = {"isTargetGame": True, "condition": "complete",
                   "observations": [piece("front"), piece("disc")]}
        self.assertEqual(self.classify(payload, manual_expected=False).condition, "complete")
        sealed = payload | {"condition": "sealed", "observations": [piece("front")], "factorySealVisible": True}
        self.assertEqual(self.classify(sealed).condition, "sealed")
        self.assertIsNone(self.classify(sealed | {"factorySealVisible": False}).condition)

    def test_invalid_enum_and_confidence_are_not_region_or_certainty(self):
        self.assertIsNone(vision._map_region("PAL Europa|PAL España|unknown"))
        for value in (float("nan"), float("inf"), "oops", -1, 2, None):
            self.assertEqual(vision._confidence(value), 0)

    def test_legacy_text_cannot_restore_complete_after_visual_assessment(self):
        result = vision.RegionCoverVisionResult("PAL España", True, ["cover_spain"],
            .99, None, "Only box visible", True, [], game_confidence=.99, condition_assessed=True)
        args = dict(platform_slug="gameboy", catalog_region="PAL España", game_title="Test",
                    listing_title="Test complete", listing_region="PAL España", evidence=["cover_spain"],
                    ai_conf=.99, ok_ref=True, image_urls=["https://example.test/photo.jpg"],
                    source="ebay", force_vision=True, known_condition="complete")
        with patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch("region_evidence_rules.check_listing_evidence_meets_rules", return_value=(True, [])), \
                patch.object(vision, "classify_region_from_cover", return_value=result) as classify:
            self.assertIsNone(vision.apply_region_cover_vision(**args)[4])
            classify.return_value = replace(result, is_target_game=False)
            self.assertFalse(vision.apply_region_cover_vision(**args)[3])
            classify.return_value = None
            self.assertEqual(vision.apply_region_cover_vision(**args)[4], "complete")

    def test_prompt_namespaces_references_and_listing_without_target_region(self):
        profile = {"fingerprint": "test", "approvedExamples": [{"region": "PAL Europa",
                   "imageUrls": ["https://example.test/reference.jpg"]}]}
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(vision, "VISION_CACHE_DIR", Path(tmp)), \
                patch.object(vision, "game_region_profile", return_value=profile), \
                patch.object(vision, "region_research_prompt", return_value=""), \
                patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch.object(vision, "_openai_vision", return_value="{}") as api:
            vision.classify_region_from_cover(["https://example.test/listing.jpg"], title="Test",
                game_title="Test", platform_slug="gameboy", catalog_region="PAL Alemania", source="ebay")
            content = api.call_args.args[0][1]["content"]
            for index, item in enumerate(content):
                if item["type"] == "image_url":
                    label = content[index - 1]["text"]
                    self.assertIn("REFERENCIA" if "reference" in item["image_url"]["url"] else "imageIndex=1", label)
            self.assertNotIn("Edición catálogo (región)", content[0]["text"])

    def test_unknown_visual_condition_survives_row_enrichment_and_price_resolution(self):
        from collectors import listing_region_enrich as enrich
        from collectors.condition_buckets import observation_from_row
        row = {"title": "Test completo CIB", "condition": "complete", "conditionBucket": "complete",
               "priceEur": 99, "source": "ebay-es", "regionVerified": True}
        with patch.object(enrich, "region_needs_cover_vision", return_value=True), \
                patch.object(enrich, "enrich_listing_region_from_cover", return_value=(
                    "PAL España", ["cover_vision", "cover_spain"], .99, True, None,
                    ["cover_vision_condition_unknown"])), \
                patch("collectors.condition_resolve.classify_condition_from_images") as second_api:
            updated = enrich.apply_region_enrichment_to_row(row, None, platform_slug="gameboy",
                catalog_region="PAL España", game_title="Test", source="ebay-es", ok_ref=True)
            self.assertNotIn("condition", updated)
            self.assertNotIn("conditionBucket", updated)
            self.assertIsNone(observation_from_row(updated, platform_slug="gameboy"))
            second_api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
