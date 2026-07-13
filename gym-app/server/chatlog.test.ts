import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendTurn, readTurns, setChatsDir } from "./chatlog.ts";

const created: string[] = [];

function tempChats(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "gym-chats-"));
  created.push(dir);
  setChatsDir(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("chatlog", () => {
  test("append then read round-trips turns in order", async () => {
    tempChats();
    await appendTurn("harness", { kind: "tutor", text: "Welcome.", ts: 1 });
    await appendTurn("harness", { kind: "learner", text: "Hi.", ts: 2 });
    await appendTurn("harness", { kind: "activity", text: "📖 Read x", ts: 3 });
    const turns = await readTurns("harness");
    expect(turns).toEqual([
      { kind: "tutor", text: "Welcome.", ts: 1 },
      { kind: "learner", text: "Hi.", ts: 2 },
      { kind: "activity", text: "📖 Read x", ts: 3 },
    ]);
  });

  test("missing log reads as empty", async () => {
    tempChats();
    expect(await readTurns("never-written")).toEqual([]);
  });

  test("keeps modules' logs separate", async () => {
    tempChats();
    await appendTurn("harness", { kind: "tutor", text: "A", ts: 1 });
    await appendTurn("verify", { kind: "tutor", text: "B", ts: 1 });
    expect(await readTurns("harness")).toHaveLength(1);
    expect((await readTurns("verify"))[0]!.text).toBe("B");
  });

  test("tolerates a torn trailing line", async () => {
    const dir = tempChats();
    const good = JSON.stringify({ kind: "tutor", text: "ok", ts: 1 });
    writeFileSync(path.join(dir, "harness.jsonl"), `${good}\n{"kind":"tutor","te`, "utf8");
    const turns = await readTurns("harness");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("ok");
  });
});
