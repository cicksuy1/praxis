# Praxis

Praxis is an AI-conducted learning system: drop source material into a folder and it becomes a guided course that verifies you can *do* the thing, not just recognize it. This glossary fixes the vocabulary so the conductor ruleset, the skills, and the docs all mean the same thing by the same word.

## Language

### Course structure

**Course**:
One subject a learner works through, end to end. One source folder becomes one Course.
_Avoid_: Class, track, unit

**Module**:
A single teachable slice of a Course, with its own graduation bar and its own conductor conversation.
_Avoid_: Lesson (a Module *contains* a lesson), chapter, unit

**Resource**:
A Module's canonical reading material — usually the dropped source document as-is, sometimes a derivative generated from it when the raw source doesn't teach cleanly.
_Avoid_: Material, doc, content, source (the raw dropped files are "source material" until adopted as a Resource)

### The learner's journey through a Module

**Drill**:
An ungraded warm-up rep. The learner practices; the conductor coaches from evidence but never grades or blocks on it.
_Avoid_: Exercise, warm-up, practice (all overloaded)

**Challenge**:
The graded mission of a Module. Passing it is what advances the learner. Contrast with Drill.
_Avoid_: Test, assignment, task, quiz

**Recall**:
An active-recall retention check — the learner answers from memory, no re-reading. At least one *cold* Recall is required each session.
_Avoid_: Quiz, review question

### Grading a Module

**Graduation bar**:
The objective criteria a learner must meet to pass one Module. Its universal core is a Floor plus at least one cold Recall; a Scorecard is optional. The Floor's evidence type is set by the Module's Verification archetype.
_Avoid_: Pass bar, rubric, gate (reserve "pass bar" for the Course level)

**Floor**:
The objective, non-negotiable proof-of-work component of a graduation bar — the Module's concrete *"done when,"* confirmed from evidence whose form is set by the Verification archetype. No proof of work, no pass.
_Avoid_: Baseline, minimum, threshold

**Verification archetype**:
One of a small fixed set of gate patterns that decides what counts as Floor evidence for a Module, chosen per Course by a skill. The four: **Runnable** (machine-checkable output), **Inspectable artifact** (a digital thing you examine but can't auto-run), **Attested practice** (offline doing; soft evidence compensated by hard Recall), **Explanation-only** (no artifact — explanation is the gate).
_Avoid_: Gate type, evidence mode, verification method

**Scorecard**:
An *optional* per-Course rubric grading *how well* the learner performed, beyond the pass/fail Floor. Not universal — most Courses need only Floor + Recall; add a Scorecard only when the subject has a real notion of "good form."
_Avoid_: Rubric, grade sheet

**Course pass**:
The Course-level completion bar: every Module graduated, plus a final cold-Recall sweep across the whole Course.
_Avoid_: PASS bar, graduation (a Module graduates; a Course is passed)

**Spot**:
Reviewing a learner's *Drill* form from evidence (their session transcript) — reviews, coaches, but **never grades**.
_Avoid_: Grade, mark, check

**Verify**:
Confirming a *Challenge* Floor was genuinely met, from evidence (transcript plus produced artifacts) rather than the learner's self-report.
_Avoid_: Validate, grade, mark

### The conductor and learner state

**Conductor**:
The AI role that runs a Course from the ruleset — teaches, gates on evidence, tracks progress. The whole agent, not one skill.
_Avoid_: Tutor, instructor, agent, bot

**Coach**:
A facet of the Conductor: adapting *how* to teach this particular learner (pace, hint aggression, recall lead). Delivery only — never changes the graduation bar.
_Avoid_: Conductor (the Coach is one part of it), teacher

**Progress**:
The learner-state facet recording *where they are* — which Modules are done, when, and their scorecard results.
_Avoid_: Status, state

**Notes**:
The learner-state facet recording *who they are* — weak spots, recall history, pacing. The Conductor's long-term memory of the learner.
_Avoid_: Memory, profile

**Strategy**:
The learner-state facet recording *how to teach this learner* — the forward-looking delivery plan derived from Notes. Owned by the Coach.
_Avoid_: Plan, buildup strategy

### The Generator

**Generator**:
The layer that turns dropped source material into a Course — Modules, Resources, and graduation bars — automatically. Runs in one of two modes (Guide or Author), chosen per Course. Feeds the Conductor; it never coaches or gates itself.
_Avoid_: Builder, pipeline, ingester

**Guide mode**:
The default Generator mode: segment the source faithfully by its own structure, one Module per section, each Module's Resource being the actual source slice rather than a rewrite. For material you must master in full.
_Avoid_: Segment mode, faithful mode

**Author mode**:
The optional Generator mode: distill and re-author the source into a curated set of Modules whose Resources are derivatives generated from it. For scattered or verbose source you want condensed.
_Avoid_: Summarize mode, curate mode
