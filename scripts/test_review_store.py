import io
import json
import unittest
from types import SimpleNamespace

from collectors.review_store import atomic_review_write, review_lock, validate_review_document
from collectors.price_review_queue import merge_price_review_queue_documents


class MemorySftp:
    def __init__(self, files=None):
        self.files = files if files is not None else {}
        self.fail_upload = False
        self.fail_rename = False

    def stat(self, path):
        if path not in self.files:
            raise FileNotFoundError(path)
        return SimpleNamespace(st_mtime=1788120000)

    def open(self, path, mode):
        if "x" in mode and path in self.files:
            raise FileExistsError(path)
        if "w" not in mode:
            if path not in self.files:
                raise FileNotFoundError(path)
            return io.BytesIO(self.files[path])
        self.files[path] = b""
        parent = self

        class Writer(io.BytesIO):
            def write(self, data):
                if parent.fail_upload and path.endswith(".tmp"):
                    super().write(data[:4])
                    raise OSError("lost connection")
                return super().write(data)

            def close(self):
                if not self.closed:
                    parent.files[path] = self.getvalue()
                super().close()

        return Writer()

    def remove(self, path):
        if path not in self.files:
            raise FileNotFoundError(path)
        del self.files[path]

    def posix_rename(self, source, destination):
        if self.fail_rename:
            raise OSError("rename unsupported")
        self.files[destination] = self.files.pop(source)


class ReviewStoreTests(unittest.TestCase):
    def test_old_pc_snapshot_cannot_undo_pending_human_match(self):
        original = {"id": "game", "status": "pending", "listingTitle": "Game", "catalogId": "correct", "adminEditedAt": "2026-09-09"}
        old_pc = {**original, "catalogId": "old", "adminEditedAt": None, "updatedAt": "2026-09-10"}
        merged = merge_price_review_queue_documents({"items": [original], "decisions": []}, {"items": [old_pc], "decisions": []})
        self.assertEqual(merged["items"], [original])

    def test_exclusive_lock_shared_with_web_and_never_stolen(self):
        client = MemorySftp()
        with review_lock(client, "queue"):
            owner = client.files["queue.lock"]
            with self.assertRaises(FileExistsError):
                with review_lock(client, "queue"):
                    self.fail("second writer entered")
            self.assertEqual(client.files["queue.lock"], owner)
        self.assertNotIn("queue.lock", client.files)
        client.files["queue.lock"] = b'{"writer":"web","at":"2000-01-01"}'
        with self.assertRaises(FileExistsError):
            with review_lock(client, "queue"):
                self.fail()
        self.assertIn("queue.lock", client.files)

    def test_partial_upload_or_rename_failure_keeps_old_json(self):
        for flag in ("fail_upload", "fail_rename"):
            client = MemorySftp({"queue": b'{"old":true}'})
            setattr(client, flag, True)
            with self.assertRaises(OSError):
                atomic_review_write(client, "queue", {"new": True})
            self.assertEqual(client.files, {"queue": b'{"old":true}'})

    def test_invalid_queue_cannot_be_treated_as_empty(self):
        for doc in ({}, {"items": []}, {"items": [None], "decisions": []}):
            with self.assertRaises(ValueError):
                validate_review_document(doc)

    def test_large_merge_preserves_decisions_and_remote_resolutions(self):
        existing = {"items": [{"id": str(i), "listingTitle": "Game", "status": "pending"} for i in range(6500)],
                    "decisions": [{"id": str(i), "action": "reject"} for i in range(6000)]}
        existing["items"][0]["status"] = "rejected"
        incoming = {"items": [{"id": "0", "listingTitle": "Wrong overwrite", "status": "accepted"},
                              {"id": "new", "listingTitle": "New game", "status": "pending"}], "decisions": []}
        merged = merge_price_review_queue_documents(existing, incoming)
        validate_review_document(merged)
        self.assertEqual(len(merged["items"]), 6501)
        self.assertEqual(len(merged["decisions"]), 6000)
        self.assertEqual(next(item for item in merged["items"] if item["id"] == "0"), existing["items"][0])
        client = MemorySftp()
        atomic_review_write(client, "queue", merged)
        self.assertEqual(json.loads(client.files["queue"]), merged)


if __name__ == "__main__":
    unittest.main()
