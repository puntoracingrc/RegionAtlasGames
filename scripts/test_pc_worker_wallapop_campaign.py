#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import posixpath
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import pc_sftp_worker  # noqa: E402
from wallapop_pal_campaign import CONTROL_MODE, effective_settings  # noqa: E402


class FakeQueue:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.config = SimpleNamespace(runner_id="test-worker")

    def remote(self, *parts: str) -> str:
        return posixpath.join("price-worker", *parts)

    def rename(self, source: str, target: str) -> bool:
        value = self.files.pop(source, None)
        if value is None:
            return False
        self.files[target] = value
        return True

    def read_json(self, path: str) -> dict:
        return json.loads(self.files[path].decode("utf-8"))

    def exists(self, path: str) -> bool:
        return path in self.files

    def upload_bytes(self, path: str, payload: bytes) -> None:
        self.files[path] = payload


def main() -> None:
    old_control = pc_sftp_worker.PC_RUNTIME_CONTROL
    old_state = pc_sftp_worker.WALLAPOP_PAL_STATE
    old_hard_stop = os.environ.get("PRICE_PC_WALLAPOP_PAL_HARD_DISABLED")
    try:
        with tempfile.TemporaryDirectory(prefix="wallapop-worker-test-") as temporary:
            temp = Path(temporary)
            pc_sftp_worker.PC_RUNTIME_CONTROL = temp / "pc-control.json"
            pc_sftp_worker.WALLAPOP_PAL_STATE = temp / "wallapop-state.json"
            queue = FakeQueue()
            request_name = "wallapop-control-test.json"
            request_path = queue.remote("jobs", "wallapop-control-requests", request_name)
            queue.files[request_path] = (
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "mode": CONTROL_MODE,
                        "requestId": "wallapop-control-test",
                        "requestedAt": "2026-08-30T12:00:00Z",
                        "action": "enable",
                        "platforms": ["ps4", "ps5", "ps3", "ps2", "ps1"],
                        "batchSize": 20,
                        "pauseMinutes": 10,
                        "jitterMinutes": 0,
                    }
                )
                + "\n"
            ).encode("utf-8")

            assert pc_sftp_worker.process_wallapop_control_request(queue, request_name) is True
            stored = json.loads(pc_sftp_worker.PC_RUNTIME_CONTROL.read_text(encoding="utf-8"))
            assert stored["wallapopPalCampaign"]["enabled"] is True
            assert stored["wallapopPalCampaign"]["batchSize"] == 20
            assert queue.remote("jobs", "wallapop-control-done", request_name) in queue.files

            settings = effective_settings(stored["wallapopPalCampaign"])
            assert pc_sftp_worker.run_wallapop_pal_campaign(queue, settings) is True
            requests = [
                path for path in queue.files
                if "/jobs/requests/wallapop-pal-" in path
            ]
            assert len(requests) == 1
            job = queue.read_json(requests[0])
            assert job["mode"] == "wallapop_batch"
            assert job["platformSlug"] == "ps4"
            assert job["region"] == "PAL España"
            assert 1 <= len(job["catalogIds"]) <= 20

            public_status = queue.read_json(queue.remote("cron", "wallapop-pal-status.json"))
            assert public_status["enabled"] is True
            assert public_status["activeBatch"]["jobId"] == job["jobId"]
            assert "processedCatalogIds" not in public_status

            disable_name = "wallapop-control-disable.json"
            disable_path = queue.remote("jobs", "wallapop-control-requests", disable_name)
            queue.files[disable_path] = (
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "mode": CONTROL_MODE,
                        "requestId": "wallapop-control-disable",
                        "requestedAt": "2026-08-30T12:01:00Z",
                        "action": "disable",
                        "platforms": ["ps4", "ps5", "ps3", "ps2", "ps1"],
                        "batchSize": 20,
                        "pauseMinutes": 10,
                        "jitterMinutes": 0,
                    }
                )
                + "\n"
            ).encode("utf-8")
            assert pc_sftp_worker.process_wallapop_control_request(queue, disable_name) is True
            cancelled_path = queue.remote("jobs", "cancelled", f"{job['jobId']}.json")
            assert cancelled_path in queue.files
            disabled_state = json.loads(pc_sftp_worker.WALLAPOP_PAL_STATE.read_text(encoding="utf-8"))
            assert disabled_state["status"] == "disabled"
            assert disabled_state["activeBatch"] is None
            stored = json.loads(pc_sftp_worker.PC_RUNTIME_CONTROL.read_text(encoding="utf-8"))
            assert stored["wallapopPalCampaign"]["enabled"] is False

            os.environ["PRICE_PC_WALLAPOP_PAL_HARD_DISABLED"] = "1"
            hard_stopped = pc_sftp_worker.effective_wallapop_pal_config()
            assert hard_stopped["enabled"] is False
            assert hard_stopped["source"] == "hard_stop"
    finally:
        pc_sftp_worker.PC_RUNTIME_CONTROL = old_control
        pc_sftp_worker.WALLAPOP_PAL_STATE = old_state
        if old_hard_stop is None:
            os.environ.pop("PRICE_PC_WALLAPOP_PAL_HARD_DISABLED", None)
        else:
            os.environ["PRICE_PC_WALLAPOP_PAL_HARD_DISABLED"] = old_hard_stop

    print("OK PC worker Wallapop campaign")


if __name__ == "__main__":
    main()
