# Generator design notes

Working notes behind [ADR-0001](adr/0001-generator-guide-default-author-toggle.md). Captured from a grilling session; the build itself happens on a worktree branch.

## Framing (settled)

- **The product is the Conductor** — the live coach that segments material into Modules, asks targeted questions per Module, and won't advance you until it clicks. The Generator only *feeds* it Modules. Intake mode is a leaf, not the moat.
- **The atom is the Module** (already in CONTEXT.md): a focused slice with its own graduation bar and its own conductor conversation. "Coarse vs fine granularity" is just how many Modules the Generator emits from one source — not a new concept.
- **Two Generator modes**: Guide (default, faithful segment, Resource = source slice) and Author (toggle, distill / re-author, Resource = derivative). See ADR-0001.

## Open questions (resolve before building)

1. ~~**Structure extraction — load-bearing.**~~ **RESOLVED — see [ADR-0008](adr/0008-guide-mode-structure-extraction.md).** Four-tier pipeline, deterministic-first: markdown headings → structure-preserving `.docx` → a **structure-only** model pass that proposes verbatim-slice *boundaries* for headingless PDFs (model picks where to cut, never what it says) → flag-and-degrade to a single whole-doc Module when no structure exists. Each Course carries a segmentation-confidence signal (read / inferred / none).
2. ~~**Question / bar provenance.**~~ **RESOLVED — see [ADR-0009](adr/0009-guide-authors-assessment-not-teaching.md).** Hybrid: the Generator **bakes** the Floor + a cold-Recall seed (the non-negotiable bar); the Conductor does **live** adaptive probing on top. Key refinement: Guide mode authors the *assessment* (recall/challenge/Floor) but **not** the teaching — Resource stays the verbatim slice; only Author mode authors a lesson. Forces a schema change: `lesson` → optional, add verbatim `resource`.
3. ~~**Granularity control.**~~ **RESOLVED — see [ADR-0010](adr/0010-granularity-context-budget-with-bounded-override.md).** Granularity = a **context budget**, not an aesthetic. Default: auto-normalize each Module's loaded material to an evidence-safe band (~2K–8K tokens), grounded in a context-rot research pass (fine/medium beats coarse; reasoning rots faster than retrieval). Merge <~500–800w, split >~8K tokens. Opt-in, bounded, warned override lets the user raise the ceiling post-generation. Named "context budget," **not** "Floor" (glossary collision).
4. ~~**Not everything needs the same gate.**~~ **RESOLVED — see [ADR-0011](adr/0011-coverage-tagging-propose-and-confirm.md).** Three coverage tags (`internalise` / `reference` / `skip`). The Generator **proposes**; the user **owns any reduction below `internalise`** — coverage-reducing tags are surfaced for confirmation (with a locator: page number for PDF, heading path + line otherwise), never applied silently. `internalise` is the safe default and fallback.

## Current implementation (starting point)

- `gym-app/server/generator/{ingest,session,emit}.ts` + `.claude/skills/generate/SKILL.md`.
- `ingest.ts` currently returns flat text (no structure) — Guide mode needs structure-aware extraction here.
- `emit.ts` writes the Course; the mode flag threads ingest → session → emit → the generate skill → a web toggle.

## Build plan (all four questions resolved)

Built on worktree branch `feat/generator-guide-mode` off `dev`. Conductor untouched; Author mode =
existing behaviour behind the toggle. Flow is **plan → persisted proposal → confirm → emit**
([ADR-0012](adr/0012-generation-plan-persist-confirm-emit.md)); both modes converge on identical
markdown, so the learning UI is shared.

1. `schema.ts` — add `mode` (guide/author); `lesson` → optional + verbatim `resource` (exactly one
   per mode); `coverage` tag + section `locator`; context-budget.
2. `ingest.ts` — return a **section tree** (verbatim slice + title + locator + confidence); tiered
   extraction (md headings; `.docx` via structure-preserving mammoth); named merge/split constants.
3. `session.ts` — thread mode + budget; Guide path authors assessment-only.
4. draft store + `emit.ts` — persist proposal (refresh-safe), confirm-gated emit; `resource` vs
   `lesson` by mode; coverage-aware (`reference` ungated, `skip` no Module).
5. `generate` SKILL.md — mode branch + coverage-proposal/confirm contract.
6. Web — Create page (mode toggle + budget) → Proposal page (editable, refresh-safe) → learning UI.

**Scope:** `.md`/`.docx` first; **PDF deferred to a follow-up** (page-tracking + the ADR-0008
Tier-3 boundary pass).
