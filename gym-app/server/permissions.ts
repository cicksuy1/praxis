// Tool permission policy for the conductor conversation (see CONTRACT.md).
// Pure + synchronous so the test suite drives it directly without an SDK session.
// In this gym there is NO test-GREEN gate and NO solution files: the conductor
// teaches and scores the learner's *driving*; the learner runs their own reps in
// their own session. So the policy is tight: read-only tools + Skill are fine,
// Edit/Write are restricted to the three progress files, and Bash is allowed ONLY
// for the read-only verification commands verify needs (git read subcommands,
// unittest, read-only inspection) — everything else (WebFetch, writes, …) denied.
import path from "node:path";
import { resolveInRepo } from "./files.ts";

export type ToolDecision =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

const READ_ONLY = new Set(["Read", "Glob", "Grep", "Skill"]);
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

/** The only paths the conductor may write — the three private progress files. */
function writableTargets(): string[] {
  return [
    resolveInRepo("progress/PROGRESS.local.md"),
    resolveInRepo("progress/NOTES.local.md"),
    resolveInRepo("progress/STRATEGY.local.md"),
  ];
}

function samePath(a: string, b: string): boolean {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Decide whether the conductor may use a tool.
 * @param toolName the tool the conductor wants to use
 * @param input the tool's input object
 */
export function evaluateToolUse(
  toolName: string,
  input: Record<string, unknown> | null | undefined,
): ToolDecision {
  const safeInput = input ?? {};

  if (READ_ONLY.has(toolName)) {
    return { behavior: "allow", updatedInput: safeInput };
  }

  if (EDIT_TOOLS.has(toolName)) {
    return evaluateEdit(safeInput);
  }

  if (toolName === "Bash") {
    return evaluateBash(safeInput);
  }

  // WebFetch and anything else have no place in this conductor.
  return {
    behavior: "deny",
    message: `Tool ${toolName} is not allowed for the conductor; it only reads content, writes the progress files, and runs read-only verification commands.`,
  };
}

// Shell-control / chaining / redirection metacharacters. If a command contains
// ANY of these we refuse it outright — that blocks chaining a denied command
// after an allowed one (`git diff && rm x`) and command-substitution injection
// from the *untrusted* transcript the verifier reads. So no `&&`: verify's
// commands must each be a single metacharacter-free invocation.
const SHELL_METACHARACTERS = /[;|&><`\n]|\$\(|\$\{/;

// Anchored allowlist of read-only verification commands. Read access is already
// granted broadly (Read allows any path), so read-only shell inspection adds no
// new read surface; the only new capability is read-only *execution* (git read
// subcommands + unittest), which is the accepted tradeoff so verify works.
const BASH_ALLOWLIST: readonly RegExp[] = [
  // read-only git only — never commit/push/reset/checkout/clean/add/restore.
  /^git +(-C +\S+ +)?(status|diff|log|show)\b/,
  // the module check verify re-runs (incl. `discover -s sandbox -t sandbox`).
  /^python3? +-m +unittest\b/,
  // read-only inspection — no new read surface vs. the existing Read allow.
  /^(ls|cat|head|tail|find|grep|rg|wc|pwd|stat)\b/,
];

function evaluateBash(input: Record<string, unknown>): ToolDecision {
  const command = typeof input.command === "string" ? input.command : "";
  if (!command.trim()) {
    return { behavior: "deny", message: "Bash requires a non-empty command string." };
  }
  if (SHELL_METACHARACTERS.test(command)) {
    return {
      behavior: "deny",
      message:
        "the conductor's Bash is restricted to a single read-only command — no chaining, piping, redirection, or substitution",
    };
  }
  if (!BASH_ALLOWLIST.some((re) => re.test(command.trim()))) {
    return {
      behavior: "deny",
      message:
        "the conductor may only run read-only verification commands (git status/diff/log/show, python -m unittest, ls/cat/head/tail/find/grep/rg/wc/pwd/stat)",
    };
  }
  return { behavior: "allow", updatedInput: input };
}

function evaluateEdit(input: Record<string, unknown>): ToolDecision {
  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  if (!filePath) {
    return {
      behavior: "deny",
      message: "the conductor may only write PROGRESS.local.md, NOTES.local.md, or STRATEGY.local.md",
    };
  }
  const resolved = path.resolve(resolveInRepo("."), filePath);
  if (!writableTargets().some((target) => samePath(resolved, target))) {
    return {
      behavior: "deny",
      message: "the conductor may only write PROGRESS.local.md, NOTES.local.md, or STRATEGY.local.md",
    };
  }
  return { behavior: "allow", updatedInput: input };
}
