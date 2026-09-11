"""Replay PS1 at its frozen post-cover stage, independently of later PS2 changes.

The original verifier remains unchanged. This isolated, unregistered directory
contains only the required metadata and scripts; original images are read-only
references to the caller's files. It never resets the current checkout.
"""
import gzip
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
baseline = ROOT / "artifacts/ps2-region-migration/baseline-ps2.json.gz"
if not baseline.exists():
    subprocess.run([sys.executable, str(ROOT / "scripts/ps1-regional/verify_reproducibility.py")], cwd=ROOT, check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts/ps1-regional/build_pending_review.py"), "--check"], cwd=ROOT, check=True)
    raise SystemExit(0)
commit = json.load(gzip.open(baseline, "rt"))["commit"]
with tempfile.TemporaryDirectory(prefix="regionatlas-ps1-stage-") as temporary:
    stage = Path(temporary)
    # git show is read-only; retaining the gitdir also preserves exact old blobs.
    (stage / ".git").write_text("gitdir: " + subprocess.check_output(["git", "rev-parse", "--absolute-git-dir"], cwd=ROOT, text=True).strip() + "\n")
    (stage / "public").symlink_to(ROOT / "public", target_is_directory=True)
    archive = subprocess.Popen(["git", "archive", commit, *["data", "scripts", "artifacts/ps1-region-migration", "artifacts/ps1-pending-covers"]], cwd=ROOT, stdout=subprocess.PIPE)
    subprocess.run(["tar", "-xf", "-", "-C", str(stage)], stdin=archive.stdout, check=True)
    assert archive.wait() == 0
    subprocess.run([sys.executable, str(stage / "scripts/ps1-regional/verify_reproducibility.py")], cwd=stage, check=True)
    report = json.loads((stage / "artifacts/ps1-region-migration/reproducibility.json").read_text())
    assert report["status"] == "passed"
    # This historical report also hashes the full catalog. Replaying at its
    # frozen stage preserves that original guarantee after a PS2-only change.
    subprocess.run([sys.executable, str(stage / "scripts/ps1-regional/build_pending_review.py"), "--check"], cwd=stage, check=True)
    print(json.dumps({"status": "PASS", "historicalCommit": commit, "files": report["files"], "currentCheckoutMutated": False}))
