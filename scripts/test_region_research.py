"""Offline tests: documentary hints never constitute a listing decision."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from collectors import region_cover_vision as vision
from collectors import region_research as research


class ResearchTests(unittest.TestCase):
    def test_documentary_records_are_traceable_and_component_scoped(self):
        for path in (research.RESEARCH_FILE, research.SNES_RESEARCH_FILE, research.MEGADRIVE_RESEARCH_FILE):
            document = json.loads(path.read_text())
            entries = document["inspectionRules"] + document["gameReferences"]
            ids = [entry["id"] for entry in entries]
            self.assertEqual(len(ids), len(set(ids)))
            for entry in entries:
                self.assertTrue(entry["text"])
                self.assertTrue(entry["sourceIds"])
                for source in entry["sourceIds"]:
                    self.assertIn(source, document["sources"])
                if "visualReview" in entry:
                    self.assertIn(entry["visualReview"]["sourceId"], document["sources"])
                    self.assertTrue(entry["visualReview"]["finding"])
                for component, codes in entry.get("componentCodes", {}).items():
                    self.assertIn(component, {"box", "manual", "cartridge", "romChip"})
                    self.assertIsInstance(codes, list)
                    self.assertTrue(codes)
                    self.assertEqual(len(codes), len(set(codes)))
                    for code in codes:
                        self.assertIn(code, entry["text"])
                if entry.get("status", "reviewed_guidance") != "reviewed_guidance":
                    self.assertTrue(entry["neededEvidence"])

    def test_new_gameboy_codes_reach_only_explicit_standard_bindings(self):
        cases = (
            ("gameboy-es-pokemon-red", "DMG-APAS-NESP", "gameboy-es-pokemon-yellow"),
            ("gameboy-es-pokemon-yellow", "DMG-APSS-NESP", "gameboy-es-pokemon-yellow-blister"),
            ("gameboy-es-donkey-kong-land", "DMG-YT-ESP-2", "gameboy-es-donkey-kong-land-classic-series"),
            ("gameboy-es-donkey-kong-land-2", "DMG-ADDP-NITA-1", "gameboy-es-donkey-kong-land-2-nintendo-classics"),
            ("gameboy-es-wario-land-super-mario-land-3", "DMG-WJ-EUR", "gameboy-es-wario-land-super-mario-land-3-nintendo-classics"),
            ("gameboy-es-zelda-link-s-awakening", "DMG-ZL-ESP-1", "gameboy-es-zelda-link-s-awakening-nintendo-classics"),
            ("gameboy-es-aladdin", "DMG-ALAP-NEU-5", "gameboy-aladdin"),
        )
        for catalog_id, code, other_id in cases:
            self.assertIn(code, research.region_research_prompt("gameboy", catalog_id))
            self.assertNotIn(code, research.region_research_prompt("gameboy", other_id))

    def test_unbound_comic_classics_never_reaches_standard_game(self):
        document = json.loads(research.RESEARCH_FILE.read_text())
        entry = next(e for e in document["gameReferences"] if e["id"] == "asterix-obelix-comic-unbound")
        self.assertEqual(entry["status"], "pending_catalog_binding")
        self.assertEqual(entry["catalogIds"], [])
        for catalog_id in (None, "gameboy-es-asterix-obelix", "gameboy-asterix-obelix"):
            self.assertNotIn("DMG-AXOP", research.region_research_prompt("gameboy", catalog_id))

    def test_alternative_manuals_are_preserved_without_expansion(self):
        document = json.loads(research.RESEARCH_FILE.read_text())
        for entry_id, verbatim in (
            ("wario-neai-manual-alternatives", "DMG-WJ-ESP-3 or ITA-2"),
            ("zelda-esp2-language-components", "DMG-ZL-ESP-2 or ESP-3"),
        ):
            entry = next(e for e in document["gameReferences"] if e["id"] == entry_id)
            self.assertEqual(entry["componentClaimsVerbatim"]["manual"], verbatim)
            self.assertNotIn("manual", entry["componentCodes"])
            self.assertIn(verbatim, research.region_research_prompt("gameboy", entry["catalogIds"][0]))

    def test_snes_scans_do_not_establish_factory_pairings_or_exceptions(self):
        document = json.loads(research.SNES_RESEARCH_FILE.read_text())
        for entry in document["gameReferences"]:
            if "romChip" in entry.get("componentCodes", {}):
                self.assertIn("not_factory_pairings", entry["componentAssociation"])
        prompt = research.region_research_prompt("snes", "snes-super-mario-world-2-yoshi%27s-island")
        self.assertIn("SPAL-YI-2", prompt)
        self.assertIn("excepcion sigue pendiente", prompt)
        for claim in document["disputedClaims"]:
            self.assertNotIn(claim["summary"], prompt)
            for source in claim["sourceIds"]:
                self.assertIn(source, document["sources"])
        self.assertIn("SNSP-AF2P-EUR", research.region_research_prompt("snes", "snes-pal-breath-fire-ii"))
        self.assertNotIn("SNSP-AF2P-EUR", research.region_research_prompt("snes", "snes-breath-of-fire-ii"))
        self.assertNotIn("SFRG-K2-0", research.region_research_prompt("snes", "snes-secret-of-mana-2-homebrew"))

    def test_prompt_remains_bounded_as_reference_collection_grows(self):
        for platform, path in (("gameboy", research.RESEARCH_FILE), ("snes", research.SNES_RESEARCH_FILE),
                               ("megadrive", research.MEGADRIVE_RESEARCH_FILE)):
            document = json.loads(path.read_text())
            catalog_ids = {i for e in document["gameReferences"] for i in e["catalogIds"]}
            for catalog_id in catalog_ids | {None}:
                prompt = research.region_research_prompt(platform, catalog_id)
                self.assertLess(len(prompt), 8000, catalog_id)
                for entry in document["gameReferences"]:
                    included = catalog_id in entry["catalogIds"] and entry.get("status", "reviewed_guidance") == "reviewed_guidance"
                    self.assertEqual(entry["text"] in prompt, included, entry["id"])

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

    def test_snes_new_visual_sources_are_traceable(self):
        document = json.loads(research.SNES_RESEARCH_FILE.read_text())
        images = document["imageReferences"]
        unavailable = document["unavailableImages"]
        self.assertEqual(document["lastPassCoverage"]["imagesVisuallyReviewed"], len(images))
        self.assertEqual(document["lastPassCoverage"]["unavailableImages"], len(unavailable))
        urls = {image["url"] for image in images.values()}
        self.assertEqual(len(urls), len(images))
        self.assertTrue(urls.isdisjoint(image["url"] for image in unavailable))
        used = set()
        for entry in document["gameReferences"]:
            for image_id in entry.get("imageIds", []):
                used.add(image_id)
                image = images[image_id]
                self.assertIn(image["sourceId"], entry["sourceIds"])
                source = document["sources"][image["sourceId"]]
                self.assertTrue(source["attribution"])
                self.assertEqual(source["license"], "not_established_no_images_copied")
                self.assertTrue(image["finding"])
                self.assertTrue(image["url"].startswith("https://"))
        self.assertEqual(used, set(images))
        for image in unavailable:
            self.assertIn(image["sourceId"], document["sources"])
            self.assertEqual(image["status"], "placeholder_not_evidence")

    def test_snes_distributor_guides_do_not_propagate(self):
        cases = (
            ("snes-desert-fighter", "DRO SOFT S.A."),
            ("snes-manchester-united-championship-soccer", "Arcadia"),
            ("snes-pal-brutal-paws-fury", "PROEIN"),
        )
        for catalog_id, distributor in cases:
            self.assertIn(distributor, research.region_research_prompt("snes", catalog_id))
            for other_id, _ in cases:
                if other_id != catalog_id:
                    self.assertNotIn(distributor, research.region_research_prompt("snes", other_id))
            for platform in ("gameboy", "megadrive", "megacd"):
                self.assertNotIn(distributor, research.region_research_prompt(platform, catalog_id))
        self.assertNotIn("PROEIN", research.region_research_prompt("snes", "snes-brutal-paws-of-fury"))
        self.assertNotIn("DRO SOFT S.A.", research.region_research_prompt(
            "snes", "snes-japon-desert-fighter-suna-no-arashi-sakusen"))

    def test_snes_yoshi_photos_leave_original_exception_blocked(self):
        document = json.loads(research.SNES_RESEARCH_FILE.read_text())
        by_id = {entry["id"]: entry for entry in document["gameReferences"]}
        pending = by_id["snes-yoshi-noe-exception"]
        self.assertEqual(pending["status"], "pending_primary_evidence")
        self.assertTrue(pending["neededEvidence"])
        entry = by_id["snes-yoshi-rear-warning-comparison"]
        prompt = research.region_research_prompt("snes", entry["catalogIds"][0])
        self.assertNotIn(pending["text"], prompt)
        self.assertIn(entry["text"], prompt)
        self.assertIn("excepcion espanola permanece bloqueada", prompt)
        for catalog_id in ("snes-super-mario-world-2-yoshi%27s-island-big-box",
                           "snes-pal-eu-super-mario-world-2-yoshi-s-island-big-box",
                           "snes-super-nintendo-console-yoshi%27s-island-action-pack"):
            self.assertNotIn(entry["text"], research.region_research_prompt("snes", catalog_id))

    def test_snes_unavailable_images_and_disputes_not_rendered(self):
        document = json.loads(research.SNES_RESEARCH_FILE.read_text())
        catalog_ids = {i for entry in document["gameReferences"] for i in entry["catalogIds"]}
        for catalog_id in catalog_ids | {None}:
            prompt = research.region_research_prompt("snes", catalog_id)
            for claim in document["disputedClaims"]:
                self.assertNotIn(claim["summary"], prompt)
                for source in claim["sourceIds"]:
                    self.assertIn(source, document["sources"])
            for image in document["unavailableImages"]:
                self.assertNotIn(image["url"], prompt)
                self.assertNotIn(image["finding"], prompt)

    def test_snes_photos_do_not_fabricate_listing_evidence(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(vision, "VISION_CACHE_DIR", Path(tmp)), \
                patch.object(vision, "game_region_profile", return_value=None), \
                patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch.object(vision, "_openai_vision", return_value=json.dumps({
                    "listingRegion": "unknown", "regionMatchesCatalog": False,
                    "isTargetGame": True, "confidence": 0.5, "observations": []
                })) as api:
            result = vision.classify_region_from_cover(
                ["https://example.test/desert.jpg"], title="Desert Fighter", game_title="Desert Fighter",
                platform_slug="snes", catalog_region="PAL Europa", source="ebay",
                catalog_id="snes-desert-fighter", use_cache=False,
            )
            payload = json.dumps(api.call_args.args[0])
            self.assertIn("DRO SOFT S.A.", payload)
            self.assertIn("https://example.test/desert.jpg", payload)
            self.assertNotIn("uploads.tapatalk-cdn.com", payload)
            self.assertNotIn("spinecard-com-s3", payload)
            self.assertEqual(result.observations, [])
            self.assertEqual(result.evidence, [])
            self.assertIsNone(result.listing_region)
            self.assertFalse(result.region_matches_catalog)

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
        for platform in ("ps4", "gameboycolor", "gba", "ds", "megacd", "32x", "genesis"):
            self.assertEqual(research.region_research_prompt(platform, "gameboy-es-asterix"), "")

    def test_megadrive_images_are_traceable_not_rehosted(self):
        document = json.loads(research.MEGADRIVE_RESEARCH_FILE.read_text())
        images = document["imageReferences"]
        self.assertEqual(document["coverage"]["imagesVisuallyReviewed"], len(images))
        self.assertEqual(len({image["url"] for image in images.values()}), len(images))
        used_images = set()
        for entry in document["gameReferences"]:
            for image_id in entry["imageIds"]:
                image = images[image_id]
                used_images.add(image_id)
                self.assertIn(image["sourceId"], entry["sourceIds"])
                source = document["sources"][image["sourceId"]]
                self.assertTrue(source["attribution"])
                self.assertEqual(source["license"], "not_established_no_images_copied")
                self.assertTrue(image["finding"])
                self.assertTrue(image["url"].startswith("https://spinecard-com-s3.s3.dualstack.eu-west-1.amazonaws.com/original/3X/"))
        self.assertEqual(used_images, set(images))

    def test_megadrive_exact_pal_bindings(self):
        document = json.loads(research.MEGADRIVE_RESEARCH_FILE.read_text())
        catalog = {row["id"]: row for row in json.loads(
            (research.MEGADRIVE_RESEARCH_FILE.parents[2] / "data/catalog.json").read_text())}
        for entry in document["gameReferences"]:
            self.assertEqual(entry["binding"], "comparison_only_not_catalog_region_evidence")
            self.assertTrue(entry["catalogIds"])
            for catalog_id in entry["catalogIds"]:
                self.assertEqual(catalog[catalog_id]["platformSlug"], "megadrive")
                self.assertIn(catalog[catalog_id]["region"], {"PAL Europa", "PAL España"})
                self.assertIn(entry["text"], research.region_research_prompt("megadrive", catalog_id))

    def test_megadrive_does_not_propagate_between_editions_or_games(self):
        document = json.loads(research.MEGADRIVE_RESEARCH_FILE.read_text())
        references = document["gameReferences"]
        catalog = json.loads((research.MEGADRIVE_RESEARCH_FILE.parents[2] / "data/catalog.json").read_text())
        bound_ids = {i for entry in references for i in entry["catalogIds"]}
        # Check every other Mega Drive entry, including packs and non-PAL editions.
        general = research.region_research_prompt("megadrive", None)
        for row in catalog:
            if row["platformSlug"] == "megadrive" and row["id"] not in bound_ids:
                self.assertEqual(research.region_research_prompt("megadrive", row["id"]), general)
        for platform in ("gameboy", "snes", "megacd", "32x"):
            prompt = research.region_research_prompt(platform, "megadrive-micro-machines")
            for entry in references:
                self.assertNotIn(entry["text"], prompt)
        for catalog_id in ("megadrive-micro-machines-military", "megadrive-fifa-road-to-world-cup-98"):
            self.assertNotIn("Arcadia", research.region_research_prompt("megadrive", catalog_id))

    def test_megadrive_disputed_claims_never_enter_prompt(self):
        document = json.loads(research.MEGADRIVE_RESEARCH_FILE.read_text())
        catalog_ids = {i for entry in document["gameReferences"] for i in entry["catalogIds"]}
        for claim in document["disputedClaims"]:
            self.assertTrue(claim["neededEvidence"])
            for source in claim["sourceIds"]:
                self.assertIn(source, document["sources"])
            for catalog_id in catalog_ids | {None}:
                self.assertNotIn(claim["summary"], research.region_research_prompt("megadrive", catalog_id))
        prompt = research.region_research_prompt("megadrive", "megadrive-world-of-illusion")
        self.assertIn("paginas 2-3", prompt)
        self.assertIn("conservar la discrepancia", prompt)

    def test_megadrive_pending_reference_is_not_rendered(self):
        document = json.loads(research.MEGADRIVE_RESEARCH_FILE.read_text())
        entry = document["gameReferences"][0]
        entry["status"] = "pending_primary_evidence"
        with patch.object(research.json, "loads", return_value=document):
            prompt = research.region_research_prompt("megadrive", entry["catalogIds"][0])
        self.assertNotIn(entry["text"], prompt)

    def test_megadrive_reference_images_are_not_listing_evidence(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(vision, "VISION_CACHE_DIR", Path(tmp)), \
                patch.object(vision, "game_region_profile", return_value=None), \
                patch.object(vision, "region_cover_vision_available", return_value=True), \
                patch.object(vision, "_openai_vision", return_value=json.dumps({
                    "listingRegion": "unknown", "regionMatchesCatalog": False,
                    "isTargetGame": True, "confidence": 0.5, "observations": []
                })) as api:
            result = vision.classify_region_from_cover(
                ["https://example.test/aladdin.jpg"], title="Aladdin", game_title="Aladdin",
                platform_slug="megadrive", catalog_region="PAL Europa", source="ebay",
                catalog_id="megadrive-pal-disneys-aladdin", use_cache=False,
            )
            payload = json.dumps(api.call_args.args[0])
            self.assertIn("16-BIT CARTRIDGE", payload)
            self.assertIn("https://example.test/aladdin.jpg", payload)
            self.assertNotIn("spinecard-com-s3", payload)
            self.assertEqual(result.observations, [])
            self.assertEqual(result.evidence, [])
            self.assertIsNone(result.listing_region)
            self.assertFalse(result.region_matches_catalog)

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
