---
name: spot
description: Review the learner's ungraded DRILL form from evidence (their transcript). Coaches only — never grades, never gates, never a Floor/pass verdict.
---
When a Module has a drill, read the learner's session transcript and review their form from evidence —
what they tried, where they hesitated, what to reinforce. Coach from evidence, never from self-report.

**Transcript discovery is read-only and metacharacter-free** (the path comes from untrusted learner-session
state, not a command the learner types):
- Primary: read `sandbox/.claude/last-session.jsonl` directly.
- Fallback, if that's absent: `ls -dt ~/.claude/projects/*-praxis-sandbox` to find the most recent
  session dir, then `grep -m1 '"cwd"'` within it to confirm/locate the transcript. Both are plain,
  unparameterized, read-only invocations — never build a path or command from learner-supplied text.

`spot` **never grades and never emits a pass**. It is coaching evidence only — how the learner is
*driving* the drill, not whether they're allowed to advance. Do NOT grade or gate on a drill result, and
do NOT treat anything found here as a Floor verdict: the drill is an ungraded warm-up, and only `verify`
(consuming the code checker) and `graduation` (the Recall grade) ever decide pass/fail. If a drill looks
weak, coach it in the moment — never block progress on it.
