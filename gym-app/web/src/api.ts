// Thin REST + SSE client for the gym-app API. Every REST response uses the
// { success, data, error } envelope; unwrap() returns data or throws.

export interface Module {
  number: number;
  title: string;
  slug: string;
  principle: string;
  written: boolean;
  hasExercise: boolean;
  isSpine: boolean;
}

export interface CompletedRow {
  number: number;
  module: string;
  passedOn: string;
  scorecard: string;
}

export interface Progress {
  current: string;
  started: string;
  completed: CompletedRow[];
}

export interface Lesson {
  slug: string;
  markdown: string;
  recallQuestions: string[];
  hasDrill: boolean;
  hasChallenge: boolean;
}

export interface Challenge {
  slug: string;
  mission: string;
  scorecard: string;
}

export interface Turn {
  kind: "tutor" | "learner" | "activity";
  text: string;
  ts: number;
}

export interface ResourceFolder {
  name: string;
  path: string;
  fileCount: number;
}

export interface BrowseEntry {
  name: string;
  path: string;
  fileCount: number;
}

export interface BrowseResult {
  root: string;
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface CourseEntry {
  slug: string;
  label: string;
  moduleCount: number;
  createdAt: string;
}

export interface TutorStatus {
  state: "starting" | "online" | "dead";
  sessionId: string | null;
  slug: string | null;
  model: string | null;
}

export type Mode = "guide" | "author";
export type Coverage = "internalise" | "reference";

/** Where a guide-mode resource was sliced from — shown for context on the proposal. */
export type Locator =
  | { kind: "heading"; headingPath: string[]; line: number }
  | { kind: "page"; page: number };

/** A proposed Module (mirrors server ModuleSpec). Exactly one of resource | lesson. */
export interface DraftModule {
  number: number;
  slug: string;
  title: string;
  principle: string;
  archetype: "runnable" | "inspectable" | "attested" | "explanation";
  coverage: Coverage;
  locator?: Locator;
  resource?: string;
  lesson?: string;
  challenge?: string;
  recall: string[];
}

export interface DraftSpec {
  label: string;
  mode: Mode;
  modules: DraftModule[];
  sandbox: null;
}

/** A persisted proposal (mirrors server Draft) — the editable, refresh-safe plan. */
export interface Draft {
  id: string;
  label: string;
  mode: Mode;
  budgetTokens: number;
  sourceDir: string;
  status: "proposed" | "emitted";
  createdAt: string;
  updatedAt: string;
  emittedSlug?: string;
  spec: DraftSpec;
}

type Envelope<T> = { success: boolean; data: T | null; error: string | null };

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as Envelope<T>;
  if (!body.success || body.data === null) {
    throw new Error(body.error ?? `request failed (${res.status})`);
  }
  return body.data;
}

export const api = {
  curriculum: () => fetch("/api/curriculum").then((r) => unwrap<{ modules: Module[] }>(r)),
  progress: () => fetch("/api/progress").then((r) => unwrap<Progress>(r)),
  lesson: (slug: string) => fetch(`/api/lesson/${slug}`).then((r) => unwrap<Lesson>(r)),
  drill: (slug: string) =>
    fetch(`/api/drill/${slug}`).then(async (r) => {
      const body = (await r.json()) as Envelope<{ slug: string; markdown: string } | null>;
      return body.data; // null when no drill
    }),
  challenge: (slug: string) =>
    fetch(`/api/challenge/${slug}`).then(async (r) => {
      const body = (await r.json()) as Envelope<Challenge | null>;
      return body.data;
    }),
  status: () => fetch("/api/tutor/status").then((r) => unwrap<TutorStatus>(r)),
  history: (slug: string) =>
    fetch(`/api/tutor/history/${slug}`).then((r) => unwrap<{ turns: Turn[] }>(r)),
  startSession: (slug: string, fresh = false) =>
    fetch("/api/tutor/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, fresh }),
    }),
  sendInput: (text: string) =>
    fetch("/api/tutor/session/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  setModel: (model: string) =>
    fetch("/api/tutor/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    }),
  resources: () => fetch("/api/resources").then((r) => unwrap<{ folders: ResourceFolder[] }>(r)),
  browse: (dir?: string) =>
    fetch(`/api/browse${dir ? `?path=${encodeURIComponent(dir)}` : ""}`).then((r) => unwrap<BrowseResult>(r)),
  generateCourse: (sourceDir: string, label: string, mode: Mode, budgetTokens?: number) =>
    fetch("/api/course/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceDir, label, mode, budgetTokens }),
    }),
  courses: () => fetch("/api/courses").then((r) => unwrap<{ courses: CourseEntry[] }>(r)),
  selectCourse: (slug: string) =>
    fetch("/api/courses/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }),
  deleteCourse: (slug: string) => fetch(`/api/courses/${encodeURIComponent(slug)}`, { method: "DELETE" }),

  // Generation drafts (proposal page, ADR-0012).
  getDraft: (id: string) =>
    fetch(`/api/drafts/${encodeURIComponent(id)}`).then((r) => unwrap<{ draft: Draft }>(r)).then((d) => d.draft),
  patchDraft: (id: string, patch: { label?: string; spec?: DraftSpec; budgetTokens?: number }) =>
    fetch(`/api/drafts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => unwrap<{ draft: Draft }>(r)).then((d) => d.draft),
  confirmDraft: (id: string) =>
    fetch(`/api/drafts/${encodeURIComponent(id)}/confirm`, { method: "POST" }).then((r) =>
      unwrap<{ slug: string; modules: number; firstSlug: string | null; label: string }>(r),
    ),
  regenerateDraft: (id: string) =>
    fetch(`/api/drafts/${encodeURIComponent(id)}/regenerate`, { method: "POST" }),
  deleteDraft: (id: string) => fetch(`/api/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** Subscribe to the SSE event stream. Returns an unsubscribe fn. */
export function subscribe(handlers: Record<string, (data: any) => void>): () => void {
  const es = new EventSource("/api/tutor/events");
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => {
      try {
        fn(JSON.parse((e as MessageEvent).data));
      } catch {
        fn({});
      }
    });
  }
  return () => es.close();
}
