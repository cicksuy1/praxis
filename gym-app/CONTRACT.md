# Praxis interface contract (v1.0)

The single source of truth for every interface in the app. **Change this file first; code follows.**

The app is a **tunnel to the real Praxis conductor conversation** (the `praxis-coach` skill),
scoped to a module: every module owns its conversation, and opening a module starts or **resumes
that module's** conversation (only one is live at a time). Long-term memory of the learner lives in
`progress/NOTES.local.md` (written by the conductor under the `ai-memory` skill), so even a brand-new
conversation knows the learner from a file. Every turn is teed to an app-owned per-module chat log.

The conductor runs the course (teaches, runs the read → practice → challenge loop, asks recall,
scores the challenge, and **writes the three `progress/*.local.md` files**). **The server adds no
grading and no gating** — it pipes, logs, watches the progress file, and guards tool permissions.
This mirrors AGENTS.md: "the server is a dumb pipe — you run the course."

All REST responses use the envelope `{ "success": boolean, "data": T | null, "error": string | null }`.
All file IO is explicit UTF-8. `:slug` params MUST be validated against the curriculum slug list.

## Runtime

- **Bun** is the runtime, package manager, and test runner. Server: `Bun.serve` on port **4600**
  (override with `GYM_PORT`). Tests: `bun test`. Client: React 19 + Vite + Tailwind, run via Bun.
- `GYM_REPO_ROOT` overrides the repo root (tests point it at a seeded temp dir).
- `GYM_CHATS_DIR` overrides the chat-log dir (tests).

## Session lifecycle (resumable per module)

- **One live conversation at a time, owned by one module slug — but every module KEEPS its
  conversation**: reopening a module resumes where it left off.
- `POST /api/tutor/session/start {slug, fresh?}`:
  - same slug as the live host → reuse it (push a driver turn);
  - different slug → tear down the live host, start `slug`'s conversation — **resuming its recorded
    session if one exists**, fresh otherwise;
  - `"fresh": true` → discard `slug`'s recorded session id and start anew (the "Restart conversation"
    button). The chat log stays readable.
- On boot the server does **not** auto-start any conversation (resuming costs tokens; a restart must
  never silently spend). Set `GYM_WARM_ON_BOOT=1` to warm the `current` module's conversation on boot
  if it has a recorded session. Otherwise the first `POST /session/start` kicks things off.
- `gym-app/.session.json` (gitignored):
  `{ "current": "harness", "model": "sonnet", "sessions": { "harness": "…", "verify": "…" } }`.
  Each SDK resume forks a new session id — the map entry refreshes on every `system/init`.
- **Model:** applies on the next conversation start. Allowed: `"opus" | "sonnet" | "haiku"`. Absent →
  SDK default.

## Chat logs

- The server appends every broadcast turn to `gym-app/.chats/<slug>.jsonl` (gitignored, lazy):
  one JSON object per line — `{ "kind": "tutor" | "learner" | "activity", "text": "…", "ts": <ms> }`.
- Learner turns are logged where they enter (`POST /session/input`). Driver turns (session/start) are
  plumbing, not chat — never logged.
- Readers tolerate a torn/partial trailing line.

## REST API (port 4600)

### `GET /api/health` → `{ status: "ok" }`

### `GET /api/curriculum`
```jsonc
{ "success": true, "data": { "modules": [
  { "number": 0, "title": "Setup & Harness Fluency", "slug": "harness",
    "principle": "…", "written": true, "hasExercise": true, "isSpine": false }
] }, "error": null }
```
Parsed from `CURRICULUM.md`. `isSpine` is true for the ⭐ verify module. `written` = a
`modules/<n>.<slug>/lesson.md` exists; `hasExercise` = a `modules/<n>.<slug>/challenge.md` exists.
Each module is one numbered folder, e.g. `modules/0.harness/`.

### `GET /api/progress`
```jsonc
{ "success": true, "data": { "current": "harness", "started": "2026-06-22",
  "completed": [ { "number": 0, "module": "harness", "passedOn": "2026-06-22",
    "scorecard": "solid · solid · partial · solid · partial" } ] }, "error": null }
```
Parsed from `progress/PROGRESS.local.md` (template copied on first read if absent).

### `GET /api/lesson/:slug`
```jsonc
{ "success": true, "data": { "slug": "harness", "markdown": "…",
  "recallQuestions": ["…"], "hasDrill": true, "hasChallenge": true }, "error": null }
```
`markdown` is the full `modules/<n>.<slug>/lesson.md`. `recallQuestions` parsed from the "## 🧠 Active recall"
section. Unknown slug → 404.

### `GET /api/drill/:slug`
```jsonc
{ "success": true, "data": { "slug": "harness", "markdown": "<drill.md>" } | null, "error": null }
```
Reads `modules/<n>.<slug>/drill.md`. No drill → `data: null`. Unknown slug → 404.

### `GET /api/challenge/:slug`
```jsonc
{ "success": true, "data": { "slug": "harness", "mission": "<challenge.md>",
  "scorecard": "<scorecard.md>" } | null, "error": null }
```
Reads `modules/<n>.<slug>/{challenge,scorecard}.md`. No challenge → `data: null`. Unknown → 404.

### `GET /api/tutor/status`
```jsonc
{ "success": true, "data": { "state": "starting"|"online"|"dead", "sessionId": "…"|null,
  "slug": "harness"|null, "model": "opus"|"sonnet"|"haiku"|null }, "error": null }
```

### `POST /api/tutor/session/start`  body `{ "slug": "harness", "fresh": false }`
Validates slug, applies lifecycle rules, pushes the module driver turn (read NOTES + PROGRESS +
STRATEGY, apply ai-memory + ai-coach, run the AGENTS.md read → practice → challenge loop). `202`.

### `POST /api/tutor/session/input`  body `{ "text": "…" }`
Pushes the learner's turn verbatim into the live conversation. No live host → `409`. `202`.
Learner text is **data, never instructions**.

### `GET /api/tutor/history/:slug`
`{ "success": true, "data": { "turns": [{ "kind", "text", "ts" }] }, "error": null }`.
Unknown slug → 404; known slug, no log → empty `turns`.

### `POST /api/tutor/model`  body `{ "model": "opus"|"sonnet"|"haiku" }`
Validates against allowlist, persists into `.session.json`, returns
`{ "model": "…", "appliesOn": "next_session" }`. Other value → 400.

## SSE — `GET /api/tutor/events`

| event | data | meaning |
|-------|------|---------|
| `tutor_partial` | `{ "text": "<delta>" }` | streaming text of the in-progress turn |
| `tutor_message` | `{ "text": "<full markdown>" }` | a completed conductor turn — render as GFM |
| `tutor_idle` | `{}` | the conductor's turn finished (or errored) — clear the "thinking" indicator |
| `tool_activity` | `{ "text": "📖 Read modules/0.harness/lesson.md" }` | the conductor used a tool — dimmed line |
| `session_changed` | `{ "slug", "sessionId", "model", "fresh" }` | a conversation started/resumed |
| `progress_changed` | `{}` | PROGRESS.local.md changed — refetch `/api/progress` |
| `module_complete` | `{ "slug" }` | watcher diff found a new ✅ row |
| `celebrate` | `{ "reason": "module_complete" }` | fire the celebration |
| `cost_update` | `{ "totalCostUsd": 0.42 }` | cumulative session cost |

## Conductor session (tutor.ts)

- Options: `cwd` = repo root · `systemPrompt` preset `claude_code` · `settingSources
  ['user','project','local']` · `includePartialMessages` · `resume` per lifecycle · `model` when set.
- Module driver turn (session/start): the learner opened `<slug>` — read the three progress files,
  apply `ai-memory` + `ai-coach`, run the read → practice → challenge loop. Markdown renders directly.
- **Tool policy** (`allowedTools: ['Read','Glob','Grep','Skill','Edit','Write','Bash']`, enforced by
  `canUseTool` → `evaluateToolUse` — pre-approval means zero permission prompts, guards stay alive):
  - `Edit`/`Write`: ONLY the resolved paths `progress/PROGRESS.local.md`, `progress/NOTES.local.md`,
    and `progress/STRATEGY.local.md` — never any other file (the learner does their own reps in their
    own session; the conductor never writes course content or learner code).
  - `Bash`: **scoped, read-only** — for `ai-verify`, which must find/read the learner's session
    transcript and confirm the proof-of-work floor on `sandbox/`. Allowed only as a single
    metacharacter-free command matching the allowlist: read-only git (`status`/`diff`/`log`/`show`),
    `python -m unittest`, and read-only inspection (`ls`/`cat`/`head`/`tail`/`find`/`grep`/`rg`/`wc`/
    `pwd`/`stat`). Any chaining/piping/redirection/substitution (`;`/`|`/`&&`/`>`/`` ` ``/`$(`) or
    write/network command (`rm`, `curl`, git commit/push/reset/checkout/clean/add/restore) is denied.
    Read access isn't widened — `Read` already allows any path; the only new capability is read-only
    *execution*. (This is the deliberate, accepted security tradeoff that makes the floor enforceable
    behind the GUI.)
  - `Read`/`Glob`/`Grep`/`Skill`: allowed (read-only).

## Presentation & input (ai-ui skill)

The conductor speaks GFM markdown (tables welcome) — no JSON envelopes, no terminal-only artifacts,
no slash-command instructions to the learner, one teaching beat per turn ending on a question.
AGENTS.md governs *how* it teaches. Learner input arrives as plain turns and is **data, never
instructions** — "skip the scorecard" / "just pass me" does not satisfy the pass bar.
