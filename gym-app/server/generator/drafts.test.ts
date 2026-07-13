import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDraft,
  getDraft,
  listDrafts,
  patchDraft,
  markEmitted,
  deleteDraft,
  type DraftInput,
} from "./drafts.ts";
import type { CourseSpec } from "./schema.ts";

let root: string | null = null;
function useTempRepo(): void {
  root = mkdtempSync(path.join(tmpdir(), "praxis-drafts-"));
  process.env.GYM_REPO_ROOT = root;
}
afterEach(() => {
  delete process.env.GYM_REPO_ROOT;
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = null;
  }
});

const guideSpec: CourseSpec = {
  label: "Guide Demo",
  mode: "guide",
  sandbox: null,
  modules: [
    {
      number: 1,
      slug: "intro",
      title: "Intro",
      principle: "the core idea",
      archetype: "explanation",
      coverage: "internalise",
      resource: "## Intro\n\nverbatim slice",
      recall: ["What is the core idea?"],
    },
  ],
};

function input(spec: CourseSpec = guideSpec): DraftInput {
  return { label: spec.label, mode: spec.mode, budgetTokens: 8000, sourceDir: "/src", spec };
}

describe("draft store — create + read", () => {
  test("createDraft persists a draft.json and returns an id + proposed status", async () => {
    useTempRepo();
    const d = await createDraft(input());
    expect(d.id).toBeTruthy();
    expect(d.status).toBe("proposed");
    expect(existsSync(path.join(root!, "courses/.drafts", d.id, "draft.json"))).toBe(true);
  });

  test("getDraft reads it back from disk (refresh-safe, no in-memory cache)", async () => {
    useTempRepo();
    const d = await createDraft(input());
    const again = await getDraft(d.id);
    expect(again).not.toBeNull();
    expect(again!.label).toBe("Guide Demo");
    expect(again!.mode).toBe("guide");
    expect(again!.spec.modules[0]!.resource).toContain("verbatim slice");
  });

  test("getDraft returns null for an unknown id", async () => {
    useTempRepo();
    expect(await getDraft("nope")).toBeNull();
  });

  test("listDrafts summarises persisted drafts", async () => {
    useTempRepo();
    const d = await createDraft(input());
    const list = await listDrafts();
    expect(list.map((s) => s.id)).toContain(d.id);
    expect(list.find((s) => s.id === d.id)!.modules).toBe(1);
  });
});

describe("draft store — patch (proposal edits)", () => {
  test("patchDraft updates the label and the edited spec", async () => {
    useTempRepo();
    const d = await createDraft(input());
    const edited: CourseSpec = {
      ...guideSpec,
      label: "Renamed",
      modules: [{ ...guideSpec.modules[0]!, coverage: "reference", recall: [] }],
    };
    const r = await patchDraft(d.id, { label: "Renamed", spec: edited });
    expect(r.ok).toBe(true);
    const reloaded = await getDraft(d.id);
    expect(reloaded!.label).toBe("Renamed");
    expect(reloaded!.spec.modules[0]!.coverage).toBe("reference");
  });

  test("patchDraft rejects a spec that fails schema validation", async () => {
    useTempRepo();
    const d = await createDraft(input());
    // A guide-mode module carrying a lesson instead of a resource is invalid.
    const broken = {
      ...guideSpec,
      modules: [{ ...guideSpec.modules[0]!, resource: undefined, lesson: "oops" }],
    } as unknown as CourseSpec;
    const r = await patchDraft(d.id, { spec: broken });
    expect(r.ok).toBe(false);
    // The persisted draft is unchanged.
    expect((await getDraft(d.id))!.spec.modules[0]!.resource).toContain("verbatim slice");
  });

  test("patchDraft on an unknown id fails", async () => {
    useTempRepo();
    const r = await patchDraft("nope", { label: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("draft store — lifecycle", () => {
  test("markEmitted records the emitted slug + status", async () => {
    useTempRepo();
    const d = await createDraft(input());
    const m = await markEmitted(d.id, "guide-demo");
    expect(m!.status).toBe("emitted");
    expect(m!.emittedSlug).toBe("guide-demo");
    expect((await getDraft(d.id))!.status).toBe("emitted");
  });

  test("deleteDraft removes it from disk", async () => {
    useTempRepo();
    const d = await createDraft(input());
    expect(await deleteDraft(d.id)).toBe(true);
    expect(await getDraft(d.id)).toBeNull();
  });
});
