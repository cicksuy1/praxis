# Generator defaults to Guide mode, with Author as a toggle

## Context

The Generator turns dropped source material into a Course. Two intake strategies are possible: **Guide** — segment the source faithfully by its own structure, one Module per section, each Module's Resource being the actual source slice — and **Author** — distill and re-author the source into a curated, summarized set of Modules. We make **Guide the default and Author an explicit per-Course toggle**, because Praxis's value is the Conductor coaching you through *the real material* until you can do it; a summarizer that silently drops sections (the Author path) is the commoditized, lossy option and is the wrong default for specs, manuals, and anything you must master in full. Author stays available for scattered or verbose source worth condensing.

## Considered options

- **Guide default, Author toggle (chosen).** Faithful coverage by default; condense only on request.
- **Author default, Guide toggle.** Keeps the existing summarize-first behaviour as default — rejected: it foregrounds the lossy mode and undersells the "master the real thing" promise that differentiates Praxis from NotebookLM-style summarizers.
- **Guide only.** Simplest, but drops the legitimate "condense a messy doc" use case.

## Consequences

- Guide mode depends on extracting the source's own section structure; the quality of Guide output tracks the structure quality of the input (clean markdown / headed PDF → good; an unstructured blob degrades toward Author-style model segmentation). This is the main open risk — see [generator-design.md](../generator-design.md).
- The Conductor is unchanged: it consumes Modules identically regardless of which mode produced them. Mode is a Generator concern only.
