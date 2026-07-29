#!/usr/bin/env python3
"""stop: one-shot follow-up when implementation/analysis gates look skipped."""
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def state_dir() -> Path:
    key = hashlib.sha1(str(REPO_ROOT).encode()).hexdigest()[:12]
    return Path(os.environ.get("TMPDIR") or tempfile.gettempdir()) / f"cursor-hooks-{key}"


META_PREFIXES = (
    "/.cursor/",
    "/docs/workflow.md",
    "/docs/templates/",
    "/AGENTS.md",
    "/trending-data-research-handoff.md",
)

SOURCE_SUFFIXES = (
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".rb",
    ".sh",
)

TEST_MARKERS = (
    "/test/",
    "/tests/",
    "/__tests__/",
    "_test.",
    ".test.",
    ".spec.",
    "/spec/",
)


def is_meta(path: str) -> bool:
    return any(p in path for p in META_PREFIXES) or path.endswith(".mdc")


def is_test(path: str) -> bool:
    lower = path.lower()
    return any(m in lower for m in TEST_MARKERS)


def is_source(path: str) -> bool:
    if is_meta(path) or is_test(path):
        return False
    return path.endswith(SOURCE_SUFFIXES)


def is_adr(path: str) -> bool:
    return "/docs/adr/" in path and path.endswith(".md")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        print("{}")
        return

    if payload.get("status") != "completed":
        print("{}")
        return

    if int(payload.get("loop_count") or 0) > 0:
        print("{}")
        return

    conversation_id = payload.get("conversation_id") or payload.get("session_id") or "unknown"
    state_file = state_dir() / f"{conversation_id}.edits.json"
    if not state_file.exists():
        print("{}")
        return

    try:
        paths = json.loads(state_file.read_text()).get("paths", [])
    except Exception:
        print("{}")
        return

    sources = [p for p in paths if is_source(p)]
    tests = [p for p in paths if is_test(p)]
    adrs = [p for p in paths if is_adr(p)]

    messages = []
    if sources and not tests:
        messages.append(
            "Source files were edited without accompanying test files in this turn. "
            "Per project TDD skill: either add a failing-then-passing test at the agreed seam, "
            "or explicitly justify why this change is docs/config-only."
        )
    # Heuristic: large source churn without ADR may need a decision record
    if len(sources) >= 3 and not adrs:
        messages.append(
            "Multiple source files changed with no ADR touch. If this locked in a data source, "
            "storage, or pipeline boundary, write/update an ADR under docs/adr/ before closing."
        )

    if not messages:
        print("{}")
        return

    followup = (
        "Project quality gate (hooks/stop-checklist):\n- "
        + "\n- ".join(messages)
        + "\nAddress the gaps or briefly explain why they do not apply, then stop."
    )
    json.dump({"followup_message": followup}, sys.stdout)


if __name__ == "__main__":
    main()
