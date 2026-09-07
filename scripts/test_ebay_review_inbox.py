import tempfile
import unittest
from pathlib import Path

from collectors.common import load_json, save_json
from collectors.ebay_review_inbox import publish_review_inbox


class InboxTests(unittest.TestCase):
    def test_evidence_idempotency_and_preservation(self):
        row = {"source": "ebay-es", "title": "Test Game Boy", "priceEur": 10,
               "listingUrl": "https://www.ebay.es/itm/123", "imageUrls": ["https://i.ebayimg.com/test.jpg"],
               "regionReviewNeeded": True, "regionReviewReason": "sin_prueba_region",
               "searchedCatalogId": "gb-test", "searchedCatalogRegion": "PAL España"}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.json"
            ingest = {"listings": [row, row], "region": "PAL España"}
            publish_review_inbox(path, ingest, "gameboy", "batch-1")
            queue = load_json(path)
            self.assertEqual(len(queue["items"]), 1)
            item = queue["items"][0]
            self.assertEqual(item["evidence"]["url"], row["listingUrl"])
            self.assertEqual(item["evidence"]["imageUrls"], row["imageUrls"])
            self.assertEqual(item["reason"], "sin_prueba_region")
            self.assertEqual(item["jobId"], "batch-1")
            item["status"] = "rejected"
            queue["decisions"] = [{"id": item["id"], "action": "reject"}]
            save_json(path, queue)
            publish_review_inbox(path, ingest, "gameboy", "batch-2")
            self.assertEqual(load_json(path)["items"], queue["items"])
            self.assertEqual(load_json(path)["decisions"], queue["decisions"])

    def test_other_sources_and_verified_rows_not_enqueued(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.json"
            rows = [{"source": "wallapop", "title": "Test", "priceEur": 10},
                    {"source": "ebay-es", "title": "Test", "priceEur": 10,
                     "regionVerified": True, "condition": "loose"}]
            self.assertEqual(publish_review_inbox(path, {"listings": rows}, "gameboy", "b"), 0)


if __name__ == "__main__":
    unittest.main()
