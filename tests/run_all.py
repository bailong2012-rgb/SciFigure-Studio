"""Run the browser acceptance suite on Windows with Edge installed."""
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
(ROOT / "work").mkdir(exist_ok=True)
for script, extra in [
    ("library_test.py", []),
    ("project-tests.py", []),
    ("library-workflow.py", []),
    ("library-workflow.py", ["--app"]),
    ("regressions.py", []),
    ("acceptance.py", []),
]:
    print("Running", script, *extra, flush=True)
    subprocess.run([sys.executable, str(ROOT / "tests" / script), *extra], cwd=ROOT, check=True)
print("All browser tests passed.")
