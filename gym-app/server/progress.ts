// Progress state (see CONTRACT.md). READ-ONLY from the server's side: the
// conductor conversation writes progress/PROGRESS.local.md itself (its Edit/Write
// tool is restricted to the three progress files). The server only reads it,
// copying the template on first use, and the index watcher reacts to changes.
import { existsSync, writeFileSync } from "node:fs";
import { readRepoFile, resolveInRepo } from "./files.ts";

const TEMPLATE_REL = "progress/PROGRESS.template.md";
const LOCAL_REL = "progress/PROGRESS.local.md";

export interface CompletedRow {
  number: number;
  module: string; // slug
  passedOn: string;
  scorecard: string;
}

export interface Progress {
  current: string;
  started: string;
  completed: CompletedRow[];
}

/** Ensure PROGRESS.local.md exists, copying the template if not. */
function ensureLocal(): void {
  const localAbs = resolveInRepo(LOCAL_REL);
  if (!existsSync(localAbs)) {
    writeFileSync(localAbs, readRepoFile(TEMPLATE_REL), "utf8");
  }
}

function matchOne(text: string, re: RegExp): string {
  const m = text.match(re);
  return m && m[1] ? m[1].trim() : "";
}

/**
 * Parse completed rows: module-table rows whose Status cell holds a ✅.
 * Table shape: | # | Module | `slug` | Status | Passed on | Scorecard |.
 */
function parseCompleted(text: string): CompletedRow[] {
  const rows: CompletedRow[] = [];
  const re =
    /^\|\s*(\d+)\s*\|\s*[^|]+\|\s*`([^`]+)`\s*\|\s*([^|]*✅[^|]*)\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    rows.push({
      number: Number(m[1]),
      module: m[2]!.trim(),
      passedOn: (m[4] ?? "").trim().replace(/^[—-]$/, ""),
      scorecard: (m[5] ?? "").trim().replace(/^[—-]$/, ""),
    });
  }
  return rows;
}

/** The "Started:" value is empty when it's still the template comment placeholder. */
function parseStarted(text: string): string {
  // [ \t]* (not \s*) so a now-empty value can't swallow the next line.
  const raw = matchOne(text, /\*\*Started:\*\*[ \t]*([^\n]*)/);
  if (!raw || raw.startsWith("<!--")) return "";
  // Strip a trailing inline comment if present.
  return raw.replace(/<!--.*$/, "").trim();
}

/** Strip HTML comments so example/template rows inside them aren't parsed as real. */
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/** Read and parse the learner's progress (copies the template on first read). */
export function readProgress(): Progress {
  ensureLocal();
  const text = stripComments(readRepoFile(LOCAL_REL));
  return {
    current: matchOne(text, /\*\*Current module:\*\*\s*`([^`]+)`/),
    started: parseStarted(text),
    completed: parseCompleted(text),
  };
}
