// The course-spec the Generator's planner returns and the emitter consumes (ADR-0007).
// zod is the validation boundary between the (untrusted) model output and the code
// that writes files. M1 is sandbox-free; `sandbox` widens in M2.
import { z } from "zod";

/** The four Verification archetypes (CONTEXT.md / ADR-0003). */
export const ArchetypeSchema = z.enum(["runnable", "inspectable", "attested", "explanation"]);
export type Archetype = z.infer<typeof ArchetypeSchema>;
export const ARCHETYPES = ArchetypeSchema.options;

/** kebab-case, used as the module folder suffix and the curriculum-table key. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ModuleSpecSchema = z.object({
  number: z.number().int().positive(),
  slug: z.string().regex(SLUG_RE, "slug must be kebab-case"),
  title: z.string().min(1),
  principle: z.string().min(1),
  archetype: ArchetypeSchema,
  // Full lesson.md body WITHOUT the recall section — the emitter appends
  // "## 🧠 Active recall" from `recall[]` so the format is guaranteed.
  lesson: z.string().min(1),
  // Optional graded challenge mission (challenge.md).
  challenge: z.string().min(1).optional(),
  // At least one cold-recall question (the universal Floor companion).
  recall: z.array(z.string().min(1)).min(1),
});

export const CourseSpecSchema = z.object({
  label: z.string().min(1),
  modules: z.array(ModuleSpecSchema).min(1),
  // M1: no sandbox. M2 replaces this with a bespoke sandbox object (ADR-0006).
  sandbox: z.null(),
});

export type ModuleSpec = z.infer<typeof ModuleSpecSchema>;
export type CourseSpec = z.infer<typeof CourseSpecSchema>;
