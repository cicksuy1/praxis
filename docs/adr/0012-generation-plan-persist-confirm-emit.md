# Generation is a refresh-safe flow: plan → persisted proposal → confirm → emit

Follows ADR-0007 (model plans, code emits) and ADR-0011 (propose-and-confirm coverage). The
confirm step means emit is no longer automatic after planning: the user reviews the proposal —
section tree, per-section coverage tags, locators — edits it, may adjust the context budget or
regenerate, and only then commits to a Course. Planning is a model call (cost + latency), so a
page refresh must not silently re-run it or lose in-progress edits.

## Decision

Split Course creation into four stages, with a durable artifact in the middle:

1. **Plan** — ingest + the read-only planner produce a **proposal**: the section tree (verbatim
   slices + titles + locators + segmentation confidence), a proposed `coverage` tag + rationale
   per section, the chosen mode, and the context budget.
2. **Persist** — the proposal is written as a **durable draft** on disk, keyed by a draft id.
   Refresh-safe: reloading the proposal page restores the saved draft, never regenerates.
3. **Confirm** — the user reviews/edits tags on the proposal page. **Regenerate** is the only path
   that re-runs planning (explicit, never implicit).
4. **Emit** — the deterministic emitter writes the final Course from the *confirmed* draft.

**Both modes converge after emit.** Guide and Author produce the same on-disk markdown Course, so
the learning UI and the Conductor are identical regardless of mode (Guide Resource = verbatim MD
slice; Author = derivative MD lesson). All mode/coverage/budget differences live in generation and
disappear once learning begins.

## Why

Re-running the planner on every refresh wastes model cost and destroys the user's edits; a
persisted draft makes the proposal page durable and editable, and cleanly separates "propose" (a
mutable draft) from "emit" (an immutable Course). Converging both modes on markdown keeps the
Conductor untouched (ADR-0001): one learning UI, two intake modes. The cost is a new draft
lifecycle (drafts can go stale and need pruning) — accepted, because the alternative is
regenerating expensive plans and losing edits on every reload.

## Consequences

- **New draft store** (e.g. `courses/.drafts/<id>/`, gitignored): the proposal JSON + settings +
  source references. Created on generate, updated on edit/regenerate, consumed on emit; stale
  drafts pruned later.
- **`emit.ts` becomes confirm-gated** — no longer auto-fired after planning. New routes: generate
  → returns a draft id; get/patch draft; regenerate; confirm → emit.
- **Web:** Create page (mode toggle + budget) → Proposal page (editable, refresh-safe list with
  tags + locators) → learning UI (unchanged).
- Scope note: **`.md`/`.docx` land first; PDF (page-tracking + the ADR-0008 Tier-3 boundary pass)
  is a deferred follow-up.**
