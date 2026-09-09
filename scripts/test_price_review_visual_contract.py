"""Offline regression sample: recognising a game is not proving its country or contents."""
import copy
import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import auto_price_review_vision as engine
from collectors.ai_balance import AiBalanceExhausted
from collectors.ai_usage import summarize_usage, usage_batch
from collectors.price_review_visual_contract import grounded_observations, score

IMAGES = ["https://i.ebayimg.com/images/g/test/s-l225.jpg", "https://i.ebayimg.com/images/g/test/s-l1600.jpg"]


def observation(**changes):
    return {"imageIndex": 1, "imageSource": "listing", "component": "box", "role": "front",
            "textSnippets": ["Nintendo GAME BOY"], "ratingSystems": [], "languages": [],
            "productCodes": [], "barcodes": [], "distributors": [], "editionMarkers": [], **changes}


def vision(**changes):
    return {"analysisVersion": 2, "observations": [observation()], "recognizedTitle": "Example",
            "recognizedPlatform": "Game Boy", "titleMatch": "same", "platformMatch": "same",
            "productKind": "game", "identityConfidence": 0.95, "productConfidence": 0.9,
            "productEvidenceQuote": "", "platformEvidenceQuote": "GAME BOY",
            "sellerClaims": [], "condition": None, "conditionConfidence": 0, "observationConfidence": 0.9,
            "reason": "Portada identificada; interior no visible.", **changes}


def apply(result, request=None, **changes):
    item = {"id": "review", "status": "pending", "platformSlug": "gameboy", "condition": "unknown",
            "targetRegion": "PAL España", "evidence": {}, **changes}
    outcome = engine.apply_vision_to_item(item, result, IMAGES, request or {})
    return item, item["evidence"]["coverVision"], outcome


class VisualContractTests(unittest.TestCase):
    def test_front_identifies_without_guessing_region_contents(self):
        item, evidence, outcome = apply(vision(condition="complete", conditionConfidence=0.99),
                                        {"assumedRegion": "PAL España", "assumedCondition": "complete"})
        self.assertTrue(evidence["isTargetGame"])
        self.assertEqual(evidence["assessment"], "identified")
        self.assertIsNone(evidence["condition"])
        self.assertIsNone(evidence["region"])
        self.assertFalse(evidence["valuationReady"])
        self.assertEqual(item["condition"], "unknown")
        self.assertNotIn("detectedRegion", item)
        self.assertNotIn("aiConfidence", item["evidence"])
        self.assertEqual(outcome, "updated")

    def test_each_explicit_negative_has_specific_reason(self):
        for kind in ("non_game", "box_only", "manual_only", "accessory", "lot"):
            with self.subTest(kind=kind):
                item, evidence, _ = apply(vision(productKind=kind, productEvidenceQuote="Solo caja o manual"), listingTitle="Solo caja o manual")
                self.assertIs(evidence["isTargetGame"], False)
                self.assertEqual(evidence["assessment"], kind)
                self.assertEqual(item["status"], "pending")
                self.assertFalse(evidence["valuationReady"])

    def test_wrong_platform_and_wrong_game_not_insufficient_contents(self):
        for key, expected in (("platformMatch", "wrong_platform"), ("titleMatch", "wrong_game")):
            _, evidence, _ = apply(vision(**{key: "different"}))
            self.assertEqual(evidence["assessment"], expected)
            self.assertFalse(evidence["isTargetGame"])

    def test_unknown_is_not_false(self):
        _, evidence, outcome = apply(vision(titleMatch="unknown"))
        self.assertIsNone(evidence["isTargetGame"])
        self.assertEqual(outcome, "unclear")

    def test_platform_and_merchandise_priority_and_untrusted_prose(self):
        _, pc, _ = apply(vision(platformMatch="different", productKind="non_game", reason="El producto parece no jugable"))
        self.assertEqual(pc["assessment"], "wrong_platform")
        self.assertEqual(pc["reason"], "El anuncio corresponde a otra plataforma.")
        _, magnet, _ = apply(vision(platformMatch="different", productKind="non_game", productEvidenceQuote="FRIDGE MAGNET"), listingTitle="Example FRIDGE MAGNET")
        self.assertEqual(magnet["assessment"], "non_game")
        item, partial, _ = apply(vision(condition="sealed", conditionConfidence=1, reason="Caja sellada [invalid prose]"))
        self.assertIsNone(partial["condition"])
        self.assertNotIn("sellada", partial["reason"])
        self.assertNotIn("invalid prose", " ".join(item["evidence"]["reviewNotes"]))
        self.assertIn("invalid prose", partial["modelReason"])

    def test_unproven_box_only_is_not_a_negative_identity(self):
        _, evidence, _ = apply(vision(productKind="box_only"))
        self.assertTrue(evidence["isTargetGame"])
        self.assertFalse(evidence["valuationReady"])

    def test_unquoted_rating_codes_barcodes_not_regional_evidence(self):
        _, evidence, _ = apply(vision(observations=[observation(
            ratingSystems=["ESRB"], productCodes=["CEN-1234"], barcodes=["045496735123"])]))
        self.assertEqual(evidence["observations"][0]["ratingSystems"], [])
        self.assertEqual(evidence["observations"][0]["productCodes"], [])
        self.assertEqual(evidence["observations"][0]["barcodes"], [])
        self.assertIsNone(evidence["region"])
        self.assertEqual(len(evidence["validationWarnings"]), 3)
        self.assertTrue(evidence["isTargetGame"])

    def test_dutch_french_front_does_not_prove_spain_or_pegi(self):
        _, evidence, _ = apply(vision(observations=[observation(
            textSnippets=["MET NEDERLANDSE HANDLEIDING", "MODE D'EMPLOI EN FRANCAIS"],
            languages=["nl", "fr"], ratingSystems=["PEGI"])]))
        self.assertTrue(evidence["isTargetGame"])
        self.assertIsNone(evidence["region"])
        self.assertNotIn("PEGI", evidence["observations"][0]["ratingSystems"])

    def test_quote_must_belong_to_same_listing_photo(self):
        actual = observation(imageIndex=1, productCodes=["DMG-X-ESP"])
        reference = observation(imageIndex=2, textSnippets=["DMG-X-ESP"], imageSource="reference")
        observations, warnings = grounded_observations([actual, reference], 2)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0]["productCodes"], [])
        self.assertEqual(len(warnings), 2)

    def test_same_image_size_variants_numbered_once_and_target_title_present(self):
        payload = engine.vision_payload({"catalogId": "gameboy-es-mickey-s-dangerous-chase", "listingTitle": "untrusted"}, IMAGES)
        content = payload["input"][1]["content"]
        photos = [entry for entry in content if entry["type"] == "input_image"]
        self.assertEqual(photos, [{"type": "input_image", "image_url": IMAGES[1], "detail": "high"}])
        self.assertNotIn("Mickey's", json.dumps(payload))
        self.assertNotIn("untrusted", json.dumps(payload))
        interpreted = engine.interpretation_payload({"catalogId": "gameboy-es-mickey-s-dangerous-chase", "listingTitle": "untrusted"}, vision())
        self.assertEqual(json.loads(interpreted["input"][1]["content"])["target"]["title"], "Mickey's Dangerous Chase")
        self.assertNotIn("reference.jpg", json.dumps(payload))
        self.assertNotIn("FE-730", json.dumps(payload))
        self.assertEqual(payload["input"][0]["role"], "system")
        self.assertTrue(payload["text"]["format"]["strict"])

    def test_positive_code_and_visible_components_are_usable_without_rewriting_queue(self):
        front = observation(textSnippets=["DMG-X-ESP"], productCodes=["DMG-X-ESP"])
        cartridge = observation(component="game", role="cartridge")
        manual = observation(component="manual", role="manual")
        item, evidence, _ = apply(vision(observations=[front, cartridge, manual], condition="complete", conditionConfidence=0.9))
        self.assertEqual(evidence["region"], "PAL España")
        self.assertEqual(evidence["condition"], "complete")
        self.assertTrue(evidence["valuationReady"])
        self.assertEqual(item["condition"], "unknown")

    def test_region_conflict_keeps_identity_and_does_not_rewrite_old_region(self):
        _, evidence, outcome = apply(vision(observations=[observation(textSnippets=["DMG-X-USA"], productCodes=["DMG-X-USA"])]))
        self.assertEqual(outcome, "conflict")
        self.assertTrue(evidence["isTargetGame"])
        self.assertEqual(evidence["region"], "USA")
        self.assertFalse(evidence["valuationReady"])

    def test_known_distribution_sticker_still_activates_learning(self):
        variant = {"associationStatus": "community_documented_distribution", "recognitionDistributors": ["Spaco"], "marketRegion": "PAL España"}
        with patch("collectors.region_research.distribution_variants", return_value=[variant]):
            _, evidence, _ = apply(vision(observations=[observation(textSnippets=["Distribuido por Spaco"], distributors=["Spaco"])]), catalogId="gameboy-test")
        self.assertEqual(evidence["region"], "PAL España")
        self.assertIn("distributor_regional", evidence["regionEvidence"])

    def test_prior_decisions_prices_and_stale_evidence_are_preserved_not_promoted(self):
        original = {"aiConfidence": 0.2, "regionEvidence": ["cover_spain"]}
        item, evidence, _ = apply(vision(), evidence=copy.deepcopy(original), priceEur=15, catalogId="gameboy-test", detectedRegion="PAL España")
        self.assertEqual(item["priceEur"], 15)
        self.assertEqual(item["catalogId"], "gameboy-test")
        for key, value in original.items():
            self.assertEqual(item["evidence"][key], value)
        self.assertFalse(evidence["valuationReady"])

    def test_finite_scores_only(self):
        for invalid in (float("nan"), float("inf"), "NaN", True, {}, None):
            self.assertEqual(score(invalid), 0)

    def test_responses_completed_only_and_real_usage_recorded(self):
        data = {"id": "response-1", "model": "actual-model", "status": "completed", "output_text": json.dumps(vision()),
                "usage": {"input_tokens": 100, "output_tokens": 20, "total_tokens": 120}}
        with tempfile.TemporaryDirectory() as directory, usage_batch(directory) as journal:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "secret", "PRICE_AI_DISABLED": "0"}), patch.object(engine.urllib.request, "urlopen") as api:
                api.return_value.__enter__.return_value.read.return_value = json.dumps(data).encode()
                result = engine.openai_vision({}, IMAGES)
                self.assertEqual(result["model"], "actual-model")
                self.assertEqual(result["analysisVersion"], 2)
                for invalid in ({**data, "status": "incomplete"}, {**data, "output_text": "[]"}, {**data, "output_text": "{}"}):
                    api.return_value.__enter__.return_value.read.return_value = json.dumps(invalid).encode()
                    self.assertIsNone(engine.openai_vision({}, IMAGES))
            self.assertEqual(summarize_usage(journal)["totalTokens"], 600)
            self.assertNotIn("secret", journal.read_text())

    def test_disabled_no_images_and_billing_do_not_become_negative_evidence(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "secret", "PRICE_AI_DISABLED": "1"}), patch.object(engine.urllib.request, "urlopen") as api:
            self.assertIsNone(engine.openai_vision({}, IMAGES))
            api.assert_not_called()
        error = HTTPError("https://api.openai.com", 429, "Quota", {}, io.BytesIO(b'{"error":{"code":"insufficient_quota"}}'))
        with patch.dict(os.environ, {"OPENAI_API_KEY": "secret", "PRICE_AI_DISABLED": "0"}), patch.object(engine.urllib.request, "urlopen", side_effect=error):
            self.assertIsNone(engine.openai_vision({}, []))
            with self.assertRaises(AiBalanceExhausted):
                engine.openai_vision({}, IMAGES)

    def test_interpretation_cannot_rewrite_the_photograph(self):
        read = {**vision(observations=[observation()]), "model": "mini", "responseId": "read"}
        interpretation = {**vision(observations=[observation(productCodes=["MADE-UP-ESP"])]), "model": "mini", "responseId": "interpret"}
        with patch.object(engine, "request_visual_stage", side_effect=[read, interpretation]):
            result = engine.openai_vision({}, IMAGES)
        self.assertEqual(result["observations"], [observation()])
        self.assertEqual(result["responseId"], "read")
        self.assertEqual(result["interpretationResponseId"], "interpret")


if __name__ == "__main__":
    unittest.main()
