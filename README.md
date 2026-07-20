# Praxis

**An AI-conducted learning system.** Drop source material into a folder and it becomes a guided
course that graduates you only when you can genuinely *do* the thing — proven from evidence, never
from self-report.

Most "learn X" tools stop at recognition: you read, you nod, you move on. Praxis gates on
**proof of work**. Every Module has an objective *"done when"* that a conductor confirms from real
evidence — tests passing, an artifact you built, a cold recall answered from memory — before you
advance.

---

## How it works

```
source material ──▶  Generator  ──▶  Course (Modules + Resources + graduation bars)
                                          │
                                          ▼
                                     Conductor  ──▶  teaches · coaches · gates on evidence
                                          │
                                          ▼
                                 you do the reps yourself
```

- **Generator** turns a dropped source folder into a **Course**: a set of **Modules**, each with a
  **Resource** (the reading) and a **graduation bar**. It runs in one of two modes:
  - **Guide mode** *(default)* — segment the source faithfully by its own structure, one Module per
    section; each Module's Resource is the actual source slice, not a rewrite. For material you must
    master in full.
  - **Author mode** — distill and re-author scattered or verbose source into a curated set of
    Modules with generated Resources.
- **Conductor** runs a Course from the ruleset in [`AGENTS.md`](AGENTS.md) — it teaches *why-first*,
  coaches with graduated hints, and **never** advances you past a Module until its bar is met.

## The graduation bar

Every Module's bar has a universal core plus one optional add-on:

| Component | What it means |
|-----------|---------------|
| **Floor** | The Module's concrete *"done when,"* confirmed from evidence — non-negotiable. No proof of work, no pass. |
| **Recall** | At least one **cold** active-recall question answered from memory. Fuzzy → re-teach, don't advance. |
| **Scorecard** *(optional)* | A per-Course rubric grading *how well* you performed — only when the subject has a real notion of "good form." |

The Floor's evidence type is set per Course by its **Verification archetype**:

| Archetype | Floor evidence | Strength |
|-----------|----------------|----------|
| **Runnable** | machine-checkable output (tests pass, command succeeds) | strongest |
| **Inspectable artifact** | a digital thing you examine (URL, screenshot, doc) + how-made transcript | medium |
| **Attested practice** | offline doing; self-reported → compensated with harder Recall | weak |
| **Explanation-only** | nothing produced; explanation + transfer questions *are* the gate | — |

> The full vocabulary (Course, Module, Drill, Challenge, Recall, Conductor, Coach, Generator, …) is
> fixed in [`CONTEXT.md`](CONTEXT.md). The Module list and bars for the active Course live in
> [`CURRICULUM.md`](CURRICULUM.md).

## Quick start

Praxis uses [Task](https://taskfile.dev) as its runner and [Bun](https://bun.sh) for the app.

```bash
task setup           # install the gym-app (web UI + server) dependencies
task setup-sandbox   # create your practice sandbox from the seed (run once)
task app             # build + serve the gym UI at http://localhost:4600
```

Working through a Runnable Course? Drive your reps RED → GREEN yourself:

```bash
task test            # run your practice reps (fails until you solve them)
```

Developing the app itself:

```bash
task dev             # server + Vite HMR in parallel
cd gym-app && bun test server/   # run the generator / server test suite
```

## Repository layout

```
AGENTS.md              # the Conductor ruleset — the authoritative "how to run Praxis"
CONTEXT.md             # fixed vocabulary (glossary)
CURRICULUM.md          # active Course's Module list + graduation bars
Taskfile.yml           # task runner entry points

courses/               # generated Courses (each: CURRICULUM.md, course.yml, modules/, progress/)
modules/               # the active Course's Module content (lesson.md, challenge.md)
resources/             # source material adopted as Module Resources
progress/              # learner state: PROGRESS / NOTES / STRATEGY (*.local.md, gitignored)
sandbox-seed/          # starting point for the learner's practice sandbox
docs/adr/              # architecture decision records (0001–0012)

gym-app/               # the web UI + server
  server/              #   Bun + Claude Agent SDK backend
    generator/         #   the Generator: schema, ingest, emit, drafts, session
  web/                 #   React 19 + Vite front end

.claude/skills/        # conductor skills: generate, coach, verify, spot, graduation, memory, praxis
```

## Learner state

The Conductor writes **exactly three** files, and nothing else — course content and your sandbox
code are yours:

- **`progress/PROGRESS.local.md`** — *where you are* (which Modules are done, when).
- **`progress/NOTES.local.md`** — *who you are* (weak spots, recall history, pace).
- **`progress/STRATEGY.local.md`** — *how to teach you* (the forward delivery plan).

These are `*.local.md` and gitignored — they belong to you, not the repo.

## Design decisions

Key architectural choices are recorded as ADRs in [`docs/adr/`](docs/adr/) — including
evidence-based verification (0002), per-Course verification archetypes (0003), the
Guide-default / Author-toggle Generator (0001), and the plan → persist → confirm → emit generation
flow (0012). See also [`docs/generator-design.md`](docs/generator-design.md).

## Stack

Bun · TypeScript · [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) ·
React 19 · Vite · Zod · Task.
