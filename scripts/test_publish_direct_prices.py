import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("publisher", Path(__file__).with_name("publish_direct_prices.py"))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class DirectPriceClientTests(unittest.TestCase):
    def document(self):
        return {"metadata": {"currency": "EUR", "platform": "PS4", "region": "PAL España", "batchId": "one"}, "groups": [
            {"catalogId": "ps4-test", "gameTitle": "Test", "status": "provisional_local_proposal", "condition": "complete", "acceptedCount": 1, "cleanMeanEur": 12.5,
             "records": [{"decision": "accepted", "itemId": "one", "url": "https://www.ebay.es/itm/1", "priceEur": 12.5, "priceCents": 1250},
                         {"decision": "excluded_high_outlier", "itemId": "two", "url": "https://www.ebay.es/itm/2", "priceEur": 100, "priceCents": 10000}]},
            {"status": "held"},
        ]}

    def test_only_accepted_records_are_published(self):
        rows = publisher.submissions(self.document(), "task")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["conditions"][0]["listings"][0]["listingId"], "one")
        self.assertEqual(len(rows[0]["conditions"][0]["listings"]), 1)

    def test_tampered_mean_or_count_fails(self):
        for key, value in (("acceptedCount", 2), ("cleanMeanEur", 15)):
            doc = self.document()
            doc["groups"][0][key] = value
            with self.assertRaises(ValueError):
                publisher.submissions(doc, "task")

    def test_duplicate_fails(self):
        doc = self.document()
        extra = copy.deepcopy(doc["groups"][0])
        extra["condition"] = "sealed"
        doc["groups"].append(extra)
        with self.assertRaises(ValueError):
            publisher.submissions(doc, "task")

    def test_conflicting_editions_fail(self):
        doc = self.document()
        extra = copy.deepcopy(doc["groups"][0])
        extra["condition"] = "sealed"
        extra["gameTitle"] = "Test Collector Edition"
        doc["groups"].append(extra)
        with self.assertRaises(ValueError):
            publisher.submissions(doc, "task")

    def test_no_redirect_for_credentials(self):
        self.assertIsNone(publisher.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.invalid"))

    def test_success_without_matching_receipt_is_not_a_publication(self):
        payload = publisher.submissions(self.document(), "task")[0]
        with self.assertRaises(RuntimeError):
            publisher.validate_confirmation({"ok": True}, "publish", payload)
        receipt = {"catalogId": payload["catalogId"], "batchId": payload["batchId"], "taskId": "task", "digest": "abc", "publishedAt": "now", "conditions": [{"state": "complete", "mean": 12.5, "before": 10, "after": 11.25}]}
        publisher.validate_confirmation({"ok": True, "mode": "publish", "receipt": receipt}, "publish", payload)
        receipt["conditions"][0]["after"] = 99
        with self.assertRaises(RuntimeError):
            publisher.validate_confirmation({"ok": True, "mode": "publish", "receipt": receipt}, "publish", payload)

    def test_private_file_and_fixed_origin(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credential.json"
            path.write_text(json.dumps({"baseUrl": publisher.ALLOWED_BASE_URL, "token": "x" * 64}))
            path.chmod(0o600)
            self.assertEqual(publisher.load_credentials(path)["baseUrl"], publisher.ALLOWED_BASE_URL)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                publisher.load_credentials(path)
            path.chmod(0o600)
            path.write_text(json.dumps({"baseUrl": "https://evil.invalid", "token": "x" * 64}))
            with self.assertRaises(ValueError):
                publisher.load_credentials(path)


if __name__ == "__main__":
    unittest.main()
