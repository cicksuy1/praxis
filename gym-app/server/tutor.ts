// Tutor bridge (see CONTRACT.md). The app is a tunnel to the real AI-Native Gym
// conductor conversation (the praxis skill), scoped to a module: every module
// keeps its conversation — opening one starts or RESUMES that module's session
// (one live at a time; ids in .session.json). This module pipes the conductor's
// markdown turns over SSE, feeds learner input back, tees every turn into the
// per-module chat log, persists the session for `claude --resume`, and guards
// tool permissions. No grading — the conductor runs the course itself.
//
// The Agent SDK is imported lazily (only when a conversation actually starts) so
// the rest of the server and the test suite run without it installed.
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { repoRoot } from "./files.ts";
import { appendTurn } from "./chatlog.ts";
import { evaluateToolUse } from "./permissions.ts";
// Type-only import — erased at compile time, so the SDK stays lazily loaded.
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

const HEARTBEAT_MS = 25_000;
const MAX_TURNS = 200;
const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Skill", "Edit", "Write", "Bash"];
const VALID_MODELS = ["opus", "sonnet", "haiku"] as const;
export type Model = (typeof VALID_MODELS)[number];

const SESSION_FILE = path.join(import.meta.dir, "..", ".session.json");

/** Whether a value is an allowed model alias. */
export function isValidModel(model: unknown): model is Model {
  return typeof model === "string" && (VALID_MODELS as readonly string[]).includes(model);
}

// ===========================================================================
// SSE — client registry + broadcast (Bun.serve ReadableStream controllers)
// ===========================================================================

type Client = { controller: ReadableStreamDefaultController<Uint8Array>; heartbeat: ReturnType<typeof setInterval> };
const clients = new Set<Client>();
const encoder = new TextEncoder();

/** Broadcast an SSE event to all connected clients. */
export function broadcast(event: string, data: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
  const bytes = encoder.encode(frame);
  for (const client of clients) {
    try {
      client.controller.enqueue(bytes);
    } catch {
      // A dead stream is cleaned up by its cancel() handler; ignore here.
    }
  }
}

/** Build the SSE Response for GET /api/tutor/events. */
export function sseResponse(): Response {
  let self: Client;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          /* cancel() cleans up */
        }
      }, HEARTBEAT_MS);
      self = { controller, heartbeat };
      clients.add(self);
    },
    cancel() {
      clearInterval(self.heartbeat);
      clients.delete(self);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ===========================================================================
// Session record (pure helpers — exported for tests)
// ===========================================================================

export interface SessionRecord {
  current: string | null;
  model: Model | null;
  sessions: Record<string, string>;
}

/** Normalize whatever is on disk into the SessionRecord shape. */
export function normalizeSessionRecord(parsed: unknown): SessionRecord {
  const rec =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const sessions: Record<string, string> = {};
  if (rec.sessions && typeof rec.sessions === "object" && !Array.isArray(rec.sessions)) {
    for (const [slug, id] of Object.entries(rec.sessions as Record<string, unknown>)) {
      if (typeof id === "string" && id.length > 0) sessions[slug] = id;
    }
  } else if (typeof rec.slug === "string" && typeof rec.session_id === "string") {
    sessions[rec.slug] = rec.session_id;
  }
  const current =
    typeof rec.current === "string" ? rec.current : typeof rec.slug === "string" ? rec.slug : null;
  return { current, model: isValidModel(rec.model) ? rec.model : null, sessions };
}

/** Merge a patch into a SessionRecord (sessions merge; `forget` drops one). */
export function mergeSessionRecord(
  current: SessionRecord,
  patch: { current?: string | null; model?: Model | null; sessions?: Record<string, string>; forget?: string },
): SessionRecord {
  const sessions = { ...current.sessions, ...(patch.sessions ?? {}) };
  if (patch.forget) delete sessions[patch.forget];
  return {
    current: patch.current !== undefined ? patch.current : current.current,
    model: patch.model !== undefined ? patch.model : current.model,
    sessions,
  };
}

async function loadSession(): Promise<SessionRecord> {
  try {
    return normalizeSessionRecord(JSON.parse(await readFile(SESSION_FILE, "utf8")));
  } catch {
    return { current: null, model: null, sessions: {} };
  }
}

async function persistSession(patch: Parameters<typeof mergeSessionRecord>[1]): Promise<void> {
  try {
    const next = mergeSessionRecord(await loadSession(), patch);
    await writeFile(SESSION_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch (err) {
    console.error("tutor: failed to persist session:", (err as Error).message);
  }
}

// ===========================================================================
// Message formatting (pure — exported for tests)
// ===========================================================================

/** Render an absolute/relative path relative to the repo root for display. */
function relPath(p: unknown): string {
  if (typeof p !== "string" || !p) return "";
  return path.relative(repoRoot(), path.resolve(repoRoot(), p)).split(path.sep).join("/");
}

/** Format a tool_use block into a dimmed activity line for the GUI. */
export function formatToolActivity(block: { name?: string; input?: Record<string, unknown> }): string | null {
  const name = block?.name;
  const input = block?.input ?? {};
  switch (name) {
    case "Read":
      return `📖 Read ${relPath(input.file_path)}`;
    case "Glob":
      return `🔎 Glob ${input.pattern ?? ""}`.trim();
    case "Grep":
      return `🔎 Grep ${input.pattern ?? ""}`.trim();
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return `✏️ ${name} ${relPath(input.file_path)}`;
    case "Skill":
      return `🎓 Skill ${input.skill ?? input.name ?? ""}`.trim();
    default:
      return name ? `🛠️ ${name}` : null;
  }
}

/** Extract concatenated text from an assistant message content array. */
export function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ===========================================================================
// Per-module conversation host
// ===========================================================================

interface InputQueue {
  push: (text: string) => void;
  generator: () => AsyncGenerator<unknown>;
  close: () => void;
}

interface Host {
  slug: string;
  queue: InputQueue;
  gen: number;
  runner?: { interrupt?: () => Promise<void> };
  state: "starting" | "online" | "dead";
  sessionId: string | null;
  model: Model | null;
}

let host: Host | null = null;
let hostGen = 0;

function makeInputQueue(): InputQueue {
  const buffer: unknown[] = [];
  let notify: (() => void) | null = null;
  let closed = false;
  return {
    push(text: string) {
      buffer.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    },
    async *generator() {
      while (!closed) {
        if (buffer.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
          continue;
        }
        yield buffer.shift();
      }
    },
    close() {
      closed = true;
      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    },
  };
}

function initConversation(slug: string, { fresh }: { fresh: boolean }): Host {
  const queue = makeInputQueue();
  const gen = ++hostGen;
  const h: Host = { slug, queue, gen, runner: undefined, state: "starting", sessionId: null, model: null };

  const run = async () => {
    const persisted = await loadSession();
    const recorded = persisted.sessions[slug] ?? null;
    const canResume = !fresh && Boolean(recorded);
    if (fresh && recorded) await persistSession({ forget: slug });
    h.model = persisted.model;
    const startedFresh = !canResume;

    // Lazy import: the SDK only loads when a real conversation starts.
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const options: Record<string, unknown> = {
      cwd: repoRoot(),
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project", "local"],
      allowedTools: ALLOWED_TOOLS,
      includePartialMessages: true,
      canUseTool: async (toolName: string, input: Record<string, unknown>) =>
        evaluateToolUse(toolName, input),
      maxTurns: MAX_TURNS,
      permissionMode: "default",
    };
    if (persisted.model) options.model = persisted.model;
    if (canResume && recorded) options.resume = recorded;

    try {
      const runner = query({
        prompt: queue.generator() as AsyncGenerator<SDKUserMessage>,
        options,
      });
      h.runner = runner as Host["runner"];
      for await (const msg of runner as AsyncIterable<Record<string, unknown>>) {
        handleMessage(msg, startedFresh);
      }
    } catch (err) {
      console.error("tutor: conversation loop error:", (err as Error).message);
      broadcast("tutor_message", { text: "_(coach connection error — reconnecting on next action)_" });
      broadcast("tutor_idle", {});
    } finally {
      h.state = "dead";
      queue.close();
      if (host === h) host = null;
    }
  };

  function handleMessage(msg: Record<string, any>, startedFresh: boolean): void {
    if (msg.type === "system" && msg.subtype === "init") {
      if (msg.session_id) {
        const isNewId = msg.session_id !== h.sessionId;
        const isFirstInit = h.sessionId === null;
        h.sessionId = msg.session_id;
        if (isNewId) persistSession({ current: slug, sessions: { [slug]: msg.session_id } });
        if (isFirstInit) {
          broadcast("session_changed", { slug, sessionId: msg.session_id, model: h.model, fresh: startedFresh });
          console.log(`tutor session ${msg.session_id} (${slug}) — watch live: claude --resume ${msg.session_id}`);
        }
      }
      return;
    }
    if (msg.type === "stream_event") {
      const ev = msg.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        broadcast("tutor_partial", { text: ev.delta.text });
      }
      return;
    }
    if (msg.type === "assistant") {
      if (h.state !== "online") h.state = "online";
      const content = msg.message?.content;
      const text = extractText(content);
      if (text) {
        broadcast("tutor_message", { text });
        appendTurn(slug, { kind: "tutor", text, ts: Date.now() });
      }
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use") {
            const line = formatToolActivity(block);
            if (line) {
              broadcast("tool_activity", { text: line });
              appendTurn(slug, { kind: "activity", text: line, ts: Date.now() });
            }
          }
        }
      }
      return;
    }
    if (msg.type === "result") {
      if (typeof msg.total_cost_usd === "number") {
        broadcast("cost_update", { totalCostUsd: msg.total_cost_usd });
      }
      broadcast("tutor_idle", {}); // turn finished — clear the "thinking" indicator
    }
  }

  run();
  return h;
}

function switchModule(slug: string, fresh: boolean): { host: Host; reused: boolean } {
  if (host && host.state !== "dead" && host.slug === slug && !fresh) {
    return { host, reused: true };
  }
  if (host) {
    teardownHost(host);
    host = null;
  }
  host = initConversation(slug, { fresh });
  return { host, reused: false };
}

function teardownHost(h: Host): void {
  if (h.state === "dead") return;
  h.state = "dead";
  const runner = h.runner;
  if (runner && typeof runner.interrupt === "function") {
    Promise.resolve()
      .then(() => runner.interrupt!())
      .catch((err) => console.error("tutor: teardown interrupt failed:", (err as Error).message));
  }
  try {
    h.queue.close();
  } catch (err) {
    console.error("tutor: teardown queue close failed:", (err as Error).message);
  }
}

// ===========================================================================
// Public actions (called by routes.ts)
// ===========================================================================

const DRIVER_FRESH = (slug: string) =>
  `The learner opened module ${slug} in the GUI — read progress/NOTES.local.md, ` +
  `progress/PROGRESS.local.md, and progress/STRATEGY.local.md; apply the memory and coach ` +
  `skills (let the strategy set your recall lead, how hard you push the habit, pacing, and hints), ` +
  `then run the AGENTS.md read → drill → challenge → recall loop on it. Never grade or critique how they ` +
  `drove from self-report: when they report a drill done, invoke the spot skill to review their ` +
  `session transcript (ungraded — no scorecard, never graduation); when they report the challenge ` +
  `done, invoke verify first, then graduation for the pass. Your markdown renders directly to them.`;

const DRIVER_RESUME = (slug: string) =>
  `The learner re-opened module ${slug} — continue where you left off. ` +
  `Your markdown renders directly to them.`;

/** Start (or resume) a module's conversation and push the driver turn. */
export async function startSession(slug: string, fresh: boolean): Promise<void> {
  const willResume = !fresh && Boolean((await loadSession()).sessions[slug]);
  const { host: h, reused } = switchModule(slug, fresh);
  h.queue.push(reused || willResume ? DRIVER_RESUME(slug) : DRIVER_FRESH(slug));
}

/** Push a learner turn into the live conversation. Returns false if none alive. */
export function pushInput(text: string): boolean {
  if (!host || host.state === "dead") return false;
  host.queue.push(text);
  appendTurn(host.slug, { kind: "learner", text, ts: Date.now() });
  return true;
}

/** Persist the conductor model (applies on the next conversation start). */
export async function setModel(model: Model): Promise<void> {
  await persistSession({ model });
}

export interface TutorStatus {
  state: "starting" | "online" | "dead";
  sessionId: string | null;
  slug: string | null;
  model: Model | null;
}

export function getTutorStatus(): TutorStatus {
  if (!host) return { state: "dead", sessionId: null, slug: null, model: null };
  return { state: host.state, sessionId: host.sessionId, slug: host.slug, model: host.model };
}

/** Warm the learner's current module on boot if it has a recorded session. */
export async function startTutor(allowed: string[]): Promise<void> {
  const persisted = await loadSession();
  const current = persisted.current;
  if (!current || !allowed.includes(current) || !persisted.sessions[current]) return;
  if (host && host.state !== "dead") return;
  const { host: h } = switchModule(current, false);
  h.queue.push(DRIVER_RESUME(current));
}

/** Backstop: when a module is detected complete, nudge the conductor to close out. */
export function notifyModuleComplete(slug: string): void {
  if (!host || host.state === "dead") return;
  host.queue.push(
    `Module ${slug} is complete — run the coach close-out now: ask the learner the short ` +
      `reflection, refresh progress/STRATEGY.local.md, and write your memory notes block to ` +
      `progress/NOTES.local.md, then continue.`,
  );
}
