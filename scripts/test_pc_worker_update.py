#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import pc_sftp_worker
from pc_worker_update import (
    UPDATE_MODE,
    WorkerUpdateError,
    apply_update_request,
    normalize_github_origin,
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

            current = apply_update_request(
                worker,
                request(second_sha),
                control_path=control,
                allowed_platforms={"ps4", "ps5", "switch2"},
            )
            assert current["status"] == "already_current"
            assert current["restartRequired"] is False

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


def main() -> None:
    test_validation()
    test_git_fast_forward()
    test_runtime_control_and_hard_stop()
    print("OK PC worker safe update")


if __name__ == "__main__":
    main()
