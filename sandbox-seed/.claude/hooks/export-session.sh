#!/bin/sh
# Praxis sandbox plumbing (NOT a learner exercise): on every turn-stop, mirror this
# session's transcript to a fixed in-repo path (.claude/last-session.jsonl) so the
# Conductor's `spot`/`verify` skills can read *how you drove* without hunting through
# ~/.claude/projects. Per ADR-0005 this is COACHING EVIDENCE ONLY — it never decides a
# Module pass; the deterministic Floor checker (task verify) owns the pass/fail gate.
# The file is gitignored, so it never dirties your proof-of-work diff.
#
# The Stop-hook JSON arrives on stdin and carries "transcript_path"; copy that file verbatim.
python -c 'import json,sys,shutil,os; d=json.load(sys.stdin); tp=d.get("transcript_path"); dst=os.path.join(os.environ.get("CLAUDE_PROJECT_DIR","."),".claude","last-session.jsonl"); (tp and os.path.exists(tp) and shutil.copyfile(tp,dst))'
