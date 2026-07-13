# Verification trust hierarchy — code verifies where code can

Adopting ai-native-gym wholesale (ADR-0004) put the *model* in the trust position: it reads the
learner's session transcript and decides whether a Module passes. That reintroduces the softness the
original Praxis explicitly rejected — *"mastery is earned only via code-enforced evidence; the model
never writes unearned state."* We reinstate that principle, scoped by Verification archetype (ADR-0003).

## Decision

**Code verifies where code can; the model only where it must.**

- For the **Runnable** archetype, the Floor verdict is emitted by a **deterministic checker** (tests
  exit 0 + `git diff` assertions that real work was written) — see `generator/verify-floor.ts` /
  `task verify SLUG=<slug>`. The model *runs* the checker; it **must not override a `fail`, and must not
  flip a Module to ✅ against a code `fail`.**
- The learner's **session transcript is coaching evidence only** (how they drove) — never the pass gate.
- The model's discretion is confined to **Recall grading** and to archetypes **3 (Attested practice)**
  and **4 (Explanation-only)**, where no runnable check exists; there the evidence is inherently soft and
  the harder-Recall rule (ADR-0003) compensates.

## Why

This reconciles the two references instead of picking one: **go-gym's** code gate (objective, but only
where a compiler exists) and **ai-native-gym's** model-judged evidence (general, but soft). Code where
you can, model only where you must — so a Runnable pass is as trustworthy as a compiler, while soft
domains still get a principled gate.

## Consequences

- `graduation` and `verify` skills are written to *consume* the code verdict, never to substitute their
  own judgment for it on a Runnable Module.
- The transcript-evidence pipeline (the `Stop`-hook export) is retained but **demoted** to `spot`/how-
  they-drove coaching — its failure or absence never blocks or grants a pass.
- The future Generator must emit, for every Runnable Module, a checker-compatible `"done when"` (a
  runnable assertion), not merely prose.
