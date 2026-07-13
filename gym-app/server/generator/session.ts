// The Generator's planner (ADR-0007): a READ-ONLY Claude Agent SDK session that
// reads ingested source text and returns a single validated CourseSpec. It never
// writes files — the emitter (emit.ts) is the sole writer. The SDK is imported
// lazily so the rest of the server + tests run without it installed.
import { repoRoot } from "../files.ts";
import { broadcast, formatToolActivity, extractText } from "../tutor.ts";
import { CourseSpecSchema, type CourseSpec, type Mode } from "./schema.ts";
import {
  type Extracted,
  segmentMarkdown,
  normalizeSections,
  TARGET_MAX_TOKENS,
} from "./ingest.ts";

const PLANNER_TOOLS = ["Read", "Glob", "Grep", "Skill"];
const MAX_TURNS = 60;
const PLANNER_MODEL = "sonnet";

/** Default per-Module context budget (ADR-0010); the user can raise it on the proposal page. */
export const DEFAULT_BUDGET_TOKENS = TARGET_MAX_TOKENS;

export interface GenerateOptions {
  mode?: Mode; // default "author" — the existing behaviour behind the toggle
  budgetTokens?: number; // per-Module context-budget ceiling (ADR-0010)
}

export interface GenerateResult {
  ok: boolean;
  spec?: CourseSpec;
  error?: string;
}

/** Mode-specific authoring contract appended to the planner prompt. */
function modeContract(mode: Mode): string {
  if (mode === "guide") {
    return (
      `\n\nMODE: guide. The source below is pre-cut into VERBATIM sections. For each Module, set ` +
      `\`resource\` to the EXACT verbatim text of the chosen section(s) — copy it character-for-` +
      `character; never rewrite, summarise, or paraphrase. Do NOT provide a \`lesson\`. You author ` +
      `only the *assessment*: 1–3 cold \`recall\` questions (required for \`internalise\` Modules) and ` +
      `an optional \`challenge\`. Choose a \`coverage\` tag (\`internalise\` | \`reference\`) and carry ` +
      `each section's \`locator\`. Stamp \`"mode": "guide"\` on the Course.`
    );
  }
  return (
    `\n\nMODE: author. For each Module author a distilled \`lesson\` (why-first markdown, no recall ` +
    `section — the emitter appends it) and 1–3 cold \`recall\` questions. Do NOT provide a \`resource\`. ` +
    `Stamp \`"mode": "author"\` on the Course.`
  );
}

export function driver(
  label: string,
  corpus: string,
  priorError: string | null,
  mode: Mode,
  budgetTokens: number,
): string {
  const retry = priorError
    ? `\n\nYour previous attempt FAILED validation: ${priorError}\nFix exactly those problems and re-emit the complete JSON.`
    : "";
  const budget =
    `\n\nContext budget: keep each Module's loaded reading material within roughly ` +
    `${budgetTokens} tokens. Merge thin slices; flag anything much larger rather than bloating a Module.`;
  return (
    `You are the Praxis Generator. Build a Course from the source material below, ` +
    `labelled "${label}". Invoke the \`generate\` skill and follow it exactly. ` +
    `You may Read repo files (AGENTS.md, CONTEXT.md, docs/adr) for Praxis conventions, ` +
    `but do NOT attempt to write anything — a separate deterministic step writes the files.` +
    modeContract(mode) +
    budget +
    `\n\nReturn ONLY the CourseSpec as your final message: a single fenced \`\`\`json code block, ` +
    `with no prose after it.${retry}\n\n=== SOURCE MATERIAL ===\n\n${corpus}`
  );
}

/** Locator label for a section, shown to the planner (and later the proposal page). */
function locatorLabel(headingPath: string[], line: number): string {
  if (line === 0) return "preamble";
  return `${headingPath.join(" › ")} (line ${line})`;
}

/**
 * Shape the source for the planner by mode. Author mode hands over the raw file text.
 * Guide mode pre-cuts each file into normalized verbatim sections (ingest section tree)
 * and numbers them with locators + token budgets, so the planner copies exact slices
 * rather than reproducing prose from memory (keeps `resource` truly verbatim).
 */
export function corpusFor(mode: Mode, sources: Extracted[]): string {
  if (mode === "author") {
    return sources.map((s) => `### FILE: ${s.name}\n\n${s.content}`).join("\n\n---\n\n");
  }
  let n = 0;
  const blocks: string[] = [];
  for (const s of sources) {
    const sections = normalizeSections(segmentMarkdown(s.content, "read"));
    const parts = sections.map((sec) => {
      n += 1;
      const flag = sec.oversize ? " · OVERSIZE (consider splitting)" : "";
      return (
        `[section ${n}] "${sec.title}" · ${locatorLabel(sec.headingPath, sec.line)} · ` +
        `confidence ${sec.confidence} · ~${sec.tokens} tokens${flag}\n` +
        `<<<VERBATIM\n${sec.content}\n>>>VERBATIM`
      );
    });
    blocks.push(`### FILE: ${s.name}\n\n${parts.join("\n\n")}`);
  }
  return blocks.join("\n\n---\n\n");
}

/** Run the read-only planner once; return its concatenated assistant text. */
async function runPlanner(prompt: string): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const options: Record<string, unknown> = {
    cwd: repoRoot(),
    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["user", "project", "local"],
    allowedTools: PLANNER_TOOLS,
    model: PLANNER_MODEL,
    canUseTool: async (toolName: string, input: Record<string, unknown>) =>
      PLANNER_TOOLS.includes(toolName)
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: `${toolName} is not allowed for the read-only generator planner` },
    maxTurns: MAX_TURNS,
    permissionMode: "default",
  };

  let text = "";
  const runner = query({ prompt, options });
  for await (const msg of runner as AsyncIterable<Record<string, any>>) {
    if (msg.type === "assistant") {
      const t = extractText(msg.message?.content);
      if (t) text += (text ? "\n" : "") + t;
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use") {
            const line = formatToolActivity(block);
            if (line) broadcast("course_progress", { phase: "planning", activity: line });
          }
        }
      }
    } else if (msg.type === "result" && typeof msg.total_cost_usd === "number") {
      broadcast("cost_update", { totalCostUsd: msg.total_cost_usd });
    }
  }
  return text;
}

/** Pull the CourseSpec JSON out of the planner's final message (fence-preferred). */
export function extractJson(text: string): unknown | null {
  const candidates: string[] = [];
  const jsonFences = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (jsonFences.length) candidates.push(jsonFences[jsonFences.length - 1]![1]!);
  const anyFences = [...text.matchAll(/```\s*([\s\S]*?)```/g)];
  if (anyFences.length) candidates.push(anyFences[anyFences.length - 1]![1]!);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim());
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** Plan a Course from ingested sources. Validates the model output; retries once. */
export async function generateCourse(
  label: string,
  sources: Extracted[],
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const mode: Mode = opts.mode ?? "author";
  const budgetTokens = opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const usable = sources.filter((s) => s.status === "ok" && s.content.trim());
  if (usable.length === 0) return { ok: false, error: "no readable source files (need .md/.txt/.docx)" };
  const corpus = corpusFor(mode, usable);

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    broadcast("course_progress", { phase: "planning", attempt, mode });
    let raw: string;
    try {
      raw = await runPlanner(driver(label, corpus, attempt === 2 ? lastError : null, mode, budgetTokens));
    } catch (e) {
      return { ok: false, error: `planner error: ${(e as Error).message}` };
    }
    const parsed = extractJson(raw);
    if (!parsed) {
      lastError = "no JSON object found in planner output";
      broadcast("course_progress", { phase: "invalid", error: lastError });
      continue;
    }
    const result = CourseSpecSchema.safeParse(parsed);
    if (result.success) {
      broadcast("course_progress", { phase: "validated", modules: result.data.modules.length });
      return { ok: true, spec: result.data };
    }
    lastError = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    broadcast("course_progress", { phase: "invalid", error: lastError });
  }
  return { ok: false, error: `planner output failed validation: ${lastError}` };
}
