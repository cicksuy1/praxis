import { test, expect, describe } from "bun:test";
import { CourseSpecSchema, ModuleSpecSchema } from "./schema.ts";

// A minimal valid Guide module: verbatim resource, no authored lesson, gated.
const guideModule = {
  number: 1,
  slug: "intro",
  title: "Intro",
  principle: "the core idea",
  archetype: "explanation" as const,
  coverage: "internalise" as const,
  resource: "## Intro\n\nThe verbatim source slice, unrewritten.",
  recall: ["What is the core idea?"],
};

// A minimal valid Author module: model-authored lesson, no verbatim resource.
const authorModule = {
  number: 1,
  slug: "intro",
  title: "Intro",
  principle: "the core idea",
  archetype: "explanation" as const,
  coverage: "internalise" as const,
  lesson: "A re-authored, distilled explanation of the idea.",
  recall: ["What is the core idea?"],
};

describe("ModuleSpec — reading material is exactly one of resource | lesson", () => {
  test("guide module (resource only) is valid", () => {
    expect(ModuleSpecSchema.safeParse(guideModule).success).toBe(true);
  });

  test("author module (lesson only) is valid", () => {
    expect(ModuleSpecSchema.safeParse(authorModule).success).toBe(true);
  });

  test("a module with BOTH resource and lesson is rejected", () => {
    const both = { ...guideModule, lesson: "also a lesson" };
    expect(ModuleSpecSchema.safeParse(both).success).toBe(false);
  });

  test("a module with NEITHER resource nor lesson is rejected", () => {
    const { resource, ...neither } = guideModule;
    expect(ModuleSpecSchema.safeParse(neither).success).toBe(false);
  });
});

describe("ModuleSpec — coverage governs gating", () => {
  test("coverage defaults to internalise when omitted", () => {
    const { coverage, ...noCoverage } = guideModule;
    const parsed = ModuleSpecSchema.parse(noCoverage);
    expect(parsed.coverage).toBe("internalise");
  });

  test("an internalise module with no recall is rejected", () => {
    const noRecall = { ...guideModule, recall: [] };
    expect(ModuleSpecSchema.safeParse(noRecall).success).toBe(false);
  });

  test("a reference module needs no recall (ungated)", () => {
    const ref = { ...guideModule, coverage: "reference" as const, recall: [] };
    expect(ModuleSpecSchema.safeParse(ref).success).toBe(true);
  });

  test("`skip` is not a valid module coverage (skip sections produce no Module)", () => {
    const skip = { ...guideModule, coverage: "skip" };
    expect(ModuleSpecSchema.safeParse(skip).success).toBe(false);
  });
});

describe("ModuleSpec — locator", () => {
  test("accepts a heading locator (md/docx)", () => {
    const withLoc = {
      ...guideModule,
      locator: { kind: "heading" as const, headingPath: ["Intro"], line: 1 },
    };
    expect(ModuleSpecSchema.safeParse(withLoc).success).toBe(true);
  });

  test("accepts a page locator (pdf, forward-compatible)", () => {
    const withPage = { ...guideModule, locator: { kind: "page" as const, page: 3 } };
    expect(ModuleSpecSchema.safeParse(withPage).success).toBe(true);
  });
});

describe("CourseSpec — mode + mode/content consistency", () => {
  const base = { label: "Demo", sandbox: null };

  test("a guide course whose modules carry resources is valid", () => {
    const spec = { ...base, mode: "guide" as const, modules: [guideModule] };
    expect(CourseSpecSchema.safeParse(spec).success).toBe(true);
  });

  test("an author course whose modules carry lessons is valid", () => {
    const spec = { ...base, mode: "author" as const, modules: [authorModule] };
    expect(CourseSpecSchema.safeParse(spec).success).toBe(true);
  });

  test("a guide course containing an authored-lesson module is rejected", () => {
    const spec = { ...base, mode: "guide" as const, modules: [authorModule] };
    expect(CourseSpecSchema.safeParse(spec).success).toBe(false);
  });

  test("an author course containing a verbatim-resource module is rejected", () => {
    const spec = { ...base, mode: "author" as const, modules: [guideModule] };
    expect(CourseSpecSchema.safeParse(spec).success).toBe(false);
  });

  test("mode is required", () => {
    const spec = { ...base, modules: [guideModule] };
    expect(CourseSpecSchema.safeParse(spec).success).toBe(false);
  });
});
