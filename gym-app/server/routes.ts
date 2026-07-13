// API request dispatch (see CONTRACT.md). A single handler maps method + path to
// content/progress/tutor logic and returns a Response with the standard envelope.
// Returns null for non-API requests so index.ts can fall back to static files.
import { allSlugs, parseCurriculum, getLesson, getDrill, getChallenge } from "./content.ts";
import { readProgress } from "./progress.ts";
import { readTurns } from "./chatlog.ts";
import {
  sseResponse,
  getTutorStatus,
  startSession,
  pushInput,
  setModel,
  isValidModel,
  broadcast,
} from "./tutor.ts";
import { ingestDir } from "./generator/ingest.ts";
import { generateCourse } from "./generator/session.ts";
import { emitCourse } from "./generator/emit.ts";
import { scanResources, browseDir, resolveSourceDir } from "./generator/intake.ts";
import { listCourses, registerCourse, selectCourse, deleteCourse } from "./courses.ts";

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (error: string) => ({ success: false, data: null, error });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Build the curriculum payload shaped per the contract. */
function curriculumPayload() {
  return { modules: parseCurriculum() };
}

/**
 * Ingest → plan → emit a Course, streaming progress over SSE. Fire-and-forget:
 * the endpoint returns 202 immediately and the client watches the event stream.
 */
async function runCourseBuild(sourceDir: string, label: string): Promise<void> {
  try {
    broadcast("course_progress", { phase: "ingesting" });
    const sources = await ingestDir(sourceDir);
    const okCount = sources.filter((s) => s.status === "ok").length;
    broadcast("course_progress", { phase: "ingested", files: sources.length, ok: okCount });

    const gen = await generateCourse(label, sources);
    if (!gen.ok || !gen.spec) {
      broadcast("course_error", { error: gen.error ?? "generation failed" });
      return;
    }

    broadcast("course_progress", { phase: "emitting", modules: gen.spec.modules.length });
    const result = await emitCourse(gen.spec);
    if (!result.ok || !result.slug) {
      broadcast("course_error", { error: result.error ?? "emit failed" });
      return;
    }
    await registerCourse({
      slug: result.slug,
      label: gen.spec.label,
      moduleCount: result.modules,
      createdAt: new Date().toISOString(),
    });
    await selectCourse(result.slug); // make the new course active (mirror to root)

    broadcast("course_done", {
      label: gen.spec.label,
      slug: result.slug,
      modules: result.modules,
      firstSlug: gen.spec.modules[0]?.slug ?? null,
    });
    broadcast("progress_changed", {}); // nudge the UI to re-fetch curriculum/progress
  } catch (e) {
    broadcast("course_error", { error: (e as Error).message });
  }
}

/**
 * Dispatch an API request. Returns a Response for any `/api/*` path, or null for
 * anything else (so the caller serves static files / the SPA shell).
 */
export async function handleApi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const { pathname } = url;
  if (!pathname.startsWith("/api/")) return null;

  const method = req.method.toUpperCase();
  const seg = pathname.split("/").filter(Boolean); // ["api", ...]

  // ---- content + health (GET) --------------------------------------------
  if (method === "GET" && pathname === "/api/health") return json(ok({ status: "ok" }));
  if (method === "GET" && pathname === "/api/curriculum") {
    try {
      return json(ok(curriculumPayload()));
    } catch (err) {
      return json(fail((err as Error).message), 500);
    }
  }
  if (method === "GET" && pathname === "/api/progress") {
    try {
      return json(ok(readProgress()));
    } catch (err) {
      return json(fail((err as Error).message), 500);
    }
  }
  if (method === "GET" && seg[1] === "lesson" && seg[2]) {
    const slug = decodeURIComponent(seg[2]);
    if (!allSlugs().includes(slug)) return json(fail(`unknown module slug: ${slug}`), 404);
    return json(ok(getLesson(slug)));
  }
  if (method === "GET" && seg[1] === "drill" && seg[2]) {
    const slug = decodeURIComponent(seg[2]);
    if (!allSlugs().includes(slug)) return json(fail(`unknown module slug: ${slug}`), 404);
    return json(ok(getDrill(slug)));
  }
  if (method === "GET" && seg[1] === "challenge" && seg[2]) {
    const slug = decodeURIComponent(seg[2]);
    if (!allSlugs().includes(slug)) return json(fail(`unknown module slug: ${slug}`), 404);
    return json(ok(getChallenge(slug)));
  }

  // ---- course generation (Generator homepage) -----------------------------
  if (method === "GET" && pathname === "/api/resources") {
    try {
      return json(ok({ folders: await scanResources() }));
    } catch (err) {
      return json(fail((err as Error).message), 500);
    }
  }
  if (method === "GET" && pathname === "/api/browse") {
    try {
      const target = url.searchParams.get("path") ?? undefined;
      return json(ok(await browseDir(target)));
    } catch (err) {
      return json(fail((err as Error).message), 500);
    }
  }
  if (seg[1] === "course" && method === "POST" && seg[2] === "generate") {
    const body = await readJsonBody(req);
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const rawDir = typeof body.sourceDir === "string" ? body.sourceDir : "";
    if (!label) return json(fail("label is required"), 400);
    const sourceDir = resolveSourceDir(rawDir);
    if (!sourceDir) return json(fail("sourceDir must be a folder inside the browse root"), 400);
    void runCourseBuild(sourceDir, label);
    return json(ok({ accepted: true }), 202);
  }

  // ---- course library -----------------------------------------------------
  if (method === "GET" && pathname === "/api/courses") {
    return json(ok({ courses: await listCourses() }));
  }
  if (seg[1] === "courses" && seg[2] === "select" && method === "POST") {
    const body = await readJsonBody(req);
    const slug = typeof body.slug === "string" ? body.slug : "";
    const r = await selectCourse(slug);
    if (!r.ok) return json(fail(r.error ?? "select failed"), 404);
    broadcast("progress_changed", {});
    return json(ok({ active: slug }));
  }
  if (seg[1] === "courses" && seg[2] && seg[2] !== "select" && method === "DELETE") {
    return json(ok({ deleted: await deleteCourse(decodeURIComponent(seg[2])) }));
  }

  // ---- tutor --------------------------------------------------------------
  if (seg[1] === "tutor") {
    if (method === "GET" && seg[2] === "events") return sseResponse();
    if (method === "GET" && seg[2] === "status") return json(ok(getTutorStatus()));
    if (method === "GET" && seg[2] === "history" && seg[3]) {
      const slug = decodeURIComponent(seg[3]);
      if (!allSlugs().includes(slug)) return json(fail(`unknown module: ${slug}`), 404);
      return json(ok({ turns: await readTurns(slug) }));
    }
    if (method === "POST" && seg[2] === "session" && seg[3] === "start") {
      const body = await readJsonBody(req);
      const slug = body.slug;
      if (typeof slug !== "string" || !allSlugs().includes(slug)) {
        return json(fail(`unknown module: ${String(slug)}`), 404);
      }
      await startSession(slug, body.fresh === true);
      return json(ok({ accepted: true }), 202);
    }
    if (method === "POST" && seg[2] === "session" && seg[3] === "input") {
      const body = await readJsonBody(req);
      if (typeof body.text !== "string" || body.text.length === 0) {
        return json(fail("text is required"), 400);
      }
      if (!pushInput(body.text)) {
        return json(fail("no live conversation; start a module first"), 409);
      }
      return json(ok({ accepted: true }), 202);
    }
    if (method === "POST" && seg[2] === "model") {
      const body = await readJsonBody(req);
      if (!isValidModel(body.model)) {
        return json(fail("model must be one of: opus, sonnet, haiku"), 400);
      }
      await setModel(body.model);
      return json(ok({ model: body.model, appliesOn: "next_session" }));
    }
  }

  return json(fail(`no such endpoint: ${method} ${pathname}`), 404);
}
