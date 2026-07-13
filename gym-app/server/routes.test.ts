import { test, expect, describe } from "bun:test";
import { handleApi } from "./routes.ts";

// Run against the real repo content (GYM_REPO_ROOT unset). The /api/progress
// test triggers a first-read copy of PROGRESS.template.md → PROGRESS.local.md,
// which is gitignored learner state (the intended first-run behavior).

const GET = (p: string) => new Request(`http://localhost:4600${p}`);
const POST = (p: string, body: unknown) =>
  new Request(`http://localhost:4600${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function body(res: Response): Promise<any> {
  return res.json();
}

describe("content routes", () => {
  test("GET /api/health", async () => {
    const res = (await handleApi(GET("/api/health")))!;
    expect(res.status).toBe(200);
    expect((await body(res)).data.status).toBe("ok");
  });

  test("GET /api/curriculum returns 13 modules", async () => {
    const res = (await handleApi(GET("/api/curriculum")))!;
    const json = await body(res);
    expect(json.success).toBe(true);
    expect(json.data.modules).toHaveLength(13);
  });

  test("GET /api/progress returns an envelope with current", async () => {
    const res = (await handleApi(GET("/api/progress")))!;
    const json = await body(res);
    expect(json.success).toBe(true);
    expect(typeof json.data.current).toBe("string");
  });

  test("GET /api/lesson/:slug for a real module", async () => {
    const res = (await handleApi(GET("/api/lesson/harness")))!;
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json.data.slug).toBe("harness");
    expect(json.data.recallQuestions.length).toBeGreaterThan(0);
  });

  test("GET /api/lesson/:slug 404 for unknown slug", async () => {
    const res = (await handleApi(GET("/api/lesson/bogus")))!;
    expect(res.status).toBe(404);
    expect((await body(res)).success).toBe(false);
  });

  test("GET /api/drill/:slug returns brief markdown", async () => {
    const res = (await handleApi(GET("/api/drill/planning")))!;
    const json = await body(res);
    expect(json.data.markdown).toContain("Warm-up");
  });

  test("GET /api/challenge/:slug returns mission + scorecard", async () => {
    const res = (await handleApi(GET("/api/challenge/verify")))!;
    const json = await body(res);
    expect(json.data.mission.length).toBeGreaterThan(0);
    expect(json.data.scorecard).toContain("Scorecard");
  });
});

describe("tutor routes (no live SDK)", () => {
  test("GET /api/tutor/status is dead with no host", async () => {
    const res = (await handleApi(GET("/api/tutor/status")))!;
    expect((await body(res)).data.state).toBe("dead");
  });

  test("POST session/start with unknown slug → 404 (never starts SDK)", async () => {
    const res = (await handleApi(POST("/api/tutor/session/start", { slug: "nope" })))!;
    expect(res.status).toBe(404);
  });

  test("POST session/input with no text → 400", async () => {
    const res = (await handleApi(POST("/api/tutor/session/input", {})))!;
    expect(res.status).toBe(400);
  });

  test("POST session/input with text but no host → 409", async () => {
    const res = (await handleApi(POST("/api/tutor/session/input", { text: "hi" })))!;
    expect(res.status).toBe(409);
  });

  test("POST model with invalid value → 400", async () => {
    const res = (await handleApi(POST("/api/tutor/model", { model: "gpt" })))!;
    expect(res.status).toBe(400);
  });

  test("GET history for unknown slug → 404", async () => {
    const res = (await handleApi(GET("/api/tutor/history/nope")))!;
    expect(res.status).toBe(404);
  });
});

describe("dispatch edges", () => {
  test("non-api path returns null (static fallback)", async () => {
    expect(await handleApi(GET("/index.html"))).toBeNull();
  });

  test("unknown api endpoint → 404 envelope", async () => {
    const res = (await handleApi(GET("/api/nope")))!;
    expect(res.status).toBe(404);
    expect((await body(res)).success).toBe(false);
  });
});
