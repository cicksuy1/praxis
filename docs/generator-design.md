# Generator design notes

Working notes behind [ADR-0001](adr/0001-generator-guide-default-author-toggle.md). Captured from a grilling session; the build itself happens on a worktree branch.

## Framing (settled)

- **The product is the Conductor** — the live coach that segments material into Modules, asks targeted questions per Module, and won't advance you until it clicks. The Generator only *feeds* it Modules. Intake mode is a leaf, not the moat.
- **The atom is the Module** (already in CONTEXT.md): a focused slice with its own graduation bar and its own conductor conversation. "Coarse vs fine granularity" is just how many Modules the Generator emits from one source — not a new concept.
- **Two Generator modes**: Guide (default, faithful segment, Resource = source slice) and Author (toggle, distill / re-author, Resource = derivative). See ADR-0001.

## Open questions (resolve before building)

1. **Structure extraction — load-bearing.** How does Guide get a source's section structure, especially from a PDF with no clean heading metadata? Clean markdown / headed PDF → use the doc's own TOC. Unstructured blob → fall back to model segmentation (which blurs toward Author mode). Decide the extraction pipeline and its fallback.
2. **Question / bar provenance.** Where do a Module's targeted questions and its Floor come from — baked by the Generator up front, generated live by the Conductor, or hybrid (a fixed baked Floor + live adaptive probing)? Grill recommendation: hybrid.
3. **Granularity control.** Who sets coarse vs fine — the Generator auto-decides per source, or the user picks? Uneven sections need normalisation (merge tiny, split huge).
4. **Not everything needs the same gate.** Classify sections as internalise / reference / skip so exhaustive coverage doesn't become a tedium machine — but note the tension: the model tagging "what matters" is itself a lossy judgement, cutting against Guide's source-as-truth premise. Decide who owns that call.

## Current implementation (starting point)

- `gym-app/server/generator/{ingest,session,emit}.ts` + `.claude/skills/generate/SKILL.md`.
- `ingest.ts` currently returns flat text (no structure) — Guide mode needs structure-aware extraction here.
- `emit.ts` writes the Course; the mode flag threads ingest → session → emit → the generate skill → a web toggle.
