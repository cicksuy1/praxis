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
import { generateCourse, DEFAULT_BUDGET_TOKENS } from "./generator/session.ts";
import { emitCourse } from "./generator/emit.ts";
import { scanResources, browseDir, resolveSourceDir } from "./generator/intake.ts";
import { listCourses, registerCourse, selectCourse, deleteCourse } from "./courses.ts";
import type { Mode, CourseSpec } from "./generator/schema.ts";
import {
  createDraft,
  getDraft,
  listDrafts,
  patchDraft,
  markEmitted,
  deleteDraft,
} from "./generator/drafts.ts";

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
 * Ingest → plan → persist a proposal (ADR-0012). Fire-and-forget over SSE: the endpoint
 * returns 202 and the client watches for `course_proposed` (carrying the draft id). No
 * files are written to the library until the user confirms the draft.
 */
async function runCourseProposal(
  sourceDir: string,
  label: string,
  mode: Mode,
  budgetTokens: number,
): Promise<void> {
  try {
    broadcast("course_progress", { phase: "ingesting", mode });
    const sources = await ingestDir(sourceDir);
    const okCount = sources.filter((s) => s.status === "ok").length;
    broadcast("course_progress", { phase: "ingested", files: sources.length, ok: okCount });

    const gen = await generateCourse(label, sources, { mode, budgetTokens });
    if (!gen.ok || !gen.spec) {
      broadcast("course_error", { error: gen.error ?? "generation failed" });
      return;
    }

    const draft = await createDraft({
      label: gen.spec.label,
      mode: gen.spec.mode,
      budgetTokens,
      sourceDir,
      spec: gen.spec,
    });
    broadcast("course_proposed", {
      draftId: draft.id,
      label: draft.label,
      mode: draft.mode,
      modules: gen.spec.modules.length,
    });
  } catch (e) {
    broadcast("course_error", { error: (e as Error).message });
  }
}

/** Re-plan an existing draft from its stored inputs, replacing the proposed spec. */
async function runCourseRegenerate(id: string): Promise<void> {
  try {
    const draft = await getDraft(id);
    if (!draft) return;
    broadcast("course_progress", { phase: "ingesting", mode: draft.mode });
    const sources = await ingestDir(draft.sourceDir);
    const gen = await generateCourse(draft.label, sources, {
      mode: draft.mode,
      budgetTokens: draft.budgetTokens,
    });
    if (!gen.ok || !gen.spec) {
      broadcast("course_error", { error: gen.error ?? "generation failed" });
      return;
    }
    await patchDraft(id, { label: gen.spec.label, spec: gen.spec });
    broadcast("course_proposed", {
      draftId: id,
      label: gen.spec.label,
      mode: gen.spec.mode,
      modules: gen.spec.modules.length,
    });
  } catch (e) {
    broadcast("course_error", { error: (e as Error).message });
  }
}

/**
 * Confirm-gated emit: write a proposed draft to the Course library, make it active, and
 * mark the draft emitted. Synchronous (no model call) — returns the emitted slug.
 */
async function confirmDraft(
  id: string,
): Promise<{ ok: boolean; error?: string; slug?: string; modules?: number; firstSlug?: string | null; label?: string }> {
  const draft = await getDraft(id);
  if (!draft) return { ok: false, error: `draft not found: ${id}` };

  const result = await emitCourse(draft.spec);
  if (!result.ok || !result.slug) return { ok: false, error: result.error ?? "emit failed" };

  await registerCourse({
    slug: result.slug,
    label: draft.spec.label,
    moduleCount: result.modules,
    createdAt: new Date().toISOString(),
  });
  await selectCourse(result.slug); // make the new course active (mirror to root)
  await markEmitted(id, result.slug);

  const firstSlug = draft.spec.modules[0]?.slug ?? null;
  broadcast("course_done", { label: draft.spec.label, slug: result.slug, modules: result.modules, firstSlug });
  broadcast("progress_changed", {}); // nudge the UI to re-fetch curriculum/progress
  return { ok: true, slug: result.slug, modules: result.modules, firstSlug, label: draft.spec.label };
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
    const mode: Mode = body.mode === "guide" ? "guide" : "author";
    const budgetTokens =
      typeof body.budgetTokens === "number" && body.budgetTokens > 0 ? body.budgetTokens : undefined;
    void runCourseProposal(sourceDir, label, mode, budgetTokens ?? DEFAULT_BUDGET_TOKENS);
    return json(ok({ accepted: true, mode }), 202);
  }

  // ---- generation drafts (proposal page, ADR-0012) ------------------------
  if (seg[1] === "drafts") {
    if (method === "GET" && !seg[2]) return json(ok({ drafts: await listDrafts() }));
    if (seg[2]) {
      const id = decodeURIComponent(seg[2]);
      if (method === "GET" && !seg[3]) {
        const draft = await getDraft(id);
        return draft ? json(ok({ draft })) : json(fail(`draft not found: ${id}`), 404);
      }
      if (method === "PATCH" && !seg[3]) {
        const body = await readJsonBody(req);
        const patch: { label?: string; spec?: CourseSpec; budgetTokens?: number } = {};
        if (typeof body.label === "string") patch.label = body.label.trim();
        if (body.spec && typeof body.spec === "object") patch.spec = body.spec as CourseSpec;
        if (typeof body.budgetTokens === "number") patch.budgetTokens = body.budgetTokens;
        const r = await patchDraft(id, patch);
        return r.ok ? json(ok({ draft: r.draft })) : json(fail(r.error), 400);
      }
      if (method === "POST" && seg[3] === "confirm") {
        const r = await confirmDraft(id);
        if (!r.ok) return json(fail(r.error ?? "confirm failed"), r.error?.startsWith("draft not found") ? 404 : 400);
        return json(ok({ slug: r.slug, modules: r.modules, firstSlug: r.firstSlug, label: r.label }));
      }
      if (method === "POST" && seg[3] === "regenerate") {
        if (!(await getDraft(id))) return json(fail(`draft not found: ${id}`), 404);
        void runCourseRegenerate(id);
        return json(ok({ accepted: true }), 202);
      }
      if (method === "DELETE" && !seg[3]) {
        return json(ok({ deleted: await deleteDraft(id) }));
      }
    }
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
