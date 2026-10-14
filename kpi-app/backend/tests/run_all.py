"""Run every User Activity test against a live instance.

    python run_all.py            # expects the app on http://127.0.0.1:8822

Each file talks to the real endpoints; only the database and the ticket source
are stubbed, so a pass here is what the page will do. They upload their own
fixtures and do not share state.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
TESTS = [
    ("recency", "test_user_activity_recency.py",
     "window vs as-of vs lifetime"),
    ("service filter", "test_user_activity_service_filter.py",
     "reach denominators ignore the service filter"),
    ("definitions", "test_user_activity_definitions.py",
     "repeat use, top decile, censoring, adoption bar"),
    ("consistency", "test_user_activity_consistency.py",
     "one frontline rule, fixed shading"),
    ("the brief", "test_user_activity_brief.py",
     "the seven cases asked for"),
]

failed = []
for name, filename, blurb in TESTS:
    print(f"\n{'─' * 72}\n{name.upper()}  —  {blurb}\n{'─' * 72}")
    result = subprocess.run([sys.executable, str(HERE / filename)],
                            capture_output=True, text=True)
    print(result.stdout.rstrip() or result.stderr.rstrip()[-2000:])
    if result.returncode != 0:
        failed.append(name)
        print(result.stderr.rstrip()[-1500:])

print(f"\n{'═' * 72}")
if failed:
    print(f"FAILED: {', '.join(failed)}")
    sys.exit(1)
print(f"All {len(TESTS)} suites passed.")
