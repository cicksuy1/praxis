---
name: verify
description: Confirm a Module's Runnable Floor from the deterministic code checker's verdict, never from the model's own read of tests or the learner's self-report. For soft archetypes, defer entirely to graduation's Recall grade.
---
For a **Runnable** Module (this Course, archetype 1 per ADR-0003), run `task verify SLUG=<slug>` from the
Praxis repo root and read its printed JSON line: `{ "slug", "floor": "pass" | "fail", "evidence": "…" }`.
That `floor` verdict is **authoritative** — it comes from a deterministic checker (sandbox unit tests +
`git diff` assertions that real work was written), not from your own judgment. Map it to the Module's
"done when" in `CURRICULUM.md`.

**The model must not override a code `fail`, and must not flip a Module to ✅ against a code `fail`.**
`fail` means the Floor was not met — full stop. Do not re-run the tests yourself and decide otherwise, do
not accept the learner's word that it "should have passed," and do not substitute your own read of the
diff for a verdict you haven't actually seen printed. Re-teach and let them rep again.

Once you have the printed verdict, you may read the learner's session transcript and `git -C sandbox diff`
— but **only to narrate *how they drove*** (where they hesitated, what they tried, what to reinforce).
This is coaching evidence for `coach`/`memory`, never grading evidence: it can never promote a code `fail`
to a pass, nor stand in for a `pass` the checker didn't actually emit.

For archetypes **3 (Attested practice)** and **4 (Explanation-only)**, there is no runnable checker — don't
invoke `task verify`; there's nothing for it to check. The evidence there (a photo/self-report, or nothing
produced at all) is inherently soft, so say so plainly and defer the pass decision entirely to
`graduation`'s harder cold-Recall bar (ADR-0003 / ADR-0005) — `verify` has no Floor verdict to confirm in
these archetypes; only the Recall grade decides.

You *confirm* the Floor (or, for archetypes 3/4, confirm there is none to confirm); you do not mark the
pass — `graduation` does that.
