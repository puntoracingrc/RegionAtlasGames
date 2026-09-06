"""Offline billing-pause regression checks: no API calls or real data writes."""

import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from collectors.ai_balance import AiBalanceExhausted, check_billing_error
import run_ebay_regional_campaign as campaign


class BalancePauseTests(unittest.TestCase):
    def test_vision_does_not_swallow_billing_errors(self):
        from collectors import condition_vision, region_cover_vision
        cases = [
            (condition_vision, condition_vision.classify_condition_from_images, {"cache_key": "test"}),
            (region_cover_vision, region_cover_vision.classify_region_from_cover, {"game_title": "Test", "catalog_region": "PAL España"}),
        ]
        for module, classify, extra in cases:
            with self.subTest(module=module.__name__), tempfile.TemporaryDirectory() as tmp:
                error = urllib.error.HTTPError("https://example.test", 429, "error", {}, io.BytesIO(b'{"error":{"code":"insufficient_quota"}}'))
                available = "vision_available" if module is condition_vision else "region_cover_vision_available"
                with patch.object(module, available, return_value=True), patch.object(module, "_openai_vision", side_effect=error), patch.dict(os.environ, {"PRICE_AI_BALANCE_SIGNAL": str(Path(tmp) / "signal")}):
                    with self.assertRaises(AiBalanceExhausted):
                        classify(["https://example.test/cover.jpg"], title="Test", platform_slug="ps4", source="ebay", use_cache=False, **extra)

    def test_billing_codes_and_transient_errors(self):
        for code in ("insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached", "rate_limit_exceeded"):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as tmp:
                signal = Path(tmp) / "signal"
                error = urllib.error.HTTPError("https://example.test", 429, "error", {}, io.BytesIO(json.dumps({"error": {"code": code}}).encode()))
                with patch.dict(os.environ, {"PRICE_AI_BALANCE_SIGNAL": str(signal)}):
                    if code == "rate_limit_exceeded":
                        check_billing_error(error)
                        self.assertFalse(signal.exists())
                    else:
                        with self.assertRaises(AiBalanceExhausted):
                            check_billing_error(error)
                        self.assertTrue(signal.exists())

    def test_pause_preserves_batch_and_daily_usage_and_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            catalog = [{"id": "test", "title": "Test", "platformSlug": "ps4", "region": "PAL España", "listingStatus": "listed"}]
            catalog_file = root / "catalog.json"
            catalog_file.write_text(json.dumps(catalog))
            global_file = root / "global.json"
            platform_file = root / "ps4.json"

            def collect(command):
                self.assertIn("collect_ebay_es.py", command[1])
                report = Path(command[command.index("--report-output") + 1])
                report.write_text(json.dumps({"pauseReason": "ai_balance_exhausted", "apiSearches": 1, "catalogIdsProcessed": ["test"], "catalogIdsWithListings": ["test"], "listingsAdded": 1}))
                return 0

            with patch.object(campaign, "CATALOG_FILE", catalog_file), patch.object(campaign, "GLOBAL_STATE_FILE", global_file), patch.object(campaign, "COVER_CANDIDATES_FILE", root / "covers.json"), patch.object(campaign, "state_path", return_value=platform_file), patch.object(campaign, "platform_order", return_value=(["ps4"], {"ps4": "PS4"})), patch.object(campaign, "validate_runtime_environment"), patch.object(campaign, "write_github_output"), patch.object(sys, "argv", ["campaign"]), patch.dict(os.environ, {"EBAY_RESUME_AI_BALANCE": "false"}), patch.object(campaign, "run_command", side_effect=collect) as run:
                campaign.main()
                state = json.loads(global_file.read_text())
                self.assertEqual(state["status"], "paused")
                self.assertEqual(state["totals"]["completed"], 0)
                self.assertEqual(state["totals"]["pending"], 1)
                self.assertEqual(state["dailyUsage"]["apiSearches"], 1)
                self.assertEqual(json.loads(catalog_file.read_text()), catalog)
                run.assert_called_once()
                campaign.main()
                run.assert_called_once()
                with patch.dict(os.environ, {"EBAY_RESUME_AI_BALANCE": "true"}):
                    campaign.main()
                self.assertEqual(run.call_count, 2)


if __name__ == "__main__":
    unittest.main()
