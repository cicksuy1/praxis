# Adopt the conductor-over-markdown working method in a clean-room rewrite

The prior `anything-coach` implementation put the teaching loop inside a TypeScript Express/React app with a `strategy.json` state machine — and it executed poorly. The sibling courses it was meant to genericize (go-gym, ai-native-gym) work because they let **Claude Code itself be the Conductor**, driven by a markdown ruleset (`AGENTS.md`) over flat-markdown Modules, with learner state in a few gitignored markdown files and a `Taskfile.yml` making every action one command. We are therefore starting fresh in a new repo (`praxis`) that adopts that working method wholesale, rather than patching or salvaging the old app.

## Considered Options

- **Patch the app-as-conductor in place** — rejected: it rebuilds the exact thing that executes worse than the references.
- **Salvage the deterministic pieces, rewrite the rest** — rejected for now: only `ingest.ts` extraction is worth keeping, and only once the Generator phase arrives.
- **Clean-room rewrite adopting the working method** — chosen.

## Consequences

- **Method-first sequencing.** We hand-author one real Course (`intro-to-recursion`) into the skeleton and make the Conductor teach it well *before* building the Generator (the docs→Course automation that is the project's ultimate point). Genericizing an unproven method only produces broken Courses faster.
- The old `anything-coach` repo is left intact as a reference to crib from; nothing is destroyed.
- The Conductor writes only the learner-state files (Progress, Notes, Strategy); all course logic lives in markdown rules + skills, not application code.
