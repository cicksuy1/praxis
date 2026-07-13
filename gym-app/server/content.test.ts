import { test, expect, describe, beforeEach } from "bun:test";
import {
  parseCurriculum,
  allSlugs,
  findModule,
  parseRecallQuestions,
  getLesson,
  getDrill,
  getChallenge,
  invalidate,
} from "./content.ts";

// These run against the real repo content (GYM_REPO_ROOT unset → actual root),
// which is fully populated: 11 modules, all lessons + exercises authored.

beforeEach(() => invalidate());

describe("parseCurriculum", () => {
  test("parses all 13 modules in order", () => {
    const mods = parseCurriculum();
    expect(mods).toHaveLength(13);
    expect(mods[0]!.number).toBe(0);
    expect(mods[12]!.number).toBe(12);
  });

  test("module 0 is the harness module with a clean title", () => {
    const m0 = parseCurriculum()[0]!;
    expect(m0.slug).toBe("harness");
    expect(m0.title).toBe("Getting Started & Harness Fluency");
    expect(m0.principle.length).toBeGreaterThan(10);
  });

  test("marks the verify module as the spine, others not", () => {
    const verify = findModule("verify")!;
    const harness = findModule("harness")!;
    expect(verify.isSpine).toBe(true);
    expect(harness.isSpine).toBe(false);
  });

  test("written + hasExercise are true for authored modules", () => {
    const verify = findModule("verify")!;
    expect(verify.written).toBe(true);
    expect(verify.hasExercise).toBe(true);
  });

  test("does not strip backticked slugs into the title", () => {
    // The title cell must not bleed into the slug cell.
    for (const m of parseCurriculum()) {
      expect(m.title).not.toContain("`");
      expect(m.slug).not.toContain(" ");
    }
  });
});

describe("allSlugs", () => {
  test("returns the 13 expected slugs in curriculum order", () => {
    expect(allSlugs()).toEqual([
      "harness",
      "first-drive",
      "context",
      "verify",
      "planning",
      "spec",
      "ship-feature",
      "tdd",
      "review",
      "delegate",
      "parallel",
      "extend",
      "orchestrate",
    ]);
  });
});

describe("parseRecallQuestions", () => {
  test("extracts numbered questions from the recall section", () => {
    const md = [
      "## Some intro",
      "text",
      "## 🧠 Active recall",
      "No peeking:",
      "1. First question?",
      "2. Second question",
      "   spanning two lines?",
      "3. Third?",
      "## 🔍 In the wild",
      "1. not a recall question",
    ].join("\n");
    const qs = parseRecallQuestions(md);
    expect(qs).toHaveLength(3);
    expect(qs[0]).toBe("First question?");
    expect(qs[1]).toBe("Second question spanning two lines?");
  });

  test("returns [] when there is no recall section", () => {
    expect(parseRecallQuestions("# nothing here")).toEqual([]);
  });

  test("real harness lesson has 3 recall questions", () => {
    expect(getLesson("harness").recallQuestions).toHaveLength(4);
  });
});

describe("getLesson", () => {
  test("loads markdown and exercise flags for a real module", () => {
    const lesson = getLesson("verify");
    expect(lesson.slug).toBe("verify");
    expect(lesson.markdown).toContain("Verification");
    expect(lesson.hasDrill).toBe(true);
    expect(lesson.hasChallenge).toBe(true);
  });
});

describe("getDrill / getChallenge", () => {
  test("getDrill returns the BRIEF markdown", () => {
    const drill = getDrill("planning");
    expect(drill).not.toBeNull();
    expect(drill!.markdown).toContain("Warm-up");
  });

  test("getChallenge returns mission + scorecard", () => {
    const ch = getChallenge("verify");
    expect(ch).not.toBeNull();
    expect(ch!.mission.length).toBeGreaterThan(0);
    expect(ch!.scorecard).toContain("Scorecard");
  });
});
