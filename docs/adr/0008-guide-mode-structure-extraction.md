# Guide-mode structure extraction: deterministic-first, model proposes cut points only

Guide mode's premise (ADR-0001) is that each Module's Resource is a *verbatim slice* of the
source, segmented by the source's own structure. But `ingest.ts` returns flat text today, and
real sources vary from clean markdown to a headingless PDF blob. We need one extraction pipeline
that gets structure where it exists and degrades honestly where it doesn't — without letting the
"no structure" case silently turn Guide into Author (a full rewrite).

## Decision

A four-tier pipeline, most-faithful first. Every tier yields a **section tree over the verbatim
source**; the emitter slices the original bytes at the tier's boundaries — it never rewrites.

1. **`.md` / `.markdown`** — deterministic parse of ATX/setext headings → section tree. Highest
   fidelity. One Module per section; Resource = exact slice under that heading.
2. **`.docx`** — switch mammoth from `extractRawText` to a structure-preserving conversion
   (`convertToMarkdown`/`convertToHtml`) so heading styles survive, then reuse the Tier-1 parser.
3. **PDF / headingless blob** — one **structure-only** model pass that returns section
   *boundaries* (anchor + title), never prose. The emitter still slices the verbatim source at
   those anchors. The model chooses *where* to cut, not *what it says*.
4. **No boundaries found (flat wall of prose)** — degrade to a single-Module Course whose
   Resource is the whole document, and **flag the Course as "unstructured — consider Author
   mode."** Never silently invent sections.

Each Course carries a **segmentation confidence** signal (read = Tiers 1–2, inferred = Tier 3,
none = Tier 4) so the Conductor and the user know whether structure was read or guessed.

## Why

Tier 3 is the load-bearing choice: allowing a model to propose cut points is a *much* weaker use
of the model than Author-mode rewriting, so it keeps Guide's "Resource = verbatim slice"
invariant intact even for PDFs with no heading metadata — which is most real-world PDFs, and the
default mode has to handle them. The design doc's worry that "unstructured → blurs into Author"
is bounded here: the model emits offsets, not content. Refusing Tier 3 (hard-fall to Author for
any headingless source) is philosophically cleaner but would lock most PDFs out of the *default*
mode, undercutting "Guide is the default." The confidence signal + the visible Tier-4
degradation preserve honesty: we never pretend inferred structure was read.

## Consequences

- `ingest.ts` grows from returning flat `Extracted` text to returning a **section tree**
  (verbatim slices + titles + a per-source confidence). This is the core Guide-mode change.
- The `.docx` path changes extraction call (raw text → structured), a small, contained edit.
- Tier 3 adds a second, narrowly-scoped model call inside ingest (boundaries only), distinct
  from the existing planner in `session.ts`; it must be constrained to emit offsets, not text.
- `CourseSpec`/`ModuleSpec` (schema.ts) gain a verbatim-`resource` field and the Course gains a
  segmentation-confidence field — threaded ingest → session → emit (detailed under later ADRs).
- Author mode is unaffected: it keeps the existing whole-corpus rewrite path behind the toggle.
