import { test, expect, describe } from "bun:test";
import {
  segmentMarkdown,
  normalizeSections,
  estimateTokens,
  MIN_MERGE_WORDS,
  MAX_SPLIT_TOKENS,
  TARGET_MIN_TOKENS,
  TARGET_MAX_TOKENS,
} from "./ingest.ts";

// N words of filler, so a section's word count is exactly controllable in tests.
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("segmentMarkdown — heading tree", () => {
  test("splits into one section per heading with title + 1-based line", () => {
    const md = ["# Alpha", "a body", "", "# Beta", "b body"].join("\n");
    const secs = segmentMarkdown(md, "read");
    expect(secs).toHaveLength(2);
    expect(secs[0]!.title).toBe("Alpha");
    expect(secs[0]!.line).toBe(1);
    expect(secs[1]!.title).toBe("Beta");
    expect(secs[1]!.line).toBe(4);
  });

  test("keeps the slice verbatim, heading line included", () => {
    const md = ["# Alpha", "the VERBATIM body"].join("\n");
    const secs = segmentMarkdown(md, "read");
    expect(secs[0]!.content).toContain("# Alpha");
    expect(secs[0]!.content).toContain("the VERBATIM body");
  });

  test("nested headings build the heading path", () => {
    const md = ["# Top", "intro", "## Child", "detail"].join("\n");
    const secs = segmentMarkdown(md, "read");
    expect(secs[0]!.headingPath).toEqual(["Top"]);
    expect(secs[1]!.headingPath).toEqual(["Top", "Child"]);
  });

  test("a sibling H2 pops the previous H2 off the path", () => {
    const md = ["# Top", "## One", "x", "## Two", "y"].join("\n");
    const secs = segmentMarkdown(md, "read");
    expect(secs.find((s) => s.title === "Two")!.headingPath).toEqual(["Top", "Two"]);
  });

  test("preamble before the first heading becomes its own section (line 0, empty path)", () => {
    const md = ["some intro prose", "# Alpha", "body"].join("\n");
    const secs = segmentMarkdown(md, "read");
    expect(secs[0]!.line).toBe(0);
    expect(secs[0]!.headingPath).toEqual([]);
    expect(secs[0]!.content).toContain("some intro prose");
  });

  test("headingless text yields a single whole-doc section with 'none' confidence", () => {
    const secs = segmentMarkdown("just prose, no headings here", "read");
    expect(secs).toHaveLength(1);
    expect(secs[0]!.confidence).toBe("none");
  });

  test("carries the base confidence when structure is present", () => {
    const md = "# Alpha\nbody";
    expect(segmentMarkdown(md, "read")[0]!.confidence).toBe("read");
    expect(segmentMarkdown(md, "inferred")[0]!.confidence).toBe("inferred");
  });
});

describe("estimateTokens", () => {
  test("is monotonic and roughly words / 0.75", () => {
    expect(estimateTokens(words(75))).toBeGreaterThanOrEqual(90);
    expect(estimateTokens(words(75))).toBeLessThanOrEqual(110);
    expect(estimateTokens(words(1000))).toBeGreaterThan(estimateTokens(words(100)));
  });
});

describe("normalizeSections — merge/split constants", () => {
  test("the target band and thresholds are sane", () => {
    expect(MIN_MERGE_WORDS).toBeGreaterThan(0);
    expect(TARGET_MIN_TOKENS).toBeLessThan(TARGET_MAX_TOKENS);
    expect(MAX_SPLIT_TOKENS).toBeGreaterThanOrEqual(TARGET_MAX_TOKENS);
  });

  test("merges an undersized section into its neighbour (section count drops)", () => {
    const md = [
      "# Tiny",
      words(10),
      `# Big`,
      words(MIN_MERGE_WORDS + 200),
    ].join("\n");
    const raw = segmentMarkdown(md, "read");
    expect(raw).toHaveLength(2);
    const norm = normalizeSections(raw);
    expect(norm.length).toBeLessThan(raw.length);
    // Content of the tiny section is preserved, not dropped.
    expect(norm[0]!.content).toContain("# Tiny");
    expect(norm[0]!.content).toContain("# Big");
  });

  test("a section over MAX_SPLIT_TOKENS is flagged oversize", () => {
    const huge = `# Huge\n${words(MAX_SPLIT_TOKENS)}`; // words > MAX_SPLIT_TOKENS ⇒ tokens over
    const norm = normalizeSections(segmentMarkdown(huge, "read"));
    expect(norm[0]!.oversize).toBe(true);
  });

  test("a normal-sized section is neither merged away nor flagged", () => {
    const ok = `# Fine\n${words(700)}`;
    const norm = normalizeSections(segmentMarkdown(ok, "read"));
    expect(norm).toHaveLength(1);
    expect(norm[0]!.oversize).toBe(false);
  });
});
