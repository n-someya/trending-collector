#!/usr/bin/env python3
"""afterFileEdit: record edited paths per conversation for stop checklist."""
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def state_dir() -> Path:
    key = hashlib.sha1(str(REPO_ROOT).encode()).hexdigest()[:12]
    base = Path(os.environ.get("TMPDIR") or tempfile.gettempdir()) / f"cursor-hooks-{key}"
    base.mkdir(parents=True, exist_ok=True)
    return base


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        print("{}")
        return

    conversation_id = payload.get("conversation_id") or payload.get("session_id") or "unknown"
    file_path = payload.get("file_path") or ""
    if not file_path:
        print("{}")
        return

    try:
        state_file = state_dir() / f"{conversation_id}.edits.json"
        paths = []
        if state_file.exists():
            try:
                paths = json.loads(state_file.read_text()).get("paths", [])
            except Exception:
                paths = []
        if file_path not in paths:
            paths.append(file_path)
            state_file.write_text(json.dumps({"paths": paths}, indent=2))
    except Exception:
        pass

    print("{}")


if __name__ == "__main__":
    main()
