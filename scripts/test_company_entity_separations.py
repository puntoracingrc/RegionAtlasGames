#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from company_entity import (  # noqa: E402
    build_company_entity_registry,
    resolve_canonical_company,
    resolve_canonical_company_slug,
)
from collectors import game_details_lib  # noqa: E402
from collectors.game_details_lib import is_valid_detail  # noqa: E402

SEPARATIONS_FILE = ROOT / "data" / "company-separations.json"
CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
REGISTRY_FILE = ROOT / "data" / "index" / "company-entities.json"
COMPANIES_FILE = ROOT / "data" / "index" / "companies.json"


class CompanyEntitySeparationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(SEPARATIONS_FILE.read_text(encoding="utf-8"))
        cls.decisions = cls.config["separations"]
        cls.independent = {
            slug
            for decision in cls.decisions
            for slug in decision["independentSlugs"]
        }

    def test_audited_decision_set_is_complete_and_unique(self) -> None:
        all_slugs = [
            slug
            for decision in self.decisions
            for slug in decision["independentSlugs"]
        ]
        self.assertEqual(len(self.decisions), 23)
        self.assertEqual(len(all_slugs), 78)
        self.assertEqual(len(set(all_slugs)), 78)
        self.assertTrue(all(decision["confidence"] == "VERY_HIGH" for decision in self.decisions))
        self.assertTrue(
            all(decision["canonicalSlug"] not in decision["independentSlugs"] for decision in self.decisions)
        )

    def test_independent_slugs_override_every_other_identity_signal(self) -> None:
        shared_path = "/desarrolladoras-de-software/shared-company"
        for slug in self.independent:
            self.assertEqual(
                resolve_canonical_company_slug(
                    slug,
                    name="Shared Company Europe Ltd.",
                    wikidata_id="Q-SHARED",
                    museum_path=shared_path,
                ),
                slug,
            )

    def test_blocked_clusters_are_not_forced_independent(self) -> None:
        self.assertTrue(
            {
                "atari-europe",
                "mastiff-llc",
                "snk-corporation",
                "zushi-games-ltd",
            }.isdisjoint(self.independent)
        )

    def test_registry_build_keeps_normalized_and_museum_collisions_separate(self) -> None:
        bandai_path = "/desarrolladoras-de-software/bandai"
        square_path = "/desarrolladoras-de-software/square"
        details = {
            "bandai-game": {
                "developer": {"slug": "bandai", "name": "Bandai", "museumPath": bandai_path}
            },
            "bandai-namco-game": {
                "developer": {
                    "slug": "bandai-namco-entertainment",
                    "name": "Bandai Namco Entertainment",
                    "museumPath": bandai_path,
                }
            },
            "idea-factory-game": {
                "publisher": {"slug": "idea-factory", "name": "Idea Factory"}
            },
            "idea-factory-international-game": {
                "publisher": {
                    "slug": "idea-factory-international",
                    "name": "Idea Factory International",
                }
            },
            "square-game": {
                "developer": {"slug": "square", "name": "Square", "museumPath": square_path}
            },
            "square-enix-game": {
                "developer": {
                    "slug": "square-enix",
                    "name": "Square Enix",
                    "museumPath": square_path,
                }
            },
            "sony-alias-game": {
                "publisher": {"slug": "sony-computer", "name": "Sony Computer Entertainment"}
            },
        }
        registry = build_company_entity_registry(details, set(details))

        for slug in ("bandai", "idea-factory-international", "square"):
            self.assertIn(slug, registry["entities"])
            self.assertEqual(registry["slugToCanonical"].get(slug, slug), slug)

        self.assertNotIn("bandai", registry["entities"]["bandai-namco-entertainment"]["aliasSlugs"])
        self.assertNotIn("idea-factory-international", registry["entities"]["idea-factory"]["aliasSlugs"])
        self.assertNotIn("square", registry["entities"]["square-enix"]["aliasSlugs"])
        self.assertNotIn(bandai_path, registry["museumPathToCanonical"])
        self.assertNotIn(square_path, registry["museumPathToCanonical"])

        self.assertEqual(registry["slugToCanonical"]["sony-computer"], "sony-interactive-entertainment")
        self.assertNotIn("sony-computer", registry["entities"])

    def test_canonical_name_corrections_are_persistent(self) -> None:
        expected = {
            decision["canonicalSlug"]: decision["canonicalName"]
            for decision in self.decisions
            if decision.get("canonicalName")
        }
        for slug, name in expected.items():
            self.assertEqual(resolve_canonical_company(slug, slug)["name"], name)

    def test_generated_indexes_apply_every_approved_separation(self) -> None:
        catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
        details = json.loads(DETAILS_FILE.read_text(encoding="utf-8"))
        registry = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        companies = json.loads(COMPANIES_FILE.read_text(encoding="utf-8"))
        catalog_ids = {game["id"] for game in catalog}
        company_ids = {
            game_id
            for game_id, detail in details.items()
            if game_id in catalog_ids
            and is_valid_detail(detail)
            and (detail.get("developer") or detail.get("publisher"))
        }

        expected_games: dict[str, set[str]] = {slug: set() for slug in self.independent}
        expected_developers: dict[str, set[str]] = {slug: set() for slug in self.independent}
        expected_publishers: dict[str, set[str]] = {slug: set() for slug in self.independent}
        for game_id in company_ids:
            detail = details[game_id]
            for role in ("developer", "publisher"):
                credit = detail.get(role) or {}
                slug = credit.get("slug")
                if slug not in self.independent:
                    continue
                expected_games[slug].add(game_id)
                if role == "developer":
                    expected_developers[slug].add(game_id)
                else:
                    expected_publishers[slug].add(game_id)

        for decision in self.decisions:
            canonical = registry["entities"][decision["canonicalSlug"]]
            for slug in decision["independentSlugs"]:
                self.assertIn(slug, registry["entities"])
                self.assertIn(slug, companies)
                self.assertNotIn(slug, canonical.get("aliasSlugs", []))
                self.assertEqual(registry.get("slugToCanonical", {}).get(slug, slug), slug)
                self.assertEqual(set(companies[slug]["gameIds"]), expected_games[slug])
                self.assertEqual(set(companies[slug]["asDeveloper"]), expected_developers[slug])
                self.assertEqual(set(companies[slug]["asPublisher"]), expected_publishers[slug])

        self.assertNotIn(
            "/desarrolladoras-de-software/bandai",
            registry.get("museumPathToCanonical", {}),
        )
        self.assertNotIn(
            "/desarrolladoras-de-software/square",
            registry.get("museumPathToCanonical", {}),
        )

    def test_index_build_preserves_company_credits_for_excluded_releases(self) -> None:
        catalog = [
            {"id": "listed-game", "platformSlug": "test", "listingStatus": "listed"},
            {"id": "excluded-game", "platformSlug": "test", "listingStatus": "excluded"},
        ]
        details = {
            "listed-game": {
                "developer": {"slug": "test-studio", "name": "Test Studio"},
                "genres": [],
            },
            "excluded-game": {
                "publisher": {"slug": "test-publisher", "name": "Test Publisher"},
                "genres": [],
            },
        }

        with (
            patch.object(game_details_lib, "save_company_entity_registry"),
            patch.object(game_details_lib, "save_genre_entity_registry"),
        ):
            indexes = game_details_lib.build_indexes(details, catalog)

        self.assertEqual(indexes["companies"]["test-studio"]["gameIds"], ["listed-game"])
        self.assertEqual(indexes["companies"]["test-publisher"]["gameIds"], ["excluded-game"])


if __name__ == "__main__":
    unittest.main()
