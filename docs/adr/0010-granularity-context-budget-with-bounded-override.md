# Granularity is governed by a default context budget, with a bounded opt-in override

Q3 of [generator-design.md](../generator-design.md). Guide mode emits one Module per section, but
sections are uneven and "how big is a Module" is really "how much material loads into one
Conductor conversation." A web-research pass on **context rot** (Chroma's 18-model study 2025;
"lost in the middle," Liu et al. TACL 2024; NoLiMa/RULER) settled the direction: every frontier
model degrades as context grows *well below* its advertised window, and **reasoning degrades far
faster than retrieval** — which is exactly a Conductor's job (apply-in-new-words, not lookup).

## Decision

Treat granularity as a **token budget**, not an aesthetic choice.

- **Default (no user decision):** the Generator auto-normalizes each Module's loaded material to
  an evidence-safe band — **~2,000–8,000 tokens (~1,500–6,000 words)**. Merge sections under
  ~500–800 words into a neighbour; split any section past ~8K tokens (and split earlier if it
  holds multiple independently-gradable skills), preferring natural sub-boundaries so no Module's
  core content sits mid-context.
- **Opt-in override (post-generation):** the user may **raise the per-Module ceiling** to get
  fewer/larger Modules and regenerate. **Bounded by a hard cap.** Once the ceiling crosses the
  safe band, a warning is shown ("larger Modules may reduce the Conductor's reliability on
  recall/apply"). Going *finer* is always allowed, silently — finer is never unsafe.

No always-on coarse/fine dial: the happy path has zero knobs; the trade-off surfaces only when a
user consciously reaches for it.

## Why

Context-rot evidence makes fine/medium the safe default and coarse the risky one, so the default
must lean small and be governed by a budget rather than a guessed Module count. But a hard refusal
to ever go coarser removes legitimate user agency; a *bounded, warned, opt-in* override gives the
user the trade-off without letting them select into severe degradation. Fine granularity's one
real cost — carrying state across more session boundaries — is already paid by Praxis's existing
`NOTES.local.md` / progress-file design, so the trade favors small.

## Consequences

- Generation takes a **context-budget** parameter (target band + optional raised ceiling),
  threaded ingest → session → emit → the `generate` skill → the web UI, alongside the Guide/Author
  mode flag. The override control lives next to the mode toggle; default is auto/hidden.
- **Naming:** this is the "context budget" / granularity budget — deliberately **not** "floor," to
  avoid colliding with the glossary's `Floor` (the graduation-bar proof-of-work term).
- Normalization thresholds are named constants (MIN_MERGE_WORDS, MAX_SPLIT_TOKENS, TARGET band),
  not model judgement.
- The band is a defensible engineering choice, not an empirically-pinpointed optimum; revisit if
  real Courses show the Conductor struggling or Modules feeling thin.
