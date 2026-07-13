import { test, expect, describe } from "bun:test";
import { driver, corpusFor, extractJson, DEFAULT_BUDGET_TOKENS } from "./session.ts";
import type { Extracted } from "./ingest.ts";

const mdFile: Extracted = {
  name: "guide.md",
  content: "# Alpha\nThe VERBATIM alpha slice.\n\n# Beta\nThe beta slice.",
  status: "ok",
};

describe("driver — mode-specific planner prompt", () => {
  test("author mode asks for an authored lesson and stamps mode:author", () => {
    const p = driver("Demo", "corpus", null, "author", DEFAULT_BUDGET_TOKENS);
    expect(p).toContain('"mode": "author"');
    expect(p.toLowerCase()).toContain("lesson");
    expect(p).toContain(String(DEFAULT_BUDGET_TOKENS));
  });

  test("guide mode demands a VERBATIM resource, forbids rewriting, stamps mode:guide", () => {
    const p = driver("Demo", "corpus", null, "guide", DEFAULT_BUDGET_TOKENS);
    expect(p).toContain('"mode": "guide"');
    expect(p.toLowerCase()).toContain("verbatim");
    expect(p.toLowerCase()).toContain("resource");
    // Assessment-only: the planner authors recall/challenge, not the teaching.
    expect(p.toLowerCase()).toContain("recall");
  });

  test("carries the per-module context budget", () => {
    const p = driver("Demo", "corpus", null, "guide", 4000);
    expect(p).toContain("4000");
  });

  test("appends the retry note when a prior error is given", () => {
    const p = driver("Demo", "corpus", "modules.0.resource: required", "guide", DEFAULT_BUDGET_TOKENS);
    expect(p).toContain("FAILED validation");
    expect(p).toContain("modules.0.resource");
  });
});

describe("corpusFor — mode shapes the source presentation", () => {
  test("author mode presents the raw file text", () => {
    const c = corpusFor("author", [mdFile]);
    expect(c).toContain("guide.md");
    expect(c).toContain("The VERBATIM alpha slice.");
  });

  test("guide mode presents pre-cut, numbered verbatim sections with locators", () => {
    const c = corpusFor("guide", [mdFile]);
    // Verbatim slice text is present for the planner to copy exactly.
    expect(c).toContain("The VERBATIM alpha slice.");
    // A locator the proposal page can show: heading title + line.
    expect(c).toContain("Alpha");
    expect(c).toMatch(/section\s*1/i);
  });
});

describe("extractJson", () => {
  test("pulls JSON from a ```json fence", () => {
    const out = extractJson('prose\n```json\n{"label":"x"}\n```\ntrailing');
    expect((out as { label: string }).label).toBe("x");
  });

  test("returns null when there is no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});
