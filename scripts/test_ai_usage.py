"""Offline regression tests for the batch token ledger."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from collectors.ai_usage import record_usage, summarize_usage, usage_batch


class UsageTests(unittest.TestCase):
    def test_subprocess_and_models(self):
        with tempfile.TemporaryDirectory() as directory, usage_batch(directory) as path:
            payload = {"id": "test-response", "model": "model-a", "usage": {
                "prompt_tokens": 100, "prompt_tokens_details": {"cached_tokens": 40},
                "completion_tokens": 20, "total_tokens": 120}}
            record_usage(payload, model="fallback", operation="vision")
            subprocess.run([sys.executable, "-c",
                "from collectors.ai_usage import record_usage; "
                f"record_usage({payload!r}, model='fallback', operation='sync')"],
                env={**os.environ, "PYTHONPATH": str(Path(__file__).parent)}, check=True)
            result = summarize_usage(path)
            self.assertEqual(result["responses"], 2)
            self.assertEqual(result["inputTokens"], 200)
            self.assertEqual(result["cachedInputTokens"], 80)
            self.assertEqual(result["outputTokens"], 40)
            self.assertEqual(result["totalTokens"], 240)
            self.assertEqual(result["responsesMissingUsage"], 0)
            self.assertEqual(result["byModel"]["model-a"]["inputTokens"], 200)

    def test_unknown_not_claimed_as_measured_zero(self):
        with tempfile.TemporaryDirectory() as directory, usage_batch(directory) as path:
            record_usage({}, model="unknown", operation="vision")
            result = summarize_usage(path)
            self.assertEqual(result["responsesMissingUsage"], 1)
            self.assertEqual(result["responsesMissingCacheUsage"], 1)

    def test_interrupted_and_separate_batches(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RuntimeError):
                with usage_batch(directory) as first:
                    record_usage({}, model="a", operation="vision")
                    raise RuntimeError("interrupted")
            with usage_batch(directory) as second:
                self.assertNotEqual(first, second)
                self.assertEqual(summarize_usage(second)["responses"], 0)
            self.assertEqual(summarize_usage(first)["responses"], 1)

    def test_restores_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"PRICE_AI_USAGE_FILE": "previous"}):
                with usage_batch(directory):
                    pass
                self.assertEqual(os.environ["PRICE_AI_USAGE_FILE"], "previous")

    def test_wrappers_capture_usage_without_prompts(self):
        from collectors import catalog_ai_match, condition_vision, region_cover_vision
        for module in (catalog_ai_match, condition_vision, region_cover_vision):
            with self.subTest(module=module.__name__):
                function = next(value for name, value in vars(module).items()
                                if name.startswith("_openai") and callable(value))
                payload = {"choices": [{"message": {"content": "{}"}}],
                           "usage": {"prompt_tokens": 3, "completion_tokens": 2,
                                     "total_tokens": 5}}
                with tempfile.TemporaryDirectory() as directory, usage_batch(directory) as path:
                    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret"}), \
                         patch.object(module.urllib.request, "urlopen") as request:
                        request.return_value.__enter__.return_value.read.return_value = json.dumps(payload).encode()
                        self.assertEqual(function([]), "{}")
                    self.assertEqual(summarize_usage(path)["totalTokens"], 5)
                    self.assertNotIn("test-secret", path.read_text())
                    self.assertNotIn("choices", path.read_text())


if __name__ == "__main__":
    unittest.main()
