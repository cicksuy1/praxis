import { test, expect, describe } from "bun:test";
import {
  isValidModel,
  normalizeSessionRecord,
  mergeSessionRecord,
  formatToolActivity,
  extractText,
} from "./tutor.ts";

describe("isValidModel", () => {
  test("accepts the three aliases", () => {
    expect(isValidModel("opus")).toBe(true);
    expect(isValidModel("sonnet")).toBe(true);
    expect(isValidModel("haiku")).toBe(true);
  });
  test("rejects anything else", () => {
    expect(isValidModel("gpt")).toBe(false);
    expect(isValidModel(null)).toBe(false);
    expect(isValidModel(42)).toBe(false);
  });
});

describe("normalizeSessionRecord", () => {
  test("reads the current shape", () => {
    const rec = normalizeSessionRecord({
      current: "verify",
      model: "sonnet",
      sessions: { verify: "abc", harness: "def" },
    });
    expect(rec).toEqual({ current: "verify", model: "sonnet", sessions: { verify: "abc", harness: "def" } });
  });

  test("migrates a single-module {slug,session_id} shape", () => {
    const rec = normalizeSessionRecord({ slug: "harness", session_id: "xyz", model: "opus" });
    expect(rec.current).toBe("harness");
    expect(rec.sessions).toEqual({ harness: "xyz" });
    expect(rec.model).toBe("opus");
  });

  test("drops an invalid model and tolerates junk", () => {
    expect(normalizeSessionRecord({ model: "gpt" }).model).toBeNull();
    expect(normalizeSessionRecord(null)).toEqual({ current: null, model: null, sessions: {} });
    expect(normalizeSessionRecord({ sessions: { a: 5 } }).sessions).toEqual({});
  });
});

describe("mergeSessionRecord", () => {
  const base = { current: "harness", model: "sonnet" as const, sessions: { harness: "h1" } };

  test("merges new session ids, keeping others", () => {
    const next = mergeSessionRecord(base, { sessions: { verify: "v1" } });
    expect(next.sessions).toEqual({ harness: "h1", verify: "v1" });
    expect(next.current).toBe("harness");
  });

  test("forget drops one module's id", () => {
    const next = mergeSessionRecord(base, { forget: "harness" });
    expect(next.sessions).toEqual({});
  });

  test("patches current and model without touching sessions", () => {
    const next = mergeSessionRecord(base, { current: "verify", model: "opus" });
    expect(next.current).toBe("verify");
    expect(next.model).toBe("opus");
    expect(next.sessions).toEqual({ harness: "h1" });
  });
});

describe("formatToolActivity", () => {
  test("formats common tools with icons", () => {
    expect(
      formatToolActivity({ name: "Read", input: { file_path: "modules/0.harness/lesson.md" } }),
    ).toBe("📖 Read modules/0.harness/lesson.md");
    expect(formatToolActivity({ name: "Skill", input: { skill: "coach" } })).toBe("🎓 Skill coach");
    expect(formatToolActivity({ name: "Write", input: { file_path: "progress/NOTES.local.md" } })).toBe(
      "✏️ Write progress/NOTES.local.md",
    );
  });
  test("falls back for unknown tools and null names", () => {
    expect(formatToolActivity({ name: "Mystery" })).toBe("🛠️ Mystery");
    expect(formatToolActivity({})).toBeNull();
  });
});

describe("extractText", () => {
  test("joins text blocks and trims", () => {
    expect(extractText([{ type: "text", text: "Hello " }, { type: "text", text: "world" }])).toBe(
      "Hello world",
    );
  });
  test("ignores non-text blocks", () => {
    expect(extractText([{ type: "tool_use", name: "Read" }, { type: "text", text: "hi" }])).toBe("hi");
  });
  test("handles a raw string and non-array", () => {
    expect(extractText("  trimmed  ")).toBe("trimmed");
    expect(extractText(42)).toBe("");
  });
});
