# Coverage tagging: model proposes, user confirms any reduction; internalise is the safe default

Q4 of [generator-design.md](../generator-design.md). Not every section deserves full
internalise-and-gate treatment (a glossary, a boilerplate appendix, a "further reading" list), but
the moment a model decides a section "doesn't matter" it makes exactly the lossy judgement Guide
mode exists to avoid. Decide who owns that call.

## Decision

Three coverage tags, deliberately asymmetric in who may apply them silently:

| Tag | Meaning | Silent by the Generator? |
| --- | --- | --- |
| `internalise` | Full treatment: Resource + Recall + Challenge/Floor | Yes — the default and the fallback whenever unsure |
| `reference` | Included as a readable Resource, but **not gated** | No — proposed, surfaced for user confirmation |
| `skip` | Excluded from the Course entirely | Never — proposed with a reason, requires explicit opt-in |

**The model proposes; the user owns any reduction below `internalise`.** Anything that reduces
coverage (`reference`, `skip`) is shown in a confirmation list, never applied silently. Each
proposed item carries a **locator** so it's identifiable: **page number** for PDFs, **heading path
+ line** for markdown/docx — plus the section title and a one-line rationale. Accept-all keeps
everything gated.

## Why

This mirrors ADR-0008's honesty rule: the model may *propose* structure and coverage, but any
*coverage-reducing* call is visible and user-owned. Merging a tiny section (ADR-0010) loses
nothing, so it's automatic; dropping or un-gating a section loses coverage, so it needs consent.
Defaulting to `internalise` makes the failure mode "too thorough," never "silently skipped the one
section you needed" — which is the only failure Guide mode cannot tolerate. Fully-automatic
tagging (frictionless) reproduces the lossy judgement Guide rejects; no-tags-at-all (everything
gated) is faithful but a tedium machine. Propose-and-confirm is the middle that keeps faithfulness
the default and makes the human the owner of every subtraction.

## Consequences

- The section tree from `ingest.ts` (ADR-0008) must carry a **locator per section** — page number
  where the source is paged (PDF), heading path + line otherwise. PDF extraction must therefore
  track page boundaries (PDF is `unsupported` today).
- `ModuleSpec` (schema.ts) gains a `coverage` tag (`internalise` | `reference` | `skip`).
  `reference` Modules emit a Resource but no Recall/Challenge; `skip` sections produce no Module.
- The `generate` skill proposes a tag + rationale per section; a confirmation step (web UI, next to
  the mode/budget controls) surfaces proposed reductions with their locators before emit.
- Course-pass and per-Module gating count only `internalise` Modules; `reference` material is
  readable context, not a gate.
