#!/usr/bin/env python3
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import local_game_runner


class Handler(BaseHTTPRequestHandler):
    completed: dict | None = None
    next_job: dict = {
        "id": "local-game-test",
        "platformSlug": "ps4",
        "offerType": "preowned",
        "limit": 2,
        "maxPages": 1,
    }

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("content-length") or "0")
        payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        if self.headers.get("authorization") != "Bearer test-token":
            self.send_response(401)
            self.end_headers()
            return
        if self.path == "/api/price-local-runner/next":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "ok": True,
                        "job": {**Handler.next_job, "runnerId": payload.get("runnerId")},
                    }
                ).encode()
            )
            return
        if self.path == "/api/price-local-runner/complete":
            Handler.completed = payload
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "job": {"id": payload.get("jobId"), "status": "done"}}).encode())
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *args):  # noqa: D401
        return


def fake_collect_game(job):
    return True, {"source": "game-es-preowned", "listings": [{"catalogId": "ps4-test", "regionReviewNeeded": True}], "stats": {"products": 1}}, "fake log", None


def fake_discover_game_releases(job):
    return True, {
        "source": "game-es-release-discovery",
        "mode": "released_catalog_candidates",
        "containsPrices": False,
        "candidates": [{"title": "Test PS5"}],
    }, "fake discovery log", None


def fake_catalog_ai_enrichment(job):
    return True, {
        "schemaVersion": 1,
        "source": "region-atlas-catalog-ai",
        "mode": "proposal-only",
        "containsWrites": False,
        "platformSlug": "ps5",
        "proposals": [{"catalogId": "ps5-test", "status": "ready", "qualityScore": 92}],
        "stats": {"ready": 1, "review": 0, "errors": 0},
    }, "fake ai log", None


def main() -> None:
    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    local_game_runner.collect_game = fake_collect_game
    local_game_runner.discover_game_releases = fake_discover_game_releases
    local_game_runner.run_catalog_ai_enrichment = fake_catalog_ai_enrichment
    try:
        did_work = local_game_runner.run_once(f"http://127.0.0.1:{server.server_port}", "test-token", "test-runner")
        assert did_work is True
        assert Handler.completed is not None
        assert Handler.completed["result"]["source"] == "game-es-preowned"

        Handler.next_job = {
            "id": "local-game-switch2-test",
            "platformSlug": "switch2",
            "offerType": "preowned",
            "limit": 2,
            "maxPages": 1,
        }
        did_switch2 = local_game_runner.run_once(
            f"http://127.0.0.1:{server.server_port}",
            "test-token",
            "test-runner",
        )
        assert did_switch2 is True
        assert Handler.completed is not None
        assert Handler.completed["result"]["source"] == "game-es-preowned"

        Handler.next_job = {
            "id": "local-game-release-test",
            "jobType": "catalog_discovery",
            "platformSlug": "ps4",
            "offerType": "new",
            "limit": 80,
            "maxPages": 4,
            "repeatStopCount": 3,
        }
        did_discovery = local_game_runner.run_once(
            f"http://127.0.0.1:{server.server_port}",
            "test-token",
            "test-runner",
        )
        assert did_discovery is True
        assert Handler.completed is not None
        assert Handler.completed["result"]["source"] == "game-es-release-discovery"

        Handler.next_job = {
            "id": "local-catalog-ai-test",
            "jobType": "catalog_enrichment",
            "platformSlug": "ps5",
            "offerType": "new",
            "limit": 5,
            "enrichmentMode": "missing",
        }
        did_ai = local_game_runner.run_once(
            f"http://127.0.0.1:{server.server_port}",
            "test-token",
            "test-runner",
        )
    finally:
        server.shutdown()
    assert did_ai is True
    assert Handler.completed is not None
    assert Handler.completed["jobId"] == "local-catalog-ai-test"
    assert Handler.completed["runnerId"] == "test-runner"
    assert Handler.completed["ok"] is True
    assert Handler.completed["result"]["source"] == "region-atlas-catalog-ai"
    print("OK local GAME runner flow")


if __name__ == "__main__":
    main()
