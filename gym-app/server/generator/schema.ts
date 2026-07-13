// The course-spec the Generator's planner returns and the emitter consumes (ADR-0007).
// zod is the validation boundary between the (untrusted) model output and the code
// that writes files. M1 is sandbox-free; `sandbox` widens in M2.
//
// Guide mode (ADR-0001/0008/0009): a Module's reading material is a *verbatim* source
// slice (`resource`), and the Generator authors only the assessment. Author mode keeps
// the existing behaviour — a model-authored `lesson`. Exactly one of the two per Module.
import { z } from "zod";

/** The four Verification archetypes (CONTEXT.md / ADR-0003). */
export const ArchetypeSchema = z.enum(["runnable", "inspectable", "attested", "explanation"]);
export type Archetype = z.infer<typeof ArchetypeSchema>;
export const ARCHETYPES = ArchetypeSchema.options;

/** Generator mode, chosen per Course (ADR-0001). */
export const ModeSchema = z.enum(["guide", "author"]);
export type Mode = z.infer<typeof ModeSchema>;

/** Coverage tags proposed per section (ADR-0011). `skip` sections produce no Module. */
export const CoverageSchema = z.enum(["internalise", "reference", "skip"]);
export type Coverage = z.infer<typeof CoverageSchema>;
/** A Module only ever carries a non-skip coverage (skip is filtered out before emit). */
export const ModuleCoverageSchema = z.enum(["internalise", "reference"]);
export type ModuleCoverage = z.infer<typeof ModuleCoverageSchema>;

/** Where a section came from in the source (ADR-0011). Heading path for md/docx; page for pdf. */
export const LocatorSchema = z.union([
  z.object({
    kind: z.literal("heading"),
    headingPath: z.array(z.string().min(1)),
    line: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal("page"), page: z.number().int().positive() }),
]);
export type Locator = z.infer<typeof LocatorSchema>;

/** kebab-case, used as the module folder suffix and the curriculum-table key. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ModuleSpecSchema = z
  .object({
    number: z.number().int().positive(),
    slug: z.string().regex(SLUG_RE, "slug must be kebab-case"),
    title: z.string().min(1),
    principle: z.string().min(1),
    archetype: ArchetypeSchema,
    // internalise = full gate; reference = readable but ungated (ADR-0011). Defaults to the
    // safe, faithful choice.
    coverage: ModuleCoverageSchema.default("internalise"),
    // Where in the source this Module's material lives (shown on the proposal page).
    locator: LocatorSchema.optional(),
    // Guide mode: the verbatim source slice, unrewritten (the Module's Resource).
    resource: z.string().min(1).optional(),
    // Author mode: the model-authored lesson.md body WITHOUT the recall section — the emitter
    // appends "## 🧠 Active recall" from `recall[]` so the format is guaranteed.
    lesson: z.string().min(1).optional(),
    // Optional graded challenge mission (challenge.md).
    challenge: z.string().min(1).optional(),
    // Cold-recall questions (the universal Floor companion). Required for internalise Modules;
    // empty is allowed for reference material, which is ungated.
    recall: z.array(z.string().min(1)),
  })
  .superRefine((m, ctx) => {
    // A Module's reading material is exactly one of resource (guide) | lesson (author).
    if (Boolean(m.resource) === Boolean(m.lesson)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a module must have exactly one of `resource` (guide) or `lesson` (author)",
        path: [m.resource ? "lesson" : "resource"],
      });
    }
    // An internalise Module must gate on at least one cold Recall.
    if (m.coverage === "internalise" && m.recall.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "an internalise module needs at least one recall question",
        path: ["recall"],
      });
    }
  });

export const CourseSpecSchema = z
  .object({
    label: z.string().min(1),
    // Chosen per Course (ADR-0001); every Module's reading material must match it.
    mode: ModeSchema,
    modules: z.array(ModuleSpecSchema).min(1),
    // M1: no sandbox. M2 replaces this with a bespoke sandbox object (ADR-0006).
    sandbox: z.null(),
  })
  .superRefine((spec, ctx) => {
    // Mode is per-Course, not per-section: guide Modules carry resources, author Modules lessons.
    spec.modules.forEach((m, i) => {
      if (spec.mode === "guide" && !m.resource) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "guide-mode course: every module must carry a verbatim `resource`",
          path: ["modules", i, "resource"],
        });
      }
      if (spec.mode === "author" && !m.lesson) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "author-mode course: every module must carry an authored `lesson`",
          path: ["modules", i, "lesson"],
        });
      }
    });
  });

export type ModuleSpec = z.infer<typeof ModuleSpecSchema>;
export type CourseSpec = z.infer<typeof CourseSpecSchema>;
