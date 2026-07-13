# Reuse ai-native-gym's stack and gym-app UI by forking, not rebuilding

Praxis adopts ai-native-gym's proven runtime wholesale rather than building its own: **Bun** (runtime + package manager + test runner), the **Claude Agent SDK** as a "dumb pipe" tunnel to the Conductor conversation (`systemPrompt` preset `claude_code`, resumable per-Module sessions, SSE streaming, a tool-permission guard), and its **React 19 + Vite + Tailwind** web UI. We fork `gym-app` and adapt only its content and progress parsers to Praxis's Module shape (lesson/challenge/recall + Verification archetype + Floor/Recall gate); everything else — the SSE contract, session resume, permission model, the `CONTRACT.md` interface-first discipline — carries over. This replaces the old `anything-coach` approach of spawning the `claude -p` CLI.

## Considered options

- **Build a fresh UI/runtime** — rejected: rebuilds a solved problem; the user explicitly wants the ai-native-gym experience.
- **CLI-only, no UI for v0** — rejected as the end state. We still validate the Conductor through Claude Code directly first (fast loop), but the forked UI arrives in v0 because a fork is cheap and proven.
- **Fork gym-app and adapt** — chosen.

## Consequences

- Tech lock-in to **Bun + the Claude Agent SDK** — acceptable; it matches the reference and the user's chosen stack.
- The UI stays a "dumb pipe": no grading or gating in the server. All course logic lives in `AGENTS.md` + skills, consistent with ADR-0001.
- Divergence points to adapt in the fork: the **content parser** (Module files differ), the **progress parser** (Floor + Recall, not the 5-dimension scorecard), and **archetype-aware** challenge rendering.
