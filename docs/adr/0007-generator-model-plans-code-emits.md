# Generator = model-plans, code-emits

The Generator turns dropped source material into a Course. It could be built as an agent that writes the
Course files directly, but that would put the model in the position of both authoring *and* committing
the artifact — the softness ADR-0005 rejects — and would force widening the tool-permission policy to let
an SDK session write anywhere under the repo.

## Decision

Split the Generator into a **model planner** and a **deterministic emitter**.

- **Planner (SDK session, read-only).** A Claude Agent SDK session with **only** `Read`/`Glob`/`Grep`/
  `Skill` tools (no `Write`/`Edit`, no permission widening). It reads the ingested source text, runs the
  authoring decision chain (decompose into Modules → assign each a Verification archetype → decide/spec a
  bespoke sandbox per ADR-0006 → synthesize lesson/challenge/recall content), and **returns a single
  JSON course-spec** as its final message.
- **Emitter (deterministic code).** Validates that JSON against a `zod` schema (retry the planner once on
  invalid), then **writes the Course to disk** — `CURRICULUM.md` + `modules/<n>.<slug>/{lesson,
  challenge}.md` + `course.yml` (+ `sandbox-seed/**` when Runnable) — and validates structure (every
  Module has a lesson + ≥1 Recall; for Runnable, a RED-on-stub / GREEN-on-reference smoke check before
  the Course is offered). Code owns the artifact.

## Why

This mirrors the proven `anything-coach` `buildUnit` shape (LLM builder → `zod` validate → deterministic
save) and honors ADR-0005: **code owns the on-disk artifact and its validation; the model judges only
where judgment is required** (what to teach, how to decompose, whether/how to sandbox). Keeping the
planner read-only means no change to the tight tool-permission policy the learner-facing Conductor uses.

## Consequences

- New `server/generator/`: `ingest.ts` (deterministic extract), `schema.ts` (`zod` `CourseSpec`),
  `session.ts` (read-only SDK planner, copies the `tutor.ts` option pattern), `emit.ts` (write +
  validate). The Generator does **not** modify `tutor.ts`.
- The planner's contract is "return only the JSON spec"; the emitter is the sole writer, so a malformed
  or partial plan can never corrupt an existing Course — it fails validation and is discarded.
- After writing a new `CURRICULUM.md`/modules, the emitter must call `content.invalidate()` so the
  learner UI re-parses.
- The same read-only-planner + code-emitter split extends to M2's bespoke sandbox: the model returns
  sandbox files as string blobs inside the spec; the emitter writes them and runs the smoke check.
