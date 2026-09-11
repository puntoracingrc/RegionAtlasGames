import unittest
from collectors.ps2_documentary import catalog_documentary_prompt, references_for_code, editions


class Ps2DocumentaryTests(unittest.TestCase):
    def test_text_voice_and_market_are_separate(self):
        item = references_for_code("SCES50494")[0]
        self.assertEqual(item["record"]["market"]["code"], "ES")
        self.assertEqual(item["record"]["languages"]["text"], ["es"])
        self.assertEqual(item["record"]["languages"]["audio"], ["en"])

    def test_unknown_suffix_is_not_trimmed(self):
        self.assertEqual(references_for_code("SCES-50494-P-UNKNOWN"), [])

    def test_korea_language_disagreement_survives(self):
        item = references_for_code("SCKA-20099")[0]["record"]
        self.assertEqual(item["market"]["code"], "KR")
        self.assertTrue(item["languages"]["discrepancy"])
        self.assertTrue(any("contradicción" in f["engineRule"] for f in item["findings"]))

    def test_sku_and_accessory_roles(self):
        self.assertTrue(references_for_code("PERSONA-01"))
        self.assertTrue(references_for_code("GN-06017"))
        matches = references_for_code("SLEH-00049")
        self.assertTrue(matches)
        self.assertTrue(all(r["role"] == "accessory_code" for r in matches))

    def test_barcode_retains_edition_scope(self):
        records = references_for_code("711719468929")
        self.assertTrue(records)
        self.assertTrue(all(r["role"] == "barcode_reference" for r in records))
        self.assertTrue(any(b["scope"] == "packaging_scan" and b.get("editionLabel") == "Platinum" for r in records for b in r["record"]["barcodeReferences"]))
        self.assertEqual(references_for_code("0711719468929"), [])

    def test_pending_catalog_is_not_evidence_for_region_or_price(self):
        pending = next(k for k, v in editions().items() if v["status"] == "review")
        self.assertIn("no usar su antigua región ni su portada", catalog_documentary_prompt(pending))
        self.assertEqual(catalog_documentary_prompt("ps1-final-fantasy-x"), "")
        self.assertTrue(all(not e["physicalVariantResolved"] for e in editions().values()))


if __name__ == "__main__":
    unittest.main()
