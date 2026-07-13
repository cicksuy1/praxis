# Bespoke, model-decided sandbox — never templated

A sandbox is not something Praxis *has*; it is something the Generator *decides to synthesize, per
Course, for the specific Resource* — or decides to omit. A fixed `sandbox-seed/` at the engine root (or
any single-language template) is wrong: it asserts "Praxis is Python," which is the exact
engine/Course conflation the clean rewrite (ADR-0001) rejects. Not every Course needs execution, and the
ones that do need *different* toolchains.

## Decision

Whether a Course gets an executable sandbox — and of what shape — is a **model judgment made by the
Generator**, following this chain:

1. **Does the subject need hands-on execution at all**, or is it conceptual? (recursion-as-idea vs
   recursion-you-write)
2. **If it could execute, is writing small reps actually worth it to the learner** — or is the setup
   tech-debt too high / the topic too complex to sandbox meaningfully?
3. **If yes, what shape?** Real code + tests (Runnable), or a runnable *pipeline / set of commands* you
   fire and inspect (e.g. an RTSP lesson → a `gst-launch` pipeline, not unit tests)?
4. **In what toolchain?** Derived from the Resource — Rust → `cargo`, video → `gst-launch`, web → the
   app's own runner. **Never a fixed-language template**; a template would be the wrong language for most
   Resources.

The output is either `needs_sandbox: false` — the Floor falls to a softer Verification archetype
(Attested/Explanation) compensated by a harder cold Recall (ADR-0003, ADR-0005) — or a **bespoke**
sandbox synthesized for that specific toolchain, carrying its own declared Floor-check command.

## Why

Praxis is a *generic creator*. A templated sandbox contradicts genericity at the most important point —
the proof-of-work gate. Letting the model decide *if*, *what shape*, and *which toolchain* keeps the
verification honest across arbitrary subjects, while the archetype fallback (ADR-0003) means "no
sandbox" is a first-class, principled outcome rather than a failure.

## Consequences

- The Generator's per-Module output includes a Verification archetype and, when Runnable, a bespoke
  sandbox (`{ toolchain, files, floorCheckCmd, proofTarget }`) — see ADR-0007.
- The Floor verifier must be **toolchain-agnostic**: it reads the Course's declared `floorCheckCmd` from
  a per-Course manifest (`course.yml`) and runs *that*, rather than hardcoding `python -m unittest`.
- The shared `.claude/` transcript-export plumbing is archetype-agnostic and may be included in any
  synthesized sandbox regardless of language — it is not a language template.
- Any existing hand-authored sample (e.g. the recursion `sandbox-seed/`) is disposable fixture data,
  never the reference shape.
