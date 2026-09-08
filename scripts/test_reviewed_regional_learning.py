"""Offline, reproducible fixtures: documented combinations are not authenticity claims."""

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

import apply_gameboy_reviewed_batch as batch
from collectors import game_region_learning as learning
from collectors import region_research as research
from collectors.regional_packaging import infer_region_from_visual_observations
from collectors.regional_variant_routing import same_regional_edition_family
from collectors.reviewed_regional_examples import reviewed_batch, reviewed_examples
from collectors.visual_image_urls import image_identity, select_distinct_images


class ReviewedLearningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = reviewed_batch()
        cls.report = batch.load(batch.REPORT_FILE)
        cls.catalog = {g["id"]: g for g in batch.load(batch.CATALOG_FILE)}

    def test_fixed_batch_fixture_replays_without_global_catalog_size_constraint(self):
        # Reconstruct only the historical affected rows, plus identity-only family references.
        rows = {c["catalogId"]: deepcopy(c["before"]) for c in self.report["changes"] if c["before"]}
        for review in self.manifest["reviews"]:
            if review.get("familyCatalogId"):
                gid = review["familyCatalogId"]
                rows[gid] = deepcopy(self.catalog[gid])
        rows["unrelated-fixture"] = {"id": "unrelated-fixture", "platformSlug": "ps4", "region": "USA"}
        catalog = list(rows.values())
        queue = {"items": [deepcopy(c["before"]) for c in self.report["queueChanges"] if c["before"]], "decisions": []}
        meta = deepcopy(self.report["metaBefore"])
        result = batch.apply_batch(catalog, queue, meta, self.manifest)
        self.assertEqual(result["changes"], self.report["changes"])
        self.assertEqual(result["queueChanges"], self.report["queueChanges"])
        self.assertEqual(result["rowsAfter"], result["rowsBefore"] + 3)
        self.assertEqual(len(catalog), len({g["id"] for g in catalog}))
        self.assertIn(rows["unrelated-fixture"], catalog)

    def test_price_and_identity_boundaries(self):
        self.assertEqual(len(self.report["changes"]), 8)
        self.assertEqual(len(self.report["addedIds"]), 3)
        identity = ("id", "slug", "title", "platformSlug", "region", "edition", "coverUrl", "pcId", "pcPath")
        for change in self.report["changes"]:
            after = change["after"]
            self.assertEqual(after["platformSlug"], "gameboy")
            self.assertEqual(change["priceKind"], "active_asking_price")
            self.assertTrue(change["sourceUrl"].startswith("https://www.ebay.es/itm/"))
            if change["before"]:
                for field in identity:
                    self.assertEqual(change["before"].get(field), after.get(field), field)
            else:
                self.assertIsNone(after["pcId"])
                self.assertIsNone(after["pcPath"])
                self.assertIsNone(after["pcRefPrice"])
                self.assertTrue((batch.ROOT / "public" / after["coverUrl"].lstrip("/")).exists())

    def test_review_outcomes_do_not_accept_pending_or_non_games(self):
        from collections import Counter
        self.assertEqual(Counter(r["action"] for r in self.manifest["reviews"]),
                         {"accept": 8, "reject": 3, "pending": 5})
        applied = {c["externalId"] for c in self.report["changes"]}
        for row in self.manifest["reviews"]:
            self.assertEqual(f"v1|{row['ebayId']}|0" in applied, row["action"] == "accept")
            self.assertTrue(row["observations"])
            self.assertTrue(row["imagesReviewed"])
            self.assertTrue(row["doNotInfer"])

    def test_title_aliases_remain_platform_and_edition_scoped(self):
        left = self.catalog["gameboy-es-wario-land-super-mario-land-3"]
        right = self.catalog["gameboy-pal-super-mario-land-3-wario-land"]
        self.assertTrue(same_regional_edition_family(left, right))
        self.assertFalse(same_regional_edition_family(left, {**right, "platformSlug": "gba"}))
        self.assertFalse(same_regional_edition_family(left, {**right, "edition": "nintendo-classics"}))
        self.assertFalse(same_regional_edition_family(self.catalog["gameboy-es-super-mario-land"],
                                                     self.catalog["gameboy-es-super-mario-land-2"]))

    def test_reviewed_photos_are_examples_not_new_listing_observations(self):
        for row in self.manifest["reviews"]:
            if row["action"] == "accept":
                approved, _ = reviewed_examples(row["targetCatalogId"])
                self.assertTrue(any(x["sourceUrl"] == row["listingUrl"] for x in approved))
                self.assertTrue(all(x["associationStatus"] == "observed_listing_not_factory_certified" for x in approved))
        _, rejected = reviewed_examples("gameboy-es-super-mario-land")
        self.assertTrue(any(x["reasonCode"] == "wrong_game" for x in rejected))

    def test_later_operational_decision_overrides_reference_at_another_image_size(self):
        approved, _ = reviewed_examples("gameboy-es-super-mario-land-2")
        photo = approved[0]["imageUrls"][0].replace("s-l1600", "s-l225")
        live = {"reasonCode": "wrong_game", "imageUrls": [photo], "decidedAt": "2026-09-09"}
        with patch.object(learning, "collector_game_learning", return_value={"rejectedExamples": [live]}), \
                patch.object(learning, "_accepted_examples", return_value=[]):
            profile = learning.game_region_profile("gameboy-es-super-mario-land-2")
        self.assertEqual(profile["approvedExamples"], [])
        self.assertEqual(profile["rejectedExamples"][0], live)
        self.assertTrue(all(x.get("reasonCode") == "non_game" for x in profile["rejectedExamples"][1:]))

    def test_distinct_photos_choose_only_supplied_largest_size(self):
        small = "https://i.ebayimg.com/images/g/abc/s-l225.jpg"
        large = "https://i.ebayimg.com/images/g/abc/s-l1600.webp"
        back = "https://i.ebayimg.com/images/g/def/s-l500.jpg"
        self.assertEqual(image_identity(small), image_identity(large))
        self.assertEqual(select_distinct_images([small, large, back, back, None, "http://bad.test/a"], 3), [large, back])
        self.assertEqual(select_distinct_images([small], 3), [small])

    def test_snes_combinations_are_traceable_alternatives_not_a_merged_inventory(self):
        document = batch.load(research.SNES_DISTRIBUTIONS_FILE)
        entries = [e for e in document["gameReferences"] if e.get("distributionVariants")]
        self.assertEqual(len(entries), 39)  # This named W-Z research fixture, not the live catalogue.
        self.assertEqual(sum(len(e["distributionVariants"]) for e in entries), 40)
        for entry in entries:
            for gid in entry["catalogIds"]:
                self.assertEqual(self.catalog[gid]["platformSlug"], "snes")
            for variant in entry["distributionVariants"]:
                self.assertIsNone(variant["period"])
                for sid in variant["sourceIds"]:
                    self.assertIn(sid, document["sources"])
        zombies = research.distribution_variants("snes", "snes-zombies")
        self.assertEqual([v["editionCodeSuffix"] for v in zombies], ["FAH", "NOE"])
        self.assertNotEqual(zombies[0]["components"], zombies[1]["components"])

    def test_new_positive_evidence_can_resolve_spain_without_all_esp_components(self):
        observation = [{"role": "back", "productCodes": ["SNSP-6W-FAH"], "distributors": ["Spaco S.A."]}]
        self.assertEqual(infer_region_from_visual_observations(
            observation, platform_slug="snes", catalog_id="snes-pal-wolfenstein-3-d")[0], "PAL España")
        self.assertIsNone(infer_region_from_visual_observations(
            observation, platform_slug="snes", catalog_id="snes-unrelated")[0])
        self.assertIsNone(research.observed_distribution_region("snes", "snes-pal-wolfenstein-3-d", []))

    def test_italian_gig_mark_does_not_emit_spanish_evidence(self):
        observations = [{"role": "front", "distributors": ["GiG"]}, {"role": "manual", "languages": ["it"]}]
        region, evidence = infer_region_from_visual_observations(
            observations, platform_slug="gameboy", catalog_id="gameboy-it-tetris")
        self.assertEqual(region, "PAL Italia")
        self.assertNotIn("cover_spain", evidence)
        self.assertIsNone(research.observed_distribution_region("gameboy", "gameboy-it-tetris", observations[:1]))

    def test_bandai_is_not_spanish_without_matching_manual_observation(self):
        observation = [{"role": "back", "distributors": ["Bandai"]}]
        self.assertIsNone(research.observed_distribution_region("snes", "snes-zombies", observation))
        observation.append({"role": "manual", "languages": ["es"]})
        self.assertEqual(research.observed_distribution_region("snes", "snes-zombies", observation), "PAL España")

    def test_unknown_and_cross_platform_references_do_not_create_region(self):
        self.assertIsNone(research.observed_distribution_region("snes", "snes-unrelated", [{"role": "back", "distributors": ["Spaco"]}]))
        self.assertEqual(research.distribution_variants("gameboy", "snes-zombies"), [])
        self.assertEqual(research.distribution_variants("snes", "gameboy-it-tetris"), [])
        self.assertNotIn("yoshi-cookie-1", research.region_research_prompt("snes", "snes-pal-super-mario-kart"))


if __name__ == "__main__":
    unittest.main()
