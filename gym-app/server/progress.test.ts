import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readProgress } from "./progress.ts";

// Seed a temp repo with a progress/ dir and point GYM_REPO_ROOT at it.
const TEMPLATE = `# My AI-Native Gym progress

**Current module:** \`harness\` (Module 0)
**Started:** <!-- the conductor stamps this -->

## Modules

| # | Module | slug | Status | Passed on | Scorecard (P · C · D · V · R) |
|---|--------|------|--------|-----------|-------------------------------|
| 0 | Setup & Harness Fluency | \`harness\` | ⬜ | — | — |
| 1 | Context Management | \`context\` | ⬜ | — | — |
`;

const created: string[] = [];

function seedRepo(localContent?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "gym-prog-"));
  created.push(root);
  mkdirSync(path.join(root, "progress"), { recursive: true });
  writeFileSync(path.join(root, "progress", "PROGRESS.template.md"), TEMPLATE, "utf8");
  if (localContent !== undefined) {
    writeFileSync(path.join(root, "progress", "PROGRESS.local.md"), localContent, "utf8");
  }
  process.env.GYM_REPO_ROOT = root;
  return root;
}

afterEach(() => {
  delete process.env.GYM_REPO_ROOT;
  for (const dir of created.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("readProgress", () => {
  test("copies the template to local on first read", () => {
    const root = seedRepo();
    const prog = readProgress();
    expect(existsSync(path.join(root, "progress", "PROGRESS.local.md"))).toBe(true);
    expect(prog.current).toBe("harness");
    expect(prog.completed).toEqual([]);
  });

  test("leaves started empty when it is still the template placeholder", () => {
    seedRepo();
    expect(readProgress().started).toBe("");
  });

  test("parses a completed (✅) row with passedOn + scorecard", () => {
    const local = TEMPLATE.replace(
      "| 0 | Setup & Harness Fluency | `harness` | ⬜ | — | — |",
      "| 0 | Setup & Harness Fluency | `harness` | ✅ | 2026-06-22 | solid · solid · partial · solid · partial |",
    );
    seedRepo(local);
    const prog = readProgress();
    expect(prog.completed).toHaveLength(1);
    expect(prog.completed[0]).toEqual({
      number: 0,
      module: "harness",
      passedOn: "2026-06-22",
      scorecard: "solid · solid · partial · solid · partial",
    });
  });

  test("does not count un-passed (⬜) rows as completed", () => {
    seedRepo(TEMPLATE);
    expect(readProgress().completed).toEqual([]);
  });

  test("ignores an example ✅ row that lives inside an HTML comment", () => {
    const local = `${TEMPLATE}
<!-- Example the conductor writes:
| 0 | Setup & Harness Fluency | \`harness\` | ✅ | 2026-06-22 | solid · solid · partial · solid · partial |
-->
`;
    seedRepo(local);
    expect(readProgress().completed).toEqual([]);
  });

  test("reads a real started date when stamped", () => {
    const local = TEMPLATE.replace(
      "**Started:** <!-- the conductor stamps this -->",
      "**Started:** 2026-06-22",
    );
    seedRepo(local);
    expect(readProgress().started).toBe("2026-06-22");
  });
});
