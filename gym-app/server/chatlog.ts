// Per-module chat logs (see CONTRACT.md "Chat logs"). The server tees every turn
// it broadcasts into gym-app/.chats/<slug>.jsonl: one JSON object per line —
// { kind: 'tutor'|'learner'|'activity', text, ts }. Appends are fire-and-forget
// (errors logged, never thrown); readers tolerate a torn trailing line. The dir
// is gitignored, created lazily, overridable via GYM_CHATS_DIR for tests.
import { appendFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type TurnKind = "tutor" | "learner" | "activity";
export interface Turn {
  kind: TurnKind;
  text: string;
  ts: number;
}

let override: string | null = null;

function chatsDir(): string {
  if (override) return override;
  if (process.env.GYM_CHATS_DIR) return path.resolve(process.env.GYM_CHATS_DIR);
  return path.join(import.meta.dir, "..", ".chats");
}

/** Override the chats base dir (tests). */
export function setChatsDir(dir: string): void {
  override = path.resolve(dir);
}

function logFileFor(slug: string): string {
  return path.join(chatsDir(), `${slug}.jsonl`);
}

/**
 * Append one turn to the module's chat log. Fire-and-forget: any IO error is
 * logged and swallowed so a logging failure never breaks the conversation pipe.
 */
export async function appendTurn(slug: string, turn: Turn): Promise<void> {
  try {
    await mkdir(chatsDir(), { recursive: true });
    const line = `${JSON.stringify({ kind: turn.kind, text: turn.text, ts: turn.ts })}\n`;
    await appendFile(logFileFor(slug), line, "utf8");
  } catch (err) {
    console.error(`chatlog: failed to append turn for ${slug}:`, (err as Error).message);
  }
}

/**
 * Read all turns for a module. Missing file → []. A corrupt/partial trailing
 * line (or any unparseable line) is skipped rather than throwing.
 */
export async function readTurns(slug: string): Promise<Turn[]> {
  let raw: string;
  try {
    raw = await readFile(logFileFor(slug), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error(`chatlog: failed to read turns for ${slug}:`, (err as Error).message);
    return [];
  }

  const turns: Turn[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      turns.push(JSON.parse(line) as Turn);
    } catch {
      // Tolerate a torn/partial trailing line: skip it.
    }
  }
  return turns;
}
