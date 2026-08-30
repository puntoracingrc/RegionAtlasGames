#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pc_sftp_worker
from pc_worker_update import (
    UPDATE_MODE,
    WorkerUpdateError,
    apply_update_request,
    normalize_github_origin,
    normalize_production_release,
    normalize_weekly_control,
    validate_update_request,
)


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def expect_rejected(callable_value, text: str) -> None:
    try:
        callable_value()
    except WorkerUpdateError as exc:
        assert text.lower() in str(exc).lower(), str(exc)
    else:
        raise AssertionError(f"Se esperaba rechazo con: {text}")


def commit_file(repo: Path, name: str, value: str, message: str) -> str:
    (repo / name).write_text(value, encoding="utf-8")
    git(repo, "add", name)
    git(repo, "commit", "-m", message)
    return git(repo, "rev-parse", "HEAD")


def request(target_sha: str, *, pilot: bool = True) -> dict:
    return {
        "schemaVersion": 1,
        "mode": UPDATE_MODE,
        "requestId": "worker-update-test",
        "targetSha": target_sha,
        "requestedAt": "2026-08-29T16:00:00Z",
        "repository": "puntoracingrc/RegionAtlasGames",
        "branch": "main",
        "weeklyControl": {
            "enabled": True,
            "platforms": ["ps4"],
            "pagesPerRun": 1,
            "delaySeconds": 8,
            "jitterSeconds": 3,
            "backoffHours": 24,
            "intervalDays": 7,
        } if pilot else None,
    }


def test_validation() -> None:
    assert normalize_github_origin("https://github.com/puntoracingrc/RegionAtlasGames.git") == (
        "github.com/puntoracingrc/regionatlasgames"
    )
    assert normalize_github_origin("git@github.com:puntoracingrc/RegionAtlasGames.git") == (
        "github.com/puntoracingrc/regionatlasgames"
    )
    assert normalize_github_origin("https://example.com/puntoracingrc/RegionAtlasGames") is None
    release = normalize_production_release(
        {
            "schemaVersion": 1,
            "repository": "puntoracingrc/RegionAtlasGames",
            "branch": "main",
            "commitSha": "0" * 40,
            "checkedAt": "2026-08-30T20:00:00Z",
        }
    )
    assert release["commitSha"] == "0" * 40
    expect_rejected(
        lambda: normalize_production_release(
            {
                "schemaVersion": 1,
                "repository": "attacker/other",
                "branch": "main",
                "commitSha": "0" * 40,
            }
        ),
        "repositorio oficial",
    )

    allowed = {"ps4", "ps5", "switch2"}
    normalized = normalize_weekly_control(request("0" * 40)["weeklyControl"], allowed_platforms=allowed)
    assert normalized is not None
    assert normalized["platforms"] == ["ps4"]
    expect_rejected(
        lambda: normalize_weekly_control(
            {**request("0" * 40)["weeklyControl"], "platforms": ["pc"]},
            allowed_platforms=allowed,
        ),
        "no permitidas",
    )
    expect_rejected(
        lambda: normalize_weekly_control(
            {**request("0" * 40)["weeklyControl"], "pagesPerRun": 3},
            allowed_platforms=allowed,
        ),
        "entre 1 y 2",
    )
    expect_rejected(
        lambda: normalize_weekly_control(
            {**request("0" * 40)["weeklyControl"], "delaySeconds": float("nan")},
            allowed_platforms=allowed,
        ),
        "entre 5 y 30",
    )
    expect_rejected(
        lambda: normalize_weekly_control(
            {**request("0" * 40)["weeklyControl"], "enabled": "true"},
            allowed_platforms=allowed,
        ),
        "true o false",
    )
    expect_rejected(
        lambda: validate_update_request(
            {**request("0" * 40), "repository": "attacker/other"},
            allowed_platforms=allowed,
        ),
        "repositorio",
    )
    expect_rejected(
        lambda: validate_update_request(
            {**request("0" * 40), "branch": "feature/unsafe"},
            allowed_platforms=allowed,
        ),
        "rama",
    )
    expect_rejected(
        lambda: validate_update_request(
            {**request("0" * 40), "command": "git reset --hard"},
            allowed_platforms=allowed,
        ),
        "campos de solicitud",
    )


def test_git_fast_forward() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        origin = root / "origin.git"
        author = root / "author"
        worker = root / "worker"
        control = worker / "data" / "worker-runtime" / "pc-control.json"

        origin.mkdir()
        git(origin, "init", "--bare", "--initial-branch=main")
        author.mkdir()
        git(author, "init", "--initial-branch=main")
        git(author, "config", "user.email", "test@regionatlas.games")
        git(author, "config", "user.name", "Region Atlas Tests")
        (author / ".gitignore").write_text("/data/worker-runtime/\n", encoding="utf-8")
        git(author, "add", ".gitignore")
        first_sha = commit_file(author, "worker.txt", "v1\n", "first")
        git(author, "remote", "add", "origin", str(origin))
        git(author, "push", "-u", "origin", "main")
        subprocess.run(["git", "clone", str(origin), str(worker)], check=True, capture_output=True, text=True)

        second_sha = commit_file(author, "worker.txt", "v2\n", "second")
        git(author, "push", "origin", "main")

        # La prueba usa un remoto local, pero mantiene toda la validación restante.
        import pc_worker_update

        original_expected = pc_worker_update.EXPECTED_GITHUB_REPOSITORY
        original_normalizer = pc_worker_update.normalize_github_origin
        pc_worker_update.normalize_github_origin = lambda value: (
            "local-test-origin" if Path(value).resolve() == origin.resolve() else original_normalizer(value)
        )
        pc_worker_update.EXPECTED_GITHUB_REPOSITORY = "local-test-origin"
        try:
            result = apply_update_request(
                worker,
                request(second_sha),
                control_path=control,
                allowed_platforms={"ps4", "ps5", "switch2"},
            )
            assert result["status"] == "updated"
            assert result["beforeSha"] == first_sha
            assert result["afterSha"] == second_sha
            assert result["restartRequired"] is True
            assert git(worker, "rev-parse", "HEAD") == second_sha
            stored = json.loads(control.read_text(encoding="utf-8"))
            assert stored["todoConsolasWeekly"]["platforms"] == ["ps4"]
            stored["wallapopPalCampaign"] = {
                "enabled": False,
                "platforms": ["ps4", "ps5", "ps3", "ps2", "ps1"],
                "batchSize": 20,
                "pauseMinutes": 10,
                "jitterMinutes": 3,
            }
            control.write_text(json.dumps(stored), encoding="utf-8")

            current = apply_update_request(
                worker,
                request(second_sha),
                control_path=control,
                allowed_platforms={"ps4", "ps5", "switch2"},
            )
            assert current["status"] == "already_current"
            assert current["restartRequired"] is False
            preserved = json.loads(control.read_text(encoding="utf-8"))
            assert preserved["wallapopPalCampaign"]["enabled"] is False

            (worker / "local-change.txt").write_text("do not overwrite\n", encoding="utf-8")
            expect_rejected(
                lambda: apply_update_request(
                    worker,
                    request(second_sha),
                    control_path=control,
                    allowed_platforms={"ps4"},
                ),
                "cambios locales",
            )
            (worker / "local-change.txt").unlink()

            expect_rejected(
                lambda: apply_update_request(
                    worker,
                    request(first_sha),
                    control_path=control,
                    allowed_platforms={"ps4"},
                ),
                "ya no coincide",
            )

            git(worker, "checkout", "-b", "unsafe-test")
            expect_rejected(
                lambda: apply_update_request(
                    worker,
                    request(second_sha),
                    control_path=control,
                    allowed_platforms={"ps4"},
                ),
                "debe estar en main",
            )
        finally:
            pc_worker_update.normalize_github_origin = original_normalizer
            pc_worker_update.EXPECTED_GITHUB_REPOSITORY = original_expected


def test_runtime_control_and_hard_stop() -> None:
    original_control = pc_sftp_worker.PC_RUNTIME_CONTROL
    original_hard_stop = os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            pc_sftp_worker.PC_RUNTIME_CONTROL = Path(tmp) / "pc-control.json"
            pc_sftp_worker.PC_RUNTIME_CONTROL.write_text(
                json.dumps({"todoConsolasWeekly": request("0" * 40)["weeklyControl"]}),
                encoding="utf-8",
            )
            os.environ["PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED"] = "0"
            enabled = pc_sftp_worker.effective_todoconsolas_weekly_config()
            assert enabled["enabled"] is True
            assert enabled["platforms"] == "ps4"
            assert enabled["source"] == "admin_control"

            os.environ["PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED"] = "1"
            disabled = pc_sftp_worker.effective_todoconsolas_weekly_config()
            assert disabled["enabled"] is False
            assert disabled["source"] == "local_env"
    finally:
        pc_sftp_worker.PC_RUNTIME_CONTROL = original_control
        if original_hard_stop is None:
            os.environ.pop("PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED", None)
        else:
            os.environ["PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED"] = original_hard_stop


def test_manual_update_clears_stale_health_marker() -> None:
    class FakeQueue:
        def __init__(self) -> None:
            self.files: dict[str, bytes] = {}
            self.config = SimpleNamespace(runner_id="test-worker")

        def remote(self, *parts: str) -> str:
            return "/".join(("price-worker", *parts))

        def rename(self, source: str, target: str) -> bool:
            payload = self.files.pop(source, None)
            if payload is None:
                return False
            self.files[target] = payload
            return True

        def read_json(self, path: str) -> dict:
            return json.loads(self.files[path].decode("utf-8"))

        def upload_bytes(self, path: str, payload: bytes) -> None:
            self.files[path] = payload

    original_marker = pc_sftp_worker.PC_WORKER_HEALTH_MARKER
    original_apply = pc_sftp_worker.apply_update_request
    original_supported = pc_sftp_worker._supported_todoconsolas_platforms
    try:
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "pc-worker-health.lock"
            marker.write_text("stale", encoding="utf-8")
            pc_sftp_worker.PC_WORKER_HEALTH_MARKER = marker
            pc_sftp_worker.apply_update_request = lambda *_args, **_kwargs: {
                "ok": True,
                "status": "updated",
                "beforeSha": "0" * 40,
                "afterSha": "1" * 40,
                "restartRequired": True,
            }
            pc_sftp_worker._supported_todoconsolas_platforms = lambda: {"ps4"}

            queue = FakeQueue()
            request_name = "worker-update-test.json"
            request_path = queue.remote("jobs", "worker-update-requests", request_name)
            queue.files[request_path] = b"{}\n"

            result = pc_sftp_worker.process_worker_update_request(queue, request_name)

            assert result == pc_sftp_worker.WORKER_RESTART_EXIT_CODE
            assert not marker.exists()
            assert queue.remote("jobs", "worker-update-done", request_name) in queue.files
    finally:
        pc_sftp_worker.PC_WORKER_HEALTH_MARKER = original_marker
        pc_sftp_worker.apply_update_request = original_apply
        pc_sftp_worker._supported_todoconsolas_platforms = original_supported


def test_collector_learning_sync() -> None:
    class FakeQueue:
        def __init__(self) -> None:
            self.files: dict[str, bytes] = {}
            self.config = SimpleNamespace(runner_id="test-worker")
            self.sftp = SimpleNamespace(
                stat=lambda _path: SimpleNamespace(st_mtime=1788120000),
            )

        def remote(self, *parts: str) -> str:
            return "/".join(("price-worker", *parts))

        def exists(self, path: str) -> bool:
            return path in self.files

        def download(self, remote: str, local: Path) -> None:
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(self.files[remote])

        def upload_file(self, remote: str, local: Path) -> None:
            self.files[remote] = local.read_bytes()

        def read_json(self, path: str) -> dict:
            return json.loads(self.files[path].decode("utf-8"))

    original_root = pc_sftp_worker.ROOT
    original_learning_file = pc_sftp_worker.COLLECTOR_LEARNING_FILE
    original_sync_state = pc_sftp_worker.COLLECTOR_LEARNING_SYNC_STATE
    try:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pc_sftp_worker.ROOT = root
            pc_sftp_worker.COLLECTOR_LEARNING_FILE = (
                root / "data" / "admin" / "collector-learning.json"
            )
            pc_sftp_worker.COLLECTOR_LEARNING_SYNC_STATE = (
                root / "data" / "worker-runtime" / "collector-learning-sync.json"
            )
            queue = FakeQueue()
            remote_queue = queue.remote("app", "data", "admin", "price-review-queue.json")
            queue.files[remote_queue] = json.dumps(
                {
                    "updatedAt": "2026-08-30T22:00:00Z",
                    "items": [
                        {
                            "id": "accepted-wallapop-example",
                            "status": "accepted",
                            "source": "wallapop",
                            "catalogId": "ps4-example-game",
                            "listingTitle": "Seller data must not leave the review queue",
                            "evidence": {
                                "url": "https://example.test/private-listing",
                                "searchQuery": "Example Game ps4",
                                "imageUrls": ["https://cdn.example.test/back.jpg"],
                                "regionEvidence": ["back_cover_spanish"],
                            },
                            "decision": {
                                "action": "accept",
                                "catalogId": "ps4-example-game",
                                "region": "PAL España",
                                "condition": "complete",
                                "originalContents": [],
                            },
                        }
                    ],
                },
                ensure_ascii=False,
            ).encode("utf-8")

            assert pc_sftp_worker.sync_collector_learning_snapshot(queue, force=True) is True
            remote_learning = queue.remote("app", "data", "admin", "collector-learning.json")
            snapshot = queue.read_json(remote_learning)
            assert list(snapshot["games"]) == ["ps4-example-game"]
            learned_query = snapshot["games"]["ps4-example-game"]["successfulQueries"][
                "wallapop"
            ][0]
            assert learned_query["query"] == "Example Game ps4"
            assert learned_query["acceptedCount"] == 1
            serialized = json.dumps(snapshot, ensure_ascii=False)
            assert "Seller data" not in serialized
            assert "private-listing" not in serialized
            assert pc_sftp_worker.sync_collector_learning_snapshot(queue) is False
    finally:
        pc_sftp_worker.ROOT = original_root
        pc_sftp_worker.COLLECTOR_LEARNING_FILE = original_learning_file
        pc_sftp_worker.COLLECTOR_LEARNING_SYNC_STATE = original_sync_state


def main() -> None:
    test_validation()
    test_git_fast_forward()
    test_runtime_control_and_hard_stop()
    test_manual_update_clears_stale_health_marker()
    test_collector_learning_sync()
    print("OK PC worker safe update")


if __name__ == "__main__":
    main()
