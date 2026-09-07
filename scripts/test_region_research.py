"""Offline tests: documentary hints never constitute a listing decision."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from collectors import region_cover_vision as vision
from collectors import region_research as research


class ResearchTests(unittest.TestCase):
    def test_snes_sources_and_exact_bindings(self):
        document = json.loads(research.SNES_RESEARCH_FILE.read_text())
        root = research.SNES_RESEARCH_FILE.parents[2]
        catalog = {row["id"]: row for row in json.loads((root / "data/catalog.json").read_text())}
        for entry in document["inspectionRules"] + document["gameReferences"]:
            for source in entry["sourceIds"]:
                self.assertTrue(document["sources"][source]["url"].startswith("https://"))
            for catalog_id in entry.get("catalogIds", []):
                self.assertEqual(catalog[catalog_id]["platformSlug"], "snes")
                self.assertIn(catalog[catalog_id]["region"], {"PAL Europa", "PAL España"})

    def test_snes_pending_exceptions_not_in_prompt(self):
        for catalog_id in ("snes-super-mario-world-2-yoshi%27s-island",
                           "snes-illusion-of-time-big-box-spanish", "snes-pal-eu-yoshi-s-cookie"):
            prompt = research.region_research_prompt("snes", catalog_id)
            self.assertNotIn("Arcadia", prompt)
            self.assertNotIn("cartuchos NOE", prompt)
            self.assertNotIn("guia en lugar", prompt)

    def test_snes_does_not_borrow_other_games_or_platform_references(self):
        prompt = research.region_research_prompt("snes", "snes-pal-super-mario-kart")
        self.assertIn("SNSP-MK-ESP", prompt)
        self.assertNotIn("SNSP-MW-ESP-2", prompt)
        self.assertNotIn("DMG-", prompt)
        self.assertNotIn("SNSP-MK-ESP", research.region_research_prompt("snes", "snes-super-mario-kart"))
        self.assertNotIn("SNSP-MK-ESP", research.region_research_prompt("gameboy", "snes-pal-super-mario-kart"))

    def test_sources_and_exact_catalog_bindings(self):
        document = json.loads(research.RESEARCH_FILE.read_text())
        root = research.RESEARCH_FILE.parents[2]
        catalog = {row["id"]: row for row in json.loads((root / "data/catalog.json").read_text())}
        for entry in document["inspectionRules"] + document["gameReferences"]:
            self.assertTrue(entry["sourceIds"])
            for source in entry["sourceIds"]:
                self.assertTrue(document["sources"][source]["url"].startswith("https://"))
            for catalog_id in entry.get("catalogIds", []):
                self.assertEqual(catalog[catalog_id]["platformSlug"], "gameboy")
                self.assertIn(catalog[catalog_id]["region"], {"PAL Europa", "PAL España"})
                self.assertEqual(entry["binding"], "comparison_only_not_catalog_region_evidence")

    def test_other_platforms_unchanged(self):
        for platform in ("ps4", "gameboycolor", "gba", "ds"):
            self.assertEqual(research.region_research_prompt(platform, "gameboy-es-asterix"), "")

    def test_specific_references_are_not_propagated(self):
        prompt = research.region_research_prompt("gameboy", "gameboy-es-asterix")
        self.assertIn("DMG-XA-FAH", prompt)
        self.assertNotIn("DMG-AF-FAH", prompt)
        for catalog_id in (None, "gameboy-es-asterix-obelix", "gameboy-usa-asterix", "unknown"):
            self.assertNotIn("DMG-XA-FAH", research.region_research_prompt("gameboy", catalog_id))

    def test_missing_research_has_legacy_fallback(self):
        with patch.object(research, "RESEARCH_FILE", Path("/nonexistent/research.json")):
            self.assertEqual(research.region_research_prompt("gameboy", None), "")

    def test_vision_consumes_guidance_without_fabricating_observations(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(vision, "VISION_CACHE_DIR", Path(tmp)), \
                patch.object(vision, "game_region_profile", return_value=None), \
                patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch.object(vision, "_openai_vision", return_value=json.dumps({
                    "listingRegion": "unknown", "regionMatchesCatalog": False,
                    "isTargetGame": True, "confidence": 0.5, "observations": []
                })) as api:
            result = vision.classify_region_from_cover(
                ["https://example.test/cart.jpg"], title="Asterix", game_title="Asterix",
                platform_slug="gameboy", catalog_region="PAL España", source="ebay",
                catalog_id="gameboy-es-asterix", use_cache=False,
            )
            self.assertIn("DMG-XA-FAH", json.dumps(api.call_args.args[0]))
            self.assertEqual(result.observations, [])
            self.assertEqual(result.evidence, [])
            self.assertIsNone(result.listing_region)
            self.assertFalse(result.region_matches_catalog)

    def test_research_revision_invalidates_explicit_cache_key(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(vision, "VISION_CACHE_DIR", Path(tmp)), \
                patch.object(vision, "game_region_profile", return_value=None), \
                patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch.object(vision, "_openai_vision", return_value="{}") as api:
            args = dict(title="Test", game_title="Test", platform_slug="gameboy",
                        catalog_region="PAL Europa", source="ebay", cache_key="fixed")
            with patch.object(vision, "region_research_prompt", return_value="v1"):
                vision.classify_region_from_cover(["https://example.test/cart.jpg"], **args)
                vision.classify_region_from_cover(["https://example.test/cart.jpg"], **args)
                self.assertEqual(api.call_count, 1)
            with patch.object(vision, "region_research_prompt", return_value="v2"):
                vision.classify_region_from_cover(["https://example.test/cart.jpg"], **args)
                self.assertEqual(api.call_count, 2)


if __name__ == "__main__":
    unittest.main()
