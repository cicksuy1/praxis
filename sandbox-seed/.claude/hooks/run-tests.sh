#!/bin/sh
# Optional PostToolUse helper: re-run the sandbox tests after an edit and surface the
# last few lines. Wire it into .claude/settings.json under "hooks" to make it fire.
# This is a learner convenience — the authoritative Floor gate is `task verify` (ADR-0005).
python -m unittest 2>&1 | tail -3
