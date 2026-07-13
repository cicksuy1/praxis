import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { emitCourse } from "./emit.ts";
import type { CourseSpec, ModuleSpec } from "./schema.ts";

// emitCourse writes under GYM_REPO_ROOT (files.ts). Each test points it at a fresh
// temp dir so nothing touches the real repo and slugs never collide.
let root: string | null = null;
function useTempRepo(): string {
  root = mkdtempSync(path.join(tmpdir(), "praxis-emit-"));
  process.env.GYM_REPO_ROOT = root;
  return root;
}
afterEach(() => {
  delete process.env.GYM_REPO_ROOT;
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = null;
  }
});

function read(rel: string): string {
  return readFileSync(path.join(root!, rel), "utf8");
}

// A verbatim source slice (guide) — unrewritten, gated on recall (internalise).
const guideModule: ModuleSpec = {
  number: 1,
  slug: "intro",
  title: "Intro",
  principle: "the core idea",
  archetype: "explanation",
  coverage: "internalise",
  resource: "## Intro\n\nThe VERBATIM source slice, unrewritten.",
  recall: ["What is the core idea?"],
};

// A model-authored lesson (author) — gated on recall (internalise).
const authorModule: ModuleSpec = {
  number: 1,
  slug: "intro",
  title: "Intro",
  principle: "the core idea",
  archetype: "explanation",
  coverage: "internalise",
  lesson: "A re-authored, distilled explanation of the idea.",
  recall: ["What is the core idea?"],
};

// Reference material — readable but ungated (no recall).
const referenceModule: ModuleSpec = {
  number: 2,
  slug: "appendix",
  title: "Appendix",
  principle: "supporting detail",
  archetype: "explanation",
  coverage: "reference",
  resource: "## Appendix\n\nLook-up material, not memorised.",
  recall: [],
};

function guideSpec(modules: ModuleSpec[]): CourseSpec {
  return { label: "Guide Demo", mode: "guide", modules, sandbox: null };
}
function authorSpec(modules: ModuleSpec[]): CourseSpec {
  return { label: "Author Demo", mode: "author", modules, sandbox: null };
}

const lessonPath = (m: ModuleSpec) => `courses/guide-demo/modules/${m.number}.${m.slug}/lesson.md`;

describe("emitCourse — reading material by mode", () => {
  test("author mode writes the authored lesson body into lesson.md", async () => {
    useTempRepo();
    const res = await emitCourse(authorSpec([authorModule]));
    expect(res.ok).toBe(true);
    const md = read(`courses/author-demo/modules/1.intro/lesson.md`);
    expect(md).toContain("A re-authored, distilled explanation");
    expect(md).toContain("## 🧠 Active recall");
    expect(md).toContain("1. What is the core idea?");
  });

  test("guide mode writes the VERBATIM resource into lesson.md (shared learning UI)", async () => {
    useTempRepo();
    const res = await emitCourse(guideSpec([guideModule]));
    expect(res.ok).toBe(true);
    // Same filename both modes — the reader (content.ts) only knows lesson.md.
    const md = read(lessonPath(guideModule));
    expect(md).toContain("The VERBATIM source slice, unrewritten.");
    // An internalise Module is still gated: the emitter appends the recall section.
    expect(md).toContain("## 🧠 Active recall");
    expect(md).toContain("1. What is the core idea?");
  });
});

describe("emitCourse — coverage governs gating", () => {
  test("a reference module is ungated: lesson.md has NO recall section", async () => {
    useTempRepo();
    const res = await emitCourse(guideSpec([guideModule, referenceModule]));
    expect(res.ok).toBe(true);
    const ref = read(lessonPath(referenceModule));
    expect(ref).toContain("Look-up material, not memorised.");
    expect(ref).not.toContain("Active recall");
  });

  test("an internalise module with no recall is rejected (defense in depth)", async () => {
    useTempRepo();
    const broken = { ...guideModule, recall: [] } as ModuleSpec;
    const res = await emitCourse(guideSpec([broken]));
    expect(res.ok).toBe(false);
    expect(res.error).toContain("recall");
  });

  test("a module with no reading material is rejected", async () => {
    useTempRepo();
    const empty = { ...guideModule, resource: undefined, lesson: undefined } as ModuleSpec;
    const res = await emitCourse(guideSpec([empty]));
    expect(res.ok).toBe(false);
  });
});

describe("emitCourse — course.yml manifest", () => {
  test("records the course mode and per-module coverage", async () => {
    useTempRepo();
    await emitCourse(guideSpec([guideModule, referenceModule]));
    const yml = read("courses/guide-demo/course.yml");
    expect(yml).toContain("mode: guide");
    expect(yml).toContain("coverage: internalise");
    expect(yml).toContain("coverage: reference");
  });
});

describe("emitCourse — challenge + result", () => {
  test("writes challenge.md when present and reports slug + module count", async () => {
    useTempRepo();
    const withChallenge = { ...authorModule, challenge: "Ship the thing." } as ModuleSpec;
    const res = await emitCourse(authorSpec([withChallenge]));
    expect(res.ok).toBe(true);
    expect(res.slug).toBe("author-demo");
    expect(res.modules).toBe(1);
    expect(existsSync(path.join(root!, "courses/author-demo/modules/1.intro/challenge.md"))).toBe(
      true,
    );
  });
});
