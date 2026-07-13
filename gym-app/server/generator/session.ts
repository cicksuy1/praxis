// The Generator's planner (ADR-0007): a READ-ONLY Claude Agent SDK session that
// reads ingested source text and returns a single validated CourseSpec. It never
// writes files — the emitter (emit.ts) is the sole writer. The SDK is imported
// lazily so the rest of the server + tests run without it installed.
import { repoRoot } from "../files.ts";
import { broadcast, formatToolActivity, extractText } from "../tutor.ts";
import { CourseSpecSchema, type CourseSpec } from "./schema.ts";
import type { Extracted } from "./ingest.ts";

const PLANNER_TOOLS = ["Read", "Glob", "Grep", "Skill"];
const MAX_TURNS = 60;
const PLANNER_MODEL = "sonnet";

export interface GenerateResult {
  ok: boolean;
  spec?: CourseSpec;
  error?: string;
}

function driver(label: string, corpus: string, priorError: string | null): string {
  const retry = priorError
    ? `\n\nYour previous attempt FAILED validation: ${priorError}\nFix exactly those problems and re-emit the complete JSON.`
    : "";
  return (
    `You are the Praxis Generator. Build a Course from the source material below, ` +
    `labelled "${label}". Invoke the \`generate\` skill and follow it exactly. ` +
    `You may Read repo files (AGENTS.md, CONTEXT.md, docs/adr) for Praxis conventions, ` +
    `but do NOT attempt to write anything — a separate deterministic step writes the files.\n\n` +
    `Return ONLY the CourseSpec as your final message: a single fenced \`\`\`json code block, ` +
    `with no prose after it.${retry}\n\n=== SOURCE MATERIAL ===\n\n${corpus}`
  );
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
export async function generateCourse(label: string, sources: Extracted[]): Promise<GenerateResult> {
  const usable = sources.filter((s) => s.status === "ok" && s.content.trim());
  if (usable.length === 0) return { ok: false, error: "no readable source files (need .md/.txt/.docx)" };
  const corpus = usable.map((s) => `### FILE: ${s.name}\n\n${s.content}`).join("\n\n---\n\n");

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    broadcast("course_progress", { phase: "planning", attempt });
    let raw: string;
    try {
      raw = await runPlanner(driver(label, corpus, attempt === 2 ? lastError : null));
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
