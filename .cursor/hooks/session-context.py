#!/usr/bin/env python3
"""sessionStart: inject project workflow context for agents."""
import json
import sys

CONTEXT = """# trending-collector — session context

Follow `AGENTS.md` and `docs/workflow.md`.

Skills (read when relevant):
- `.cursor/skills/tdd/SKILL.md` — implementation
- `.cursor/skills/adr/SKILL.md` — design decisions → `docs/adr/`
- `.cursor/skills/mece-analysis/SKILL.md` — structured comparison
- `.cursor/skills/root-cause-analysis/SKILL.md` — diagnosis
- `.cursor/skills/cognitive-design/SKILL.md` — module/seam design

Cognitive rhythm: do not mix wide research and wide implementation in the same turn cluster. Declare mode switches.

Domain: never conflate real-page scrape trending with event-recomputed alternative trending. See `trending-data-research-handoff.md`.
"""

def main() -> None:
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    json.dump({"additional_context": CONTEXT}, sys.stdout)


if __name__ == "__main__":
    main()
