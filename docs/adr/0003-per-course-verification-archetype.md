# The verification gate is chosen per Course from a fixed set of archetypes

Praxis Courses span domains whose "proof you can do it" differs in *kind* — runnable code, an inspectable deployed URL, a self-reported cake, or a purely conceptual explanation — so there is no single universal gate. The graduation bar's core stays universal (a **Floor** plus at least one cold **Recall**), but the **Floor's evidence type is selected per Course from a small fixed set of Verification archetypes** by a classifier skill (a facet of the future Generator; hand-assigned until the Generator exists).

## The archetypes

1. **Runnable** — machine-checkable output (tests pass, command succeeds, output matches). Strong Floor. *(code, data, scriptable infra)*
2. **Inspectable artifact** — a digital artifact you examine but can't auto-run (live URL, screenshot, document, diagram, config), plus the transcript of making it. Medium Floor. *(deploy-to-cloud, design, writing)*
3. **Attested practice** — offline/physical doing; learner-submitted photo/video/self-report, untrustworthy alone, so the gate compensates with structured reflection + hard Recall. Weak Floor. *(baking, fitness, crafts, soft skills)*
4. **Explanation-only** — nothing is produced; explanation + transfer questions *are* the gate. *(history, theory, concepts)*

## Consequences

- **The weaker an archetype's Floor evidence, the harder its Recall must work** — an explicit design rule, not an afterthought. Archetype 3 cannot trust the photo, so it grills the *why*.
- **Fixed-but-extensible.** The Conductor picks from known playbooks rather than improvising a bespoke gate per Course; new archetypes are added deliberately, never per-course.
- The first Course (`intro-to-recursion`) is archetype **1 (Runnable)**, hand-assigned — the classifier skill is deferred with the rest of the Generator (per ADR-0001's method-first sequencing).
