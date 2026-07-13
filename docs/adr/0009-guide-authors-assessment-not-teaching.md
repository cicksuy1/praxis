# Guide authors the assessment, not the teaching; bar provenance is hybrid

Q2 of [generator-design.md](../generator-design.md). Two coupled questions: (a) does Guide mode's
"Resource = verbatim slice" mean the Generator authors *nothing*? and (b) where do a Module's
questions and Floor come from — baked, live, or hybrid?

## Decision

**The Generator authors the assessment layer in every mode; it authors the teaching only in
Author mode.**

- **Guide mode** — the Generator does **not** create a "learning model": no re-authored lesson,
  no pedagogical restructuring. The Resource is the verbatim source slice. But a raw slice has no
  questions and no "done when," so the Generator **still authors the assessment**: cold Recall,
  the Challenge, and the Floor definition — synthesized *from* the slice.
- **Author mode** — the Generator additionally authors the teaching content (a derivative lesson),
  as it does today, plus the same assessment layer.

**Bar provenance is hybrid, and the split is forced by the vocabulary** (CONTEXT.md: the
graduation bar is "objective, non-negotiable"; the Coach adapts *how* to teach, "never changes the
graduation bar"):

- **Baked by the Generator** (stable, reproducible, part of the artifact): the Floor definition
  (archetype + concrete "done when") and a seed set of cold Recall questions.
- **Live by the Conductor**: adaptive probing and targeted follow-ups — the Coach's job, never the
  bar.

## Why

Guide's promise is faithful *reading material*, not the absence of a *test*. Conflating the two
would make Guide unable to gate at all. Keeping assessment authored-but-baked honors ADR-0005
(code owns the on-disk artifact; the model judges only where judgment is required) and keeps the
bar from drifting per session, while leaving the Conductor its entire reason to exist (live
coaching). Making assessment *live-only* would let the bar move learner-to-learner — a direct
contradiction of "objective, non-negotiable."

## Consequences

- `ModuleSpec` (schema.ts) today **requires** `lesson` (a rewrite) — pure Author-mode. It must
  change: `lesson` becomes **optional** (Author mode only) and a verbatim **`resource`** field is
  added (Guide mode). Exactly one of the two is the Module's canonical reading material.
- The emitter writes `resource` as the Module's reading material in Guide mode, `lesson` in Author
  mode; the recall/challenge/Floor path is shared.
- The `generate` skill gains a mode branch: Guide = "segment + author assessment, do NOT author the
  lesson"; Author = existing "author lesson + assessment."
- No change to the Conductor: it consumes a Module's reading material + baked bar identically, and
  does its live probing on top, regardless of which mode produced the Module.
