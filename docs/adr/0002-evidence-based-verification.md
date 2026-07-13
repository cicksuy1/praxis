# Verify learning from evidence, not from a compiler

Praxis Courses cover *arbitrary* subjects, so we cannot lean on go-gym's gate — `go test` being GREEN — which only exists because Go ships a compiler and test runner. Instead we adopt ai-native-gym's **evidence-based Floor**: the Conductor confirms a Module's concrete *"done when"* was genuinely met by reading the learner's session transcript plus any artifacts they produced, then layers a lenient Scorecard and at least one cold Recall on top. Learner self-report is data, never proof — *"just mark it done"* bypasses neither the Floor nor the Recall.

## Considered Options

- **Compiler/test gate (go-gym style)** — rejected as the primary mechanism: objective and clean, but only works for domains with a runnable pass/fail signal, so it can't generalize to a dropped history PDF.
- **Evidence-based Floor (ai-native-gym style)** — chosen: generalizes to any domain because "evidence" is whatever artifact the Challenge demands, judged by the Conductor.

## Consequences

- Every generated (and hand-authored) Module must ship a concrete, evidence-checkable *"done when,"* not just reading + a quiz. This constrains what the future Generator must produce.
- Where a subject *does* have a runnable gate (e.g. a coding Course), that gate becomes the Floor's evidence — the compiler gate is a special case of the evidence gate, not a competing mechanism.
